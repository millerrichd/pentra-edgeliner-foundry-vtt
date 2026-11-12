/**
 * Pure rules math for Edgeliner. No Foundry globals, so it runs under plain Node for the tests.
 */
import { EDGELINER, PSYCHIC_RATINGS, TOTEM_TIERS } from "./config.js";
import { PSYCHIC_POWERS, TOTEM_POWERS, TOTEM_ANIMALS, WORDS } from "./powers-data.js";

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const USAGE = [0, 4, 6, 8, 10, 12];

/** Move a die along d4…d12 (0 = depleted). Same ladder as the core rules. */
export function stepDie(faces, delta, { min = 0, max = 12 } = {}) {
  let i = USAGE.indexOf(Number(faces));
  if (i < 0) i = USAGE.findIndex(d => d >= faces);
  if (i < 0) i = USAGE.length - 1;
  return clamp(USAGE[clamp(i + delta, 0, USAGE.length - 1)], min, max);
}

/** Wounds from a roll: the base, plus one per odd/even/every number past the TN. Heavy doubles. 0 on a miss. */
export function countWounds({ base, increment, tn, total, heavy = false }) {
  if (total < tn) return 0;
  let extra = 0;
  for (let n = tn + 1; n <= total; n++) {
    if (increment === "every" || (increment === "odd" && n % 2 === 1) || (increment === "even" && n % 2 === 0)) extra++;
  }
  return (base + extra) * (heavy ? 2 : 1);
}

/* -------------------------------------------------------------------------- */
/*  Power construction (pp. 11–12)                                            */
/* -------------------------------------------------------------------------- */

/** +1 for every started 10 Construction Points (1–10: +1 … 41–50: +5). */
export const cpSteps = cp => Math.max(1, Math.ceil((Number(cp) || 0) / 10));

/** Target number to cast: 7, +1 per started 10 CP (1–10 → 8, 11–20 → 9 …). */
export const powerTN = cp => EDGELINER.powerBaseTN + cpSteps(cp);

/** The Drain Die usage check fails on 1 to this (1–10 CP → 1–2, 11–20 → 1–3 …). */
export const drainTop = cp => 1 + cpSteps(cp);

/** Psychic ratings a skill rank unlocks. */
export const psychicRatings = rank => PSYCHIC_RATINGS[clamp(Number(rank) || 0, 0, 6)];

/** The cap a totem animal puts on an aspect (minor when unknown). */
export function totemCap(animalKey, aspect) {
  return TOTEM_ANIMALS[animalKey]?.limits[aspect] ?? "minor";
}

/** Is this option within the tier cap? Untiered options are always allowed. */
export function optionAllowed(option, cap) {
  if (!option.tier || !cap) return true;
  return TOTEM_TIERS.indexOf(option.tier) <= TOTEM_TIERS.indexOf(cap);
}

/**
 * Give each group a unique pick id (its key, or prefixed when a spell merges several words: "action-duration").
 * No dots: picks are saved in actor flags, and Foundry expands dotted keys in update data into nested objects.
 */
const withIds = (groups, prefix = "") => groups.map(g => ({ ...g, id: prefix ? `${prefix}-${g.key}` : g.key }));

/**
 * Picks as {groupId: optionIndex}. Repairs builds saved with the old dotted ids, which Foundry stored nested
 * ({action: {duration: 2}}), or flat with dots ({"action.duration": 2}).
 */
export function normalizePicks(picks = {}) {
  const out = {};
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const key = (prefix ? `${prefix}-${k}` : k).replaceAll(".", "-");
      if (v && typeof v === "object") walk(v, key);
      else out[key] = Number(v);
    }
  };
  walk(picks, "");
  return out;
}

/**
 * A psychic power, ready to build.
 * @returns {object|null}
 */
export function psychicPower(discipline, powerId) {
  const def = PSYCHIC_POWERS[discipline]?.find(p => p.id === powerId);
  if (!def) return null;
  return { ...def, category: "psychic", key: `${discipline}.${powerId}`, skills: [`psy_${discipline}`], groups: withIds(def.groups) };
}

/** A totem aspect power, with the animal's cap. */
export function totemPower(aspect, animalKey) {
  const def = TOTEM_POWERS[aspect];
  if (!def) return null;
  const cap = totemCap(animalKey, aspect);
  return { ...def, id: aspect, category: "totem", key: aspect, cap, skills: [`totem_${aspect}`], groups: withIds(def.groups) };
}

/**
 * A Words of Power spell: one Action, one Aspect and one Target word. Every option group of the three words is
 * picked, except the aspect's damage group, which only applies when the spell does damage (Destroy, or Force,
 * which always damages).
 */
