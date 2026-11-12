/**
 * Hacking (pp. 9–10). Short Burst Hacking disables an implant or device for a number of rounds; Long System Delves
 * run in the Delve tracker (apps/delve.js), which uses the deck helpers here.
 */
import { PENTRA, CoreRules, Rolls } from "./core.js";
import { MODULE, SYSTEM, TYPES } from "./config.js";
import { burstRounds, withinRange } from "./rules.js";
import { activeCyber } from "./documents.js";

const { renderTemplate } = foundry.applications.handlebars;
const { DialogV2 } = foundry.applications.api;
const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The deck in use. */
export const activeDeck = actor => actor?.items.find(i => i.type === TYPES.cyberdeck && i.system.equipped) ?? null;

/**
 * Can this character hack right now? A working Data Jack and a deck in use that hasn't crashed.
 * @returns {{deck: Item|null, problem: string|null}}
 */
export function hackingReady(actor) {
  if (!activeCyber(actor, "dataJack")) return { deck: null, problem: loc("EDGELINER.Hack.NeedJack") };
  const deck = activeDeck(actor);
  if (!deck) return { deck: null, problem: loc("EDGELINER.Hack.NeedDeck") };
  if (deck.system.crashed) return { deck, problem: fmt("EDGELINER.Hack.Crashed", { name: deck.name }) };
  return { deck, problem: null };
}

/** The range band between two tokens, or null if they can't be measured. */
function bandBetween(a, b) {
  if (!a || !b || !canvas?.grid) return null;
  try {
    return CoreRules.bandForDistance(canvas.grid.measurePath([a.center, b.center]).distance);
  } catch {
    return null;
  }
}

/**
 * Short Burst Hacking: a Hacking check against the standard TN (the Burst program lowers it by 1). On a success a
 * d12 sets how long the device stays disabled; the card's button lets the target's owner (usually the GM) pick the
 * implant it hits.
 */
export async function shortBurst(actor) {
  const { deck, problem } = hackingReady(actor);
  if (problem) return ui.notifications.warn(problem);
  const stats = deck.system.stats;
  const targets = Array.from(game.user.targets);
  const target = targets.length === 1 ? targets[0] : null;
  const myToken = actor.getActiveTokens()[0];
  const band = target ? bandBetween(myToken, target) : null;
  if (band && !withinRange(band, stats.range)) {
    return ui.notifications.warn(fmt("EDGELINER.Burst.OutOfRange", {
      target: target.name, range: loc(PENTRA.rangeBands[stats.range]), band: loc(PENTRA.rangeBands[band])
    }));
  }

  const tn = Rolls.defaultTN() - (stats.burst ? 1 : 0);
  const msg = await Rolls.rollCheck(actor, {
    type: "skill", key: "hacking", tn,
    label: fmt("EDGELINER.Burst.Label", { deck: deck.name }),
    note: stats.burst ? loc("EDGELINER.Burst.ProgramNote") : null
  });
  if (!msg?.getFlag(SYSTEM, "success")) return msg;

  const roll = await new Roll("1d12").evaluate();
  const rounds = burstRounds(roll.total);
  const content = await renderTemplate(`modules/${MODULE}/templates/chat/burst.hbs`, {
    rollHTML: await roll.render(), rounds, target: target?.name ?? null
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll],
    flags: { [MODULE]: { burst: { rounds, targetUuid: target?.document?.uuid ?? null } } }
  });
}

