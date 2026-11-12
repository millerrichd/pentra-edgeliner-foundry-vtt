/**
 * Listeners on the core system's extension points (and a few Foundry hooks) that put Edgeliner's rules into every
 * check, hit and rest.
 */
import { PENTRA, Rolls } from "./core.js";
import { TYPES, POWER_SKILLS, EDGELINER } from "./config.js";
import { smartgunRelief, chippedRank, stepDie } from "./rules.js";
import { activeCyber } from "./documents.js";
import { onPreCreateDrone, onPreUpdateDrone } from "./drones.js";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const signed = n => (n > 0 ? `+${n}` : `${n}`);

/** Working implants on the actor. */
const working = actor => actor?.items?.filter(i => i.type === TYPES.cyberware && i.system.active) ?? [];

/**
 * pentraRollCheck: adjust a check just before it's rolled.
 *  - Power checks: -1 per implant point installed.
 *  - Skill chips: a slotted chip raises its skill to rank 2.
 *  - Advantage from implants (skills of an attribute, a resistance).
 *  - Smartgun Jack: ignore up to 2 points of range/cover penalty with firearms.
 *  - Bone Spurs: +1 wound on Martial Arts attacks. Muscle Enhancements: a reminder on melee hits.
 */
export function onRollCheck(actor, ctx) {
  const { desc, spec, isAttack, isRanged } = ctx;
  const add = (value, label) => {
    if (!value) return;
    ctx.modifier += value;
    ctx.parts.push(`${label} ${signed(value)}`);
  };

  // Powers: cybernetics are dampeners on the mind. Applies to every check made with the Power attribute.
  if (desc.attrKey === "power" && !desc.isResistance) {
    const used = actor.system.strain?.used ?? 0;
    add(-used, loc("EDGELINER.Strain.PowerPenalty"));
  }

  const cyber = working(actor);
  if (!cyber.length) return;
  const skillAttr = desc.skillKey ? PENTRA.skills[desc.skillKey]?.attribute : (spec.type === "language" ? "knowledge" : null);

  // Skill chips (in a working chip system).
  if (desc.skillKey && cyber.some(c => c.system.effect === "chipSystem")) {
    const chip = cyber.find(c => c.system.effect === "skillChip" && c.system.slotted && c.system.skill === desc.skillKey);
    if (chip && chippedRank(ctx.skillValue) > ctx.skillValue) {
      ctx.skillValue = chippedRank(ctx.skillValue);
      ctx.parts.push(fmt("EDGELINER.Chip.Applied", { name: chip.name, rank: ctx.skillValue }));
    }
  }

  for (const c of cyber) {
    const s = c.system;
    const skillAdv = s.effect === "skillAdvantage" && skillAttr && skillAttr === s.attribute && !desc.isResistance;
    const resistAdv = s.effect === "resistAdvantage" && desc.isResistance && desc.attrKey === s.resistance;
    if (skillAdv || resistAdv) {
      ctx.advantages += 1;
      ctx.parts.push(fmt("EDGELINER.Cyber.Advantage", { name: c.name }));
    }
  }

  if (isAttack && isRanged && spec.weapon?.system.skill === "shooting" && activeCyber(actor, "smartgun")) {
    add(smartgunRelief(ctx.rangeCover), loc("EDGELINER.Cyber.Smartgun"));
  }
  if (isAttack && spec.unarmed) {
    const spurs = activeCyber(actor, "boneSpurs");
    if (spurs) {
      ctx.woundBonus += 1;
      ctx.parts.push(fmt("EDGELINER.Cyber.SpursNote", { name: spurs.name }));
    }
  }
  if (isAttack && !isRanged) {
    const muscle = activeCyber(actor, "muscle");
    if (muscle) ctx.parts.push(fmt("EDGELINER.Cyber.MuscleNote", { name: muscle.name }));
  }
}

/** pentraNeedsAir: Awakened AI don't breathe; Amphibious Modification breathes water. */
export function onNeedsAir(actor) {
  if (actor.system?.noBreath || activeCyber(actor, "amphibious")) return false;
}

/**
 * pentraWoundsApplied: Subdermal Armor makes its own usage check (1 to the wounds before armor) when struck,
 * like worn armor. Runs on the client that applied the damage.
 */