export function wordsSpell(action, aspect, target) {
  const a = WORDS[action], b = WORDS[aspect], c = WORDS[target];
  if (a?.type !== "action" || b?.type !== "aspect" || c?.type !== "target") return null;
  const damages = !!a.damage || !!b.alwaysDamages;
  const groups = [
    ...withIds(a.groups, "action"),
    ...withIds(b.groups.filter(g => !g.damageOnly || damages), "aspect"),
    ...withIds(c.groups, "target")
  ];
  return {
    category: "words", key: `${action}.${aspect}.${target}`, id: `${action}.${aspect}.${target}`,
    name: `${a.name} ${b.name} ${c.name}`,
    incantation: `${a.incantation} ${b.incantation} ${c.incantation}`,
    text: [a.text, b.text, c.text].join(" "),
    base: 0, attack: damages, damageType: b.damageType,
    resist: null, words: { action, aspect, target },
    skills: [`word_${action}`, `word_${aspect}`, `word_${target}`],
    groups
  };
}

/** Picks with every group filled: the stored pick where still allowed, otherwise the cheapest allowed option. */
export function completePicks(power, picks = {}) {
  const out = {};
  for (const g of power.groups) {
    const allowed = g.options.map((o, i) => ({ o, i })).filter(({ o }) => optionAllowed(o, power.cap));
    const kept = allowed.find(({ i }) => i === Number(picks[g.id]));
    out[g.id] = (kept ?? allowed[0])?.i ?? 0;
  }
  return out;
}

/** Total Construction Points for a set of picks. */
export function constructionPoints(power, picks) {
  return power.groups.reduce((sum, g) => sum + (g.options[picks[g.id]]?.cp ?? 0), power.base ?? 0);
}

/** Everything the picked options do, merged (targets, radius, resist, duration, damage, armor…). */
export function powerEffects(power, picks) {
  const effects = {};
  for (const g of power.groups) Object.assign(effects, g.options[picks[g.id]]?.effect ?? {});
  if (effects.wounds && (power.attack || power.weapon || effects.combat)) {
    effects.damage = { wounds: effects.wounds, increment: effects.increment ?? "odd", heavy: !!effects.heavy };
  }
  return effects;
}

/** Human summary of the picks ("1 Target · +1 Bonus · 1 minute x PAB"). */
export function pickLabels(power, picks) {
  return power.groups.map(g => ({ group: g.label, option: g.options[picks[g.id]]?.label ?? "", cp: g.options[picks[g.id]]?.cp ?? 0 }));
}

/**
 * Durations are "1 <unit> x PAB": the Power Attribute Bonus (0, 2, 4, 6, 8) multiplies the unit.
 * At d12+0 (bonus 0) a duration power has no effect.
 */
export function scaledDuration(unit, pab) {
  if (!unit) return null;
  return { amount: pab, unit, none: pab <= 0 };
}

/* -------------------------------------------------------------------------- */
/*  Casting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The skill rank a cast uses. Psychic and totem: the one skill. Words: the lowest of the three words.
 * @param {string[]} skills
 * @param {Record<string, number>} ranks
 */
export function castingRank(skills, ranks) {
  return Math.min(...skills.map(k => Number(ranks[k]) || 0));
}

/**
 * Can this character cast the power at all? Returns a problem key, or null.
 * @param {object} power
 * @param {object} ctx  { category, ranks, drainDie }
 */
export function castProblem(power, { category, ranks, drainDie }) {
  if (!power) return "EDGELINER.Cast.NoPower";
  if (power.category !== category) return "EDGELINER.Cast.WrongTradition";
  if (power.skills.some(k => !(Number(ranks[k]) > 0))) return "EDGELINER.Cast.Untrained";
  if (power.category === "psychic" && !psychicRatings(ranks[power.skills[0]]).includes(power.rating)) return "EDGELINER.Cast.RatingLocked";
  if (!drainDie) return "EDGELINER.Cast.Drained";
  return null;
}

/**
 * Chance (0–1) that 1d{die} + flat (± 1d6 with advantage) meets the target number.
 * @param {number} die
 * @param {number} flat       Attribute bonus + skill + modifiers
 * @param {number} tn
 * @param {-1|0|1} [advantage]
 */
export function successChance(die, flat, tn, advantage = 0) {
  let hits = 0, total = 0;
  const extra = advantage ? [1, 2, 3, 4, 5, 6].map(n => n * advantage) : [0];
  for (let d = 1; d <= die; d++) {
    for (const e of extra) {
      total++;
      if (d + flat + e >= tn) hits++;
    }
  }
  return total ? hits / total : 0;
}

/* -------------------------------------------------------------------------- */
/*  Cybernetics                                                               */
/* -------------------------------------------------------------------------- */

/** Strain installed: the sum of every cybernetic's strain. */
export const strainUsed = cyberware => cyberware.reduce((n, c) => n + (Number(c.strain) || 0), 0);

