/**
 * Casting powers (pp. 11–12): build the power, roll Power + skill − implants against its target number through the
 * core check (so Edge, advantage and statuses all apply), then make the Drain Die usage check and post what it does.
 */
import { PENTRA, Rolls } from "./core.js";
import { MODULE, SYSTEM, EDGELINER } from "./config.js";
import * as R from "./rules.js";

const { renderTemplate } = foundry.applications.handlebars;
const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

/**
 * A selection names a power:
 *  { category: "psychic", discipline, power }  |  { category: "totem", aspect }  |  { category: "words", action, aspect, target }
 */
export function buildPower(actor, sel) {
  if (!sel) return null;
  switch (sel.category) {
    case "psychic": return R.psychicPower(sel.discipline, sel.power);
    case "totem": return R.totemPower(sel.aspect, actor.system.totemAnimal);
    case "words": return R.wordsSpell(sel.action, sel.aspect, sel.target);
  }
  return null;
}

/** Skill ranks for the power's skills. */
const ranksFor = (actor, power) => Object.fromEntries(power.skills.map(k => [k, actor.system.skills[k] ?? 0]));

/** The Power Attribute Bonus (0, 2, 4, 6, 8). */
export const powerBonus = actor => actor.system.attributes.power?.bonus ?? 0;

/**
 * Everything the caster needs to see before casting: CP, TN, drain range, the roll, the odds.
 * @returns {object}
 */
export function castPreview(actor, power, picks) {
  const ranks = ranksFor(actor, power);
  const cp = R.constructionPoints(power, picks);
  const rank = R.castingRank(power.skills, ranks);
  const strain = actor.system.strain?.used ?? 0;
  const { die, bonus } = actor.system.attributes.power;
  const flat = bonus + rank - strain;
  const tn = R.powerTN(cp);
  const effects = R.powerEffects(power, picks);
  const problem = R.castProblem(power, { category: actor.system.powerTradition, ranks, drainDie: actor.system.drainDie.value });
  const pab = bonus;
  return {
    cp, tn, rank, strain, die, bonus, flat, effects, problem,
    drainTop: R.drainTop(cp),
    drainDie: actor.system.drainDie.value,
    chance: Math.round(100 * R.successChance(die, flat, tn)),
    pab,
    noDuration: !!effects.duration && pab <= 0
  };
}

/** Readable effect lines for the chat card. */
function effectLines(power, effects, pab, { success, wounds }) {
  const lines = [];
  const unit = u => loc(`EDGELINER.Unit.${u}${pab === 1 ? "" : "s"}`);
  if (effects.targets) lines.push(fmt("EDGELINER.Effect.Targets", { n: effects.targets }));
  if (effects.self) lines.push(loc("EDGELINER.Effect.Self"));
  if (effects.radius) lines.push(fmt("EDGELINER.Effect.Radius", { band: loc(PENTRA.rangeBands[effects.radius]) }));
  if (effects.duration) {
    lines.push(pab > 0
      ? fmt("EDGELINER.Effect.Duration", { amount: pab, unit: unit(effects.duration) })
      : loc("EDGELINER.Effect.NoDuration"));
  }
  if (effects.back) lines.push(fmt("EDGELINER.Effect.Back", { amount: pab, unit: unit(effects.back) }));
  if (effects.ar) lines.push(fmt("EDGELINER.Effect.Armor", { ar: effects.ar * (effects.heavyArmor ? 2 : 1), heavy: effects.heavyArmor ? ` (${loc("EDGELINER.Effect.Heavy")})` : "" }));
  if (effects.heal) lines.push(fmt("EDGELINER.Effect.Heal", { n: effects.heal }));
  if (effects.skills) lines.push(fmt("EDGELINER.Effect.Skills", { n: effects.skills }));
  if (effects.restore) lines.push(fmt("EDGELINER.Effect.Restore", { n: effects.restore }));
  if (effects.resist !== undefined) {
    const res = power.resist ? loc(PENTRA.resistances[power.resist]) : loc("EDGELINER.Effect.AnyResistance");
    lines.push(fmt("EDGELINER.Effect.Resist", { resistance: res, mod: effects.resist > 0 ? `+${effects.resist}` : `${effects.resist}`, tn: EDGELINER.resistTN }));
  }
  if (effects.damage) {
    const d = effects.damage;
    const profile = `${d.wounds} (${loc(PENTRA.increments[d.increment])})${d.heavy ? " ×2" : ""}`;
    if (power.weapon) lines.push(fmt("EDGELINER.Effect.Weapon", { profile }));
    else if (success) lines.push(fmt("EDGELINER.Effect.Damage", { wounds, profile, type: power.damageType ?? "" }));
  }
  if (power.ignoresArmor && effects.damage) lines.push(loc("EDGELINER.Effect.IgnoresArmor"));
  return lines;
}

/**
 * Cast a power.
 * @param {Actor} actor
 * @param {object} sel        Power selection (see buildPower)
 * @param {object} picks      Option index per group id
 * @param {object} [opts]
 * @param {string} [opts.name]  A saved build's name, for the card title
 */
