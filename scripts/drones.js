/**
 * Drones (p. 8): vehicle actors flagged as drones. They're bought like any core vehicle (drop one on a character),
 * which makes a world actor the character owns, with its own token to move around the board. They're run remotely by an operator through a CyberDeck with one Drone
 * Control program per drone. A drone acts on its operator's turn with one action. Its checks use the operator's
 * skill, plus the drone's Handling, at -1 per drone running in pseudo-AI mode (a deep-dived operator, riding along
 * inside one drone, takes no penalty with it).
 */
import { PENTRA, Rolls } from "./core.js";
import { MODULE, EDGELINER } from "./config.js";
import { pseudoAIPenalty } from "./rules.js";
import { activeDeck } from "./hacking.js";
import { activeCyber } from "./documents.js";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const signed = n => (n > 0 ? `+${n}` : `${n}`);

export const isDrone = actor => actor?.type === "vehicle" && !!actor.getFlag(MODULE, "drone");

/** The drones this character operates. */
export function dronesOf(actor) {
  return game.actors.filter(a => isDrone(a) && a.getFlag(MODULE, "operator") === actor.uuid);
}

/** The drones this character owns or operates. */
export function dronesFor(actor) {
  return game.actors.filter(a => isDrone(a) && (a.system.owner === actor.uuid || a.getFlag(MODULE, "operator") === actor.uuid));
}

/** How many of the operator's drones run on pseudo-AI. */
const pseudoCount = actor => dronesOf(actor).filter(d => d.getFlag(MODULE, "mode") !== "deep").length;

/**
 * Can this character run drones? A working Data Jack, a CyberDeck in use that hasn't crashed, and at least one
 * Drone Control program loaded in it (one per drone).
 * @returns {{deck: Item|null, problem: string|null, slots: number, used: number}}
 */
export function droneReady(actor) {
  const used = dronesOf(actor).length;
  const out = (deck, problem) => ({ deck, problem, slots: deck?.system.stats.droneControl ?? 0, used });
  if (!activeCyber(actor, "dataJack")) return out(null, loc("EDGELINER.Drone.NeedJack"));
  const deck = activeDeck(actor);
  if (!deck) return out(null, loc("EDGELINER.Drone.NeedDeck"));
  if (deck.system.crashed) return out(deck, fmt("EDGELINER.Hack.Crashed", { name: deck.name }));
  if (!deck.system.stats.droneControl) return out(deck, fmt("EDGELINER.Drone.NoProgram", { deck: deck.name }));
  return out(deck, null);
}

/** Take control of a drone: needs a Data Jack, a deck in use, and a free Drone Control program. */
export async function linkDrone(actor, drone) {
  if (!isDrone(drone)) return ui.notifications.warn(fmt("EDGELINER.Drone.NotDrone", { name: drone.name }));
  if (drone.pack) return ui.notifications.warn(fmt("EDGELINER.Drone.BuyFirst", { name: drone.name }));
  const operator = drone.getFlag(MODULE, "operator");
  if (operator === actor.uuid) return;
  if (operator && fromUuidSync(operator)) {
    return ui.notifications.warn(fmt("EDGELINER.Drone.Operated", { drone: drone.name, name: fromUuidSync(operator).name }));
  }
  if (!drone.isOwner) return ui.notifications.warn(fmt("PENTRA.Damage.NotOwner", { name: drone.name }));
  const { deck, problem } = droneReady(actor);
  if (problem) return ui.notifications.warn(problem);
  const current = dronesOf(actor).filter(d => d.id !== drone.id);
  if (current.length >= deck.system.stats.droneControl) {
    return ui.notifications.warn(fmt("EDGELINER.Drone.NeedProgram", { deck: deck.name, n: deck.system.stats.droneControl }));
  }
  await drone.update({ [`flags.${MODULE}.operator`]: actor.uuid, [`flags.${MODULE}.mode`]: "pseudo" });
  ui.notifications.info(fmt("EDGELINER.Drone.Linked", { drone: drone.name, name: actor.name, miles: EDGELINER.droneRangeMiles[deck.system.stats.range] }));
}

