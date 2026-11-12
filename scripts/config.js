/**
 * Static rules data for the Edgeliner setting (rulebook v0.4). Pure data: no Foundry globals, so it can be tested.
 */
import { PSYCHIC_POWERS, TOTEM_POWERS, WORDS } from "./powers-data.js";

export const MODULE = "pentra-edgeliner-foundry-vtt";
export const SYSTEM = "pentra-core-foundry-vtt";

/** Item sub-types this module adds. Foundry prefixes module sub-types with the module id. */
export const TYPES = {
  cyberware: `${MODULE}.cyberware`,
  cyberdeck: `${MODULE}.cyberdeck`,
  deckmodule: `${MODULE}.deckmodule`,
  deckprogram: `${MODULE}.deckprogram`
};
/** Bought with the Resource Die (or gifted by the GM), like core armor and weapons. */
export const PURCHASED = [TYPES.cyberware, TYPES.cyberdeck, TYPES.deckmodule, TYPES.deckprogram];

export const EDGELINER = {};

/** Strain: the cybernetics a body can take (p. 6). Talents and hindrances move the maximum. */
EDGELINER.baseStrain = 4;

/** The three power traditions; a character may hold only one Power talent (p. 3). */
EDGELINER.powerCategories = {
  psychic: { label: "EDGELINER.Power.psychic", prefix: "psy_" },
  totem: { label: "EDGELINER.Power.totem", prefix: "totem_" },
  words: { label: "EDGELINER.Power.words", prefix: "word_" }
};

/** Psychic disciplines, Totem aspects and Words, in the rulebook's order. */
export const PSYCHIC_SKILLS = Object.keys(PSYCHIC_POWERS);
export const TOTEM_SKILLS = Object.keys(TOTEM_POWERS);
export const WORD_SKILLS = Object.keys(WORDS);

/** Skill key -> { category, id }. */
export const POWER_SKILLS = {
  ...Object.fromEntries(PSYCHIC_SKILLS.map(id => [`psy_${id}`, { category: "psychic", id }])),
  ...Object.fromEntries(TOTEM_SKILLS.map(id => [`totem_${id}`, { category: "totem", id }])),
  ...Object.fromEntries(WORD_SKILLS.map(id => [`word_${id}`, { category: "words", id }]))
};

/** Every skill this module adds to the core list: Occult (Knowledge) and the Power skills. */
export const NEW_SKILLS = {
  occult: { attribute: "knowledge", label: "EDGELINER.Skill.occult" },
  ...Object.fromEntries(Object.entries(POWER_SKILLS).map(([key, { category, id }]) => [key, {
    attribute: "power",
    label: category === "words" ? `EDGELINER.Word.${WORDS[id].type}.${id}` : `EDGELINER.Skill.${key}`,
    power: category
  }]))
};

/** Psychic ratings by skill rank (p. 12): 1–3 A, 4–5 A–B, 6 A–C. */
export const PSYCHIC_RATINGS = [[], ["A"], ["A"], ["A"], ["A", "B"], ["A", "B"], ["A", "B", "C"]];

/** Totem power tiers, lowest first (p. 12). */
export const TOTEM_TIERS = ["minor", "moderate", "significant", "grand"];

/** The starting target number for powers; +1 for every started 10 Construction Points (p. 11). */
EDGELINER.powerBaseTN = 7;
/** Resisting a power: a flat resistance check against 12 (p. 11). */
EDGELINER.resistTN = 12;

/* -------------------------------------------------------------------------- */
/*  Cybernetics (p. 6)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a cybernetic does, as far as the rules engine is concerned.
 *  skillAdvantage   advantage on skill checks of one attribute
 *  resistAdvantage  advantage on one resistance
 *  initiative       advantage on initiative rolls
 *  limb             +1 AR to arms or legs per pair of replaced limbs
 *  subdermal        +2 AR everywhere, with its own usage die (resets once all wounds heal)
 *  amphibious       breathes underwater
 *  dataJack         lets the character use CyberDecks
 *  chipSystem       holds up to 2 skill chips
 *  skillChip        a slotted chip raises one non-Power skill to rank 2
 *  smartgun         ignores up to 2 points of range or cover penalties with firearms
 *  boneSpurs        +1 wound on Martial Arts attacks
 *  muscle           melee hits force a Reflex resistance or the target falls prone
 *  none             narrative only (communication array, hearing, vision)
 */
EDGELINER.cyberEffects = ["none", "skillAdvantage", "resistAdvantage", "initiative", "limb", "subdermal", "amphibious",
  "dataJack", "chipSystem", "skillChip", "smartgun", "boneSpurs", "muscle"];

EDGELINER.subdermalAR = 2;
EDGELINER.chipSlots = 2;
EDGELINER.chipRank = 2;
EDGELINER.smartgunIgnore = 2;

/* -------------------------------------------------------------------------- */
/*  CyberDecks and hacking (pp. 7, 9–10)                                      */
/* -------------------------------------------------------------------------- */

/** Module slots: one module of each kind per deck. */
EDGELINER.moduleSlots = ["armor", "damage", "memory", "range"];
/** Memory can't go past 6. */
EDGELINER.maxMemory = 6;

EDGELINER.programs = ["burst", "droneControl", "stealth", "smoke", "warhammer"];

/** Deck wireless ranges (Very Close by default; Range Boost modules raise it). */
EDGELINER.deckRanges = ["veryClose", "close", "far"];
/** How far a Drone Control program reaches, by deck range. */
EDGELINER.droneRangeMiles = { veryClose: 2, close: 5, far: 10 };

/** Short Burst Hacking: a d12 sets how many rounds the device is disabled (p. 9). */
EDGELINER.burstTable = [
  { max: 6, rounds: 2 },
  { max: 9, rounds: 4 },
  { max: 11, rounds: 8 },
  { max: 12, rounds: 16 }
];

/**
 * Security systems by rank (v0.5, p. 10). `rank` is the attribute rank (0 = d12+0 … 4 = d4+8). `alert` is the
 * Alert Threshold: at it security gets its bonus, at double it the system shuts down.
 */
EDGELINER.securityRanks = {
  low: { rank: 0, skill: 1, alert: 11, evasion: 8, armor: 0, wounds: 1, increment: "odd" },
  moderate: { rank: 1, skill: 1, alert: 9, evasion: 9, armor: 1, wounds: 1, increment: "even" },
  high: { rank: 2, skill: 2, alert: 7, evasion: 10, armor: 2, wounds: 2, increment: "odd" },
  superHigh: { rank: 3, skill: 2, alert: 5, evasion: 11, armor: 3, wounds: 2, increment: "even" },
  blackSite: { rank: 4, skill: 3, alert: 3, evasion: 12, armor: 4, wounds: 2, increment: "every" }
};

/** Long System Delves: what the round's d12 usage check finds (p. 9). A 12 is both an obstacle and a data cache. */
EDGELINER.delveResults = {
  security: [1, 2],
  obstacle: [3, 6, 9, 12],
  cache: [4, 8, 12]
};

/** What a found data cache is worth, by the round's d12: the GM prices it from this afterwards. */
EDGELINER.cacheValues = { 4: "low", 8: "mid", 12: "high" };

/* -------------------------------------------------------------------------- */
/*  Drones (p. 8)                                                             */
/* -------------------------------------------------------------------------- */

/** Pseudo-AI drones: -1 per drone in pseudo-AI mode. */
EDGELINER.pseudoAIPenalty = -1;