export async function castPower(actor, sel, picks, { name = null } = {}) {
  const power = buildPower(actor, sel);
  if (!power) return ui.notifications.warn(loc("EDGELINER.Cast.NoPower"));
  picks = R.completePicks(power, picks);
  const preview = castPreview(actor, power, picks);
  if (preview.problem) return ui.notifications.warn(fmt(preview.problem, { name: actor.name, power: power.name }));
  if (preview.noDuration) ui.notifications.info(loc("EDGELINER.Effect.NoDuration"));

  // The check: Power + the casting skill (Words: the lowest of the three words), against the power's TN.
  const ranks = ranksFor(actor, power);
  const skillKey = power.skills.reduce((low, k) => (ranks[k] < ranks[low] ? k : low), power.skills[0]);
  const title = name ? `${name} (${power.name})` : power.name;
  const msg = await Rolls.rollCheck(actor, {
    type: "skill", key: skillKey, tn: preview.tn,
    label: power.incantation ? `${title}: “${power.incantation}”` : title,
    note: fmt("EDGELINER.Cast.Note", { cp: preview.cp, tn: preview.tn, drain: preview.drainTop })
  });
  if (!msg) return null;
  const success = !!msg.getFlag(SYSTEM, "success");
  const tn = msg.getFlag(SYSTEM, "tn") ?? preview.tn;
  const total = msg.rolls?.[0]?.total ?? 0;

  // Drain: a usage check on the Drain Die, failing on 1 to the drain range.
  const drainDie = actor.system.drainDie.value;
  const drainRoll = await new Roll(`1d${drainDie}`).evaluate();
  const drained = drainRoll.total <= preview.drainTop;
  const nextDrain = drained ? R.stepDie(drainDie, -1) : drainDie;
  if (drained) await actor.update({ "system.drainDie.value": nextDrain }, { pentraMechanic: true });

  // What it does.
  const effects = preview.effects;
  const dmg = effects.damage && !power.weapon && success
    ? R.countWounds({ base: effects.damage.wounds, increment: effects.damage.increment, tn, total, heavy: effects.damage.heavy })
    : 0;
  const resistKeys = effects.resist !== undefined && success
    ? (power.resist ? [power.resist] : Object.keys(PENTRA.resistances)) : [];
  const healing = success && effects.heal ? effects.heal : 0;

  const content = await renderTemplate(`modules/${MODULE}/templates/chat/power.hbs`, {
    title, power: power.name, incantation: power.incantation, success,
    text: power.text,
    picks: R.pickLabels(power, picks),
    cp: preview.cp, tn,
    lines: effectLines(power, effects, preview.pab, { success, wounds: dmg }),
    drain: {
      rollHTML: await drainRoll.render(), top: preview.drainTop, drained,
      from: drainDie ? `d${drainDie}` : "0", to: nextDrain ? `d${nextDrain}` : "0"
    },
    damage: dmg > 0 ? { wounds: dmg, direct: !!power.ignoresArmor } : null,
    healing,
    resist: resistKeys.map(k => ({ key: k, label: loc(PENTRA.resistances[k]) })),
    resistMod: effects.resist ?? 0
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [drainRoll],
    flags: {
      // Core's "Apply" button reads this, so armor and durability work as for any attack.
      [SYSTEM]: dmg > 0 ? { damage: { wounds: dmg, location: "torso", locationLabel: loc(PENTRA.hitLocations.torso.label) } } : {},
      [MODULE]: { power: power.name, wounds: dmg, direct: !!power.ignoresArmor, heal: healing, resistMod: effects.resist ?? 0 }
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Chat card buttons                                                         */
/* -------------------------------------------------------------------------- */

/** The tokens a button acts on: controlled first, else targeted. */
function chosenActors() {
  let tokens = canvas?.tokens?.controlled ?? [];
  if (!tokens.length) tokens = Array.from(game.user.targets);
  return tokens.map(t => t.actor).filter(Boolean);
}

/** Resist a power: a flat resistance check against 12, with the power's resistance modifier. */
export async function resistPower(message, key) {
  const flags = message.flags[MODULE] ?? {};
  const actors = chosenActors();
  if (!actors.length) return ui.notifications.warn(loc("PENTRA.Damage.NoTarget"));
  for (const actor of actors) {
    if (!actor.isOwner || !actor.system.resistances) continue;
    await Rolls.rollCheck(actor, {
      type: "resistance", key, tn: EDGELINER.resistTN,
      options: { modifier: flags.resistMod ?? 0 },
      label: fmt("EDGELINER.Cast.ResistLabel", { power: flags.power ?? "", resistance: loc(PENTRA.resistances[key]) })
    });
  }
}

/** Damage that ignores armor (Project Pain, Throw Electrical): straight to Health, no durability check. */
export async function applyDirect(message) {
  const flags = message.flags[MODULE] ?? {};
  for (const actor of chosenActors()) {
    if (!actor.isOwner) {
      ui.notifications.warn(fmt("PENTRA.Damage.NotOwner", { name: actor.name }));
      continue;
    }
    await Rolls.applyWounds(actor, flags.wounds, "torso", { direct: true, source: flags.power });
  }
}

/** Healing powers mend flesh, not metal: no use on an Awakened AI. */
export async function applyHealing(message) {
  const flags = message.flags[MODULE] ?? {};
  for (const actor of chosenActors()) {
    if (!actor.isOwner) {
      ui.notifications.warn(fmt("PENTRA.Damage.NotOwner", { name: actor.name }));
      continue;
    }
    if (actor.system.machine) {
      ui.notifications.warn(fmt("EDGELINER.Cast.NoHealingAI", { name: actor.name }));
      continue;
    }
    const health = await Rolls.healWounds(actor, flags.heal);
    ui.notifications.info(fmt("PENTRA.Medicine.Healed", { name: actor.name, amount: flags.heal, health, max: actor.system.health.max }));
  }
}