/** Replaced limbs give +1 AR to a location per pair. */
export const limbArmor = count => Math.floor((Number(count) || 0) / 2);

/** A Smartgun Jack cancels up to 2 points of range and cover penalty (rangeCover is negative or 0). */
export const smartgunRelief = rangeCover => Math.min(EDGELINER.smartgunIgnore, Math.max(-(Number(rangeCover) || 0), 0));

/** A skill chip overrides natural progression up to rank 2 (it never lowers a skill). */
export const chippedRank = natural => Math.max(Number(natural) || 0, EDGELINER.chipRank);

/* -------------------------------------------------------------------------- */
/*  CyberDecks                                                                */
/* -------------------------------------------------------------------------- */

const INCREMENTS = ["odd", "even", "every"];

/** Warhammer: odd → even → every; already at every, +1 wound instead. */
export function warhammer(increment, wounds) {
  const i = INCREMENTS.indexOf(increment);
  if (i < 0 || i >= INCREMENTS.length - 1) return { increment: "every", wounds: wounds + 1 };
  return { increment: INCREMENTS[i + 1], wounds };
}

/**
 * A deck's working stats from its motherboard, installed modules and loaded programs.
 * @param {object} board     { evasion, armor, wounds, increment, memory, modules, range }
 * @param {{slot: string, value: number|string}[]} modules
 * @param {{program: string}[]} programs
 */
export function deckStats(board, modules = [], programs = []) {
  const stats = {
    evasion: board.evasion, armor: board.armor, wounds: board.wounds, increment: board.increment,
    memory: board.memory, moduleSlots: board.modules, range: board.range || "veryClose"
  };
  for (const m of modules) {
    if (m.slot === "armor") stats.armor += Number(m.value) || 0;
    else if (m.slot === "damage") stats.wounds += Number(m.value) || 0;
    else if (m.slot === "memory") stats.memory += Number(m.value) || 0;
    else if (m.slot === "range" && EDGELINER.deckRanges.includes(m.value)) stats.range = m.value;
  }
  stats.memory = Math.min(stats.memory, EDGELINER.maxMemory);
  const has = p => programs.some(x => x.program === p);
  if (has("warhammer")) Object.assign(stats, warhammer(stats.increment, stats.wounds));
  stats.programs = programs.length;
  stats.modulesUsed = modules.length;
  stats.burst = has("burst");
  stats.stealth = has("stealth");
  stats.smoke = has("smoke");
  stats.droneControl = programs.filter(p => p.program === "droneControl").length;
  return stats;
}

/**
 * Can a module go into a deck? One of each kind (basic or superior), up to the board's module capacity.
 * @returns {string|null} A problem key.
 */
export function moduleProblem(board, installed, candidate) {
  if (installed.some(m => m.slot === candidate.slot)) return "EDGELINER.Deck.OneOfEach";
  if (installed.length >= board.modules) return "EDGELINER.Deck.ModulesFull";
  return null;
}

/**
 * Can a program be loaded? Each takes 1 Memory. Only Drone Control may be loaded more than once (one per drone).
 * @returns {string|null}
 */
export function programProblem(memory, loaded, candidate) {
  if (candidate.program !== "droneControl" && loaded.some(p => p.program === candidate.program)) return "EDGELINER.Deck.OneProgram";
  if (loaded.length >= memory) return "EDGELINER.Deck.MemoryFull";
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Hacking                                                                   */
/* -------------------------------------------------------------------------- */

/** Short Burst: rounds a device stays disabled for a d12 result. */
export function burstRounds(d12) {
  return EDGELINER.burstTable.find(r => d12 <= r.max)?.rounds ?? 2;
}

/** What a delve round's d12 turns up. */
export function delveResult(d12) {
  const { security, obstacle, cache } = EDGELINER.delveResults;
  return { security: security.includes(d12), obstacle: obstacle.includes(d12), cache: cache.includes(d12) };
}

/**
 * Alert level: at the threshold security gains advantage on all its checks; at double the threshold the system
 * shuts everyone out for 24 hours.
 */
export function alertState(alert, threshold) {
  const t = Math.max(Number(threshold) || 1, 1);
  if (alert >= 2 * t) return "shutdown";
  if (alert >= t) return "boosted";
  return "normal";
}

/** Range bands in order, for deck and drone reach. */
const BANDS = ["melee", "veryClose", "close", "far", "veryFar", "outOfRange"];
/** Is a measured band within a deck's wireless range? */
export const withinRange = (band, range) => BANDS.indexOf(band) <= BANDS.indexOf(range);

/* -------------------------------------------------------------------------- */
/*  Drones                                                                    */
/* -------------------------------------------------------------------------- */

/** -1 per drone the operator runs in pseudo-AI mode. */
export const pseudoAIPenalty = count => (Number(count) || 0) * EDGELINER.pseudoAIPenalty;