export async function unlinkDrone(drone) {
  if (!drone?.isOwner) return;
  await drone.unsetFlag(MODULE, "operator");
  await drone.unsetFlag(MODULE, "mode");
}

/** Deep dive into one drone (full actions, no pseudo-AI penalty), or hand it back to its pseudo-AI. */
export async function toggleDeepDive(actor, drone) {
  const deep = drone.getFlag(MODULE, "mode") === "deep";
  if (!deep) {
    for (const other of dronesOf(actor)) {
      if (other.id !== drone.id && other.getFlag(MODULE, "mode") === "deep") await other.setFlag(MODULE, "mode", "pseudo");
    }
  }
  await drone.setFlag(MODULE, "mode", deep ? "pseudo" : "deep");
}

/** Handling and the pseudo-AI penalty, as roll modifiers. */
function droneModifiers(actor, drone) {
  const mods = [];
  if (drone.system.handling) mods.push({ label: `${loc("EDGELINER.Drone.Handling")} (${drone.name})`, value: drone.system.handling });
  if (drone.getFlag(MODULE, "mode") !== "deep") {
    const n = pseudoCount(actor);
    if (n) mods.push({ label: fmt("EDGELINER.Drone.PseudoAI", { n }), value: pseudoAIPenalty(n) });
  }
  return mods;
}

/** Maneuver: the drone's vehicle skill (Driving, Piloting, Boating) with Handling. */
export function maneuver(actor, drone) {
  const skill = PENTRA.vehicleSkills[drone.system.category] ?? "driving";
  return Rolls.rollCheck(actor, {
    type: "skill", key: skill,
    label: fmt("EDGELINER.Drone.ManeuverLabel", { drone: drone.name }),
    extraModifiers: droneModifiers(actor, drone)
  });
}

/** Fire a drone's mounted weapon: range and melee are measured from the drone's token. */
export function fire(actor, drone, weapon) {
  const token = drone.getActiveTokens()[0] ?? null;
  return Rolls.rollCheck(actor, {
    type: "attack", weapon, fromVehicle: drone, fromToken: token,
    label: `${weapon.name} (${drone.name})`,
    extraModifiers: droneModifiers(actor, drone)
  });
}

/**
 * A drone is flown remotely, so nobody rides in it: clear the crew a vehicle purchase puts aboard (otherwise the
 * buyer would count as riding in it, and their range and cover would be measured from the drone).
 */
export function onPreCreateDrone(actor) {
  if (!isDrone(actor)) return;
  actor.updateSource({ "system.crew": { driver: "", passengers: [] }, [`flags.${MODULE}.operator`]: "", [`flags.${MODULE}.mode`]: "" });
}

/** Nobody boards a drone. */
export function onPreUpdateDrone(actor, changes) {
  if (!isDrone(actor) || !foundry.utils.hasProperty(changes, "system.crew")) return;
  const crew = foundry.utils.getProperty(changes, "system.crew");
  if ((crew.driver ?? "") === "" && !(crew.passengers ?? []).length) return;
  ui.notifications.warn(fmt("EDGELINER.Drone.NoCrew", { name: actor.name }));
  return false;
}

/** Display rows for the drones section of the Cyber tab. */
export function droneRows(actor) {
  const sceneTokens = new Set((canvas?.scene?.tokens ?? []).map(t => t.actorId));
  return dronesFor(actor).map(d => ({
    id: d.id, uuid: d.uuid, name: d.name, img: d.img,
    owned: d.system.owner === actor.uuid,
    linked: d.getFlag(MODULE, "operator") === actor.uuid,
    operator: (() => {
      const op = d.getFlag(MODULE, "operator");
      return op && op !== actor.uuid ? fromUuidSync(op)?.name ?? null : null;
    })(),
    onScene: sceneTokens.has(d.id),
    deep: d.getFlag(MODULE, "mode") === "deep",
    health: `${d.system.health.value}/${d.system.health.max}`,
    handling: signed(d.system.handling),
    skill: loc(PENTRA.skills[PENTRA.vehicleSkills[d.system.category] ?? "driving"].label),
    weapons: d.items.filter(i => i.type === "weapon").map(w => ({ id: w.id, name: w.name, damage: w.system.damageLabel }))
  }));
}