/** The card's button: choose an implant on the target to disable for the rolled number of rounds. */
export async function disableFromBurst(message) {
  const { rounds, targetUuid } = message.flags[MODULE]?.burst ?? {};
  const doc = targetUuid ? fromUuidSync(targetUuid) : Array.from(game.user.targets)[0]?.document;
  const actor = doc?.actor ?? null;
  if (!actor) return ui.notifications.warn(loc("PENTRA.Damage.NoTarget"));
  if (!actor.isOwner) return ui.notifications.warn(fmt("PENTRA.Damage.NotOwner", { name: actor.name }));
  const implants = actor.items.filter(i => i.type === TYPES.cyberware);
  if (!implants.length) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="pentra chat-card"><p>${fmt("EDGELINER.Burst.Device", { name: esc(actor.name), rounds })}</p></div>`
    });
  }
  const options = implants.map((i, n) => `<label class="radio"><input type="radio" name="implant" value="${i.id}" ${n === 0 ? "checked" : ""}>
    ${esc(i.name)}${i.system.disabled ? ` (${fmt("EDGELINER.Burst.AlreadyDown", { n: i.system.disabled })})` : ""}</label>`).join("");
  const id = await DialogV2.prompt({
    window: { title: fmt("EDGELINER.Burst.ChooseTitle", { name: actor.name }), icon: "fa-solid fa-bolt" },
    content: `<div class="pentra edgeliner"><p>${fmt("EDGELINER.Burst.Choose", { rounds })}</p>${options}</div>`,
    ok: { label: "EDGELINER.Burst.Disable", callback: (e, button) => button.form.elements.implant.value },
    rejectClose: false
  });
  const item = id ? actor.items.get(id) : null;
  if (!item) return;
  await item.update({ "system.disabled": Math.max(item.system.disabled, rounds) });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="pentra chat-card"><p><i class="fa-solid fa-bolt"></i> ${fmt("EDGELINER.Burst.Disabled", {
      name: esc(actor.name), item: esc(item.name), rounds
    })}</p>${item.system.effect === "limb" ? `<p class="hint">${loc("EDGELINER.Burst.LimbNote")}</p>` : ""}</div>`
  });
}

/**
 * Damage to a deck: armor soaks wounds, the armor usage die checks 1 to the wounds before armor, and at 0 Health the
 * deck crashes.
 * @returns {Promise<{taken: number, health: number, lines: string[], rolls: Roll[]}>}
 */
export async function damageDeck(deck, wounds) {
  const lines = [];
  const rolls = [];
  const armor = (deck.system.durability ?? 0) > 0 ? deck.system.stats.armor : 0;
  const taken = Math.max(wounds - armor, 0);
  const health = Math.max(deck.system.health.value - taken, 0);
  const update = { "system.health.value": health };
  if (wounds > 0 && deck.system.durability > 0) {
    const roll = await new Roll(`1d${deck.system.durability}`).evaluate();
    rolls.push(roll);
    if (roll.total <= wounds) {
      const next = CoreRules.stepDie(deck.system.durability, -1);
      update["system.durability"] = next;
      lines.push(fmt("EDGELINER.Deck.ArmorDegraded", { roll: roll.total, range: wounds, die: next ? `d${next}` : loc("PENTRA.Broken") }));
    } else {
      lines.push(fmt("EDGELINER.Deck.ArmorHeld", { roll: roll.total, range: wounds }));
    }
  }
  await deck.update(update);
  if (health <= 0) lines.push(fmt("EDGELINER.Deck.CrashedNow", { name: deck.name }));
  return { taken, health, armor, lines, rolls };
}

/** The armor usage die a deck is repaired back to: its owner's Durability Die (as when it was first owned). */
const fullDurability = deck => deck.parent?.system.durabilityDie?.value ?? 8;

/** Has the deck taken any damage a defrag would repair (Health, a crash, or a worn armor die)? */
export function deckDamaged(deck) {
  const { value, max } = deck.system.health;
  return value < max || (deck.system.durability ?? 0) < fullDurability(deck);
}

/**
 * Camp downtime: Defragmentation of CyberDeck (p. 10). A few hours make the deck as good as new: all damage
 * repaired (full Health and its armor usage die back to full) and a crash recovered.
 */
export async function defragDeck(deck) {
  const actor = deck?.parent;
  if (!actor?.isOwner) return;
  if (!deckDamaged(deck)) return ui.notifications.info(fmt("EDGELINER.Deck.DefragNotNeeded", { name: deck.name }));
  const { value, max } = deck.system.health;
  const wasCrashed = deck.system.crashed;
  const durability = fullDurability(deck);
  const wornArmor = (deck.system.durability ?? 0) < durability;
  await deck.update({ "system.health.value": max, "system.durability": durability });
  const lines = [];
  if (value < max) lines.push(fmt("EDGELINER.Deck.DefragHealth", { from: value, to: max }));
  if (wornArmor) lines.push(fmt("EDGELINER.Deck.DefragArmor", { die: `d${durability}` }));
  if (wasCrashed) lines.push(loc("EDGELINER.Deck.DefragCrash"));
  const content = await renderTemplate(`systems/${SYSTEM}/templates/chat/simple.hbs`, {
    title: fmt("EDGELINER.Deck.DefragTitle", { name: deck.name }), subtitle: loc("PENTRA.Downtime.Camp"), lines
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}