export async function onWoundsApplied(actor, { wounds, direct }) {
  if (direct || wounds <= 0 || !actor.isOwner) return;
  const plates = actor.items.find(i => i.type === TYPES.cyberware && i.system.effect === "subdermal" && (i.system.usage ?? 0) > 0);
  if (!plates) return;
  await Rolls.rollUsage({
    actor, label: plates.name, die: plates.system.usage, range: wounds,
    note: loc("EDGELINER.Cyber.SubdermalNote"),
    onReduce: next => plates.update({ "system.usage": next })
  });
}

/** pentraRest: a night of rest recovers all lost Drain. */
export async function onRest(actor) {
  const drain = actor.system.drainDie;
  if (!drain || drain.value >= drain.max) return;
  await actor.update({ "system.drainDie.value": drain.max }, { pentraMechanic: true });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="pentra chat-card"><p><i class="fa-solid fa-moon"></i> ${fmt("EDGELINER.Drain.Rested", {
      name: foundry.utils.escapeHTML(actor.name), die: `d${drain.max}`
    })}</p></div>`
  });
}

/** Subdermal Armor's usage die resets once all wounds are healed. */
export function onUpdateActor(actor, changed, options, userId) {
  if (userId !== game.user.id || !foundry.utils.hasProperty(changed, "system.health.value")) return;
  const { value, max } = actor.system.health ?? {};
  if (!(value >= max)) return;
  const die = actor.system.durabilityDie?.value ?? 8;
  const plates = actor.items.filter(i => i.type === TYPES.cyberware && i.system.effect === "subdermal" && i.system.usage !== die);
  if (plates.length) actor.updateEmbeddedDocuments("Item", plates.map(i => ({ _id: i.id, "system.usage": die })));
}

/**
 * Players can only put points into the Power skills of their own tradition (with its Power talent), and an
 * Awakened AI's Power stays at d12+0. The GM is never blocked.
 */
export function onPreUpdateActor(actor, changed, options, userId) {
  if (actor.type !== "character" || options.pentraBypass || game.users.get(userId)?.isGM) return;
  const skills = changed.system?.skills ?? {};
  const prev = actor._source.system.skills;
  const tradition = actor.system.powerTradition;
  for (const [key, value] of Object.entries(skills)) {
    const info = POWER_SKILLS[key];
    if (!info || !(value > (prev[key] ?? 0))) continue;
    if (info.category !== tradition) {
      ui.notifications.warn(fmt("EDGELINER.Power.SkillLocked", { skill: loc(PENTRA.skills[key].label), tradition: loc(EDGELINER.powerCategories[info.category].label) }));
      actor.sheet?.render();
      return false;
    }
  }
  const rank = changed.system?.attributes?.power?.rank;
  if (actor.system.noPowers && rank > 0) {
    ui.notifications.warn(fmt("EDGELINER.Power.NoPowerAttribute", { name: actor.name }));
    actor.sheet?.render();
    return false;
  }
}

/** Everyone on Xethos speaks Corporate Trade: a new character's native language is named for it. */
export function onPreCreateActor(actor, data) {
  if (actor.type !== "character") return;
  const langs = actor._source.system?.languages ?? [];
  if (langs.length === 1 && langs[0].native && langs[0].name === loc("PENTRA.NativeLanguage")) {
    actor.updateSource({ "system.languages": [{ ...langs[0], name: loc("EDGELINER.CorporateTrade") }] });
  }
}

/** Drain Die: centering for 10 minutes recovers one die size. */
export async function center(actor) {
  const { value, max } = actor.system.drainDie;
  if (value >= max) return ui.notifications.info(fmt("EDGELINER.Drain.Full", { name: actor.name }));
  const next = Math.min(stepDie(value, 1), max);
  await actor.update({ "system.drainDie.value": next }, { pentraMechanic: true });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="pentra chat-card"><p><i class="fa-solid fa-spa"></i> ${fmt("EDGELINER.Drain.Centered", {
      name: foundry.utils.escapeHTML(actor.name), from: value ? `d${value}` : "0", to: `d${next}`
    })}</p></div>`
  });
}

export function registerCheckHooks() {
  Hooks.on("pentraRollCheck", onRollCheck);
  Hooks.on("pentraNeedsAir", onNeedsAir);
  Hooks.on("pentraWoundsApplied", onWoundsApplied);
  Hooks.on("pentraRest", onRest);
  Hooks.on("updateActor", onUpdateActor);
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("preCreateActor", onPreCreateActor);
  Hooks.on("preCreateActor", onPreCreateDrone);
  Hooks.on("preUpdateActor", onPreUpdateDrone);
}
