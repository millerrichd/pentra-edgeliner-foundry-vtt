import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../scripts/rules.js";
import { EDGELINER, NEW_SKILLS, POWER_SKILLS } from "../scripts/config.js";
import { PSYCHIC_POWERS, TOTEM_POWERS, TOTEM_ANIMALS, WORDS } from "../scripts/powers-data.js";

const pick = (power, labels) => {
  const picks = R.completePicks(power);
  for (const [id, label] of Object.entries(labels)) {
    const g = power.groups.find(x => x.id === id);
    picks[id] = g.options.findIndex(o => o.label === label);
    assert.ok(picks[id] >= 0, `${id}: ${label}`);
  }
  return picks;
};

test("target number and drain range follow the construction table", () => {
  const rows = [[1, 8, 2], [10, 8, 2], [11, 9, 3], [20, 9, 3], [21, 10, 4], [31, 11, 5], [41, 12, 6], [50, 12, 6]];
  for (const [cp, tn, drain] of rows) {
    assert.equal(R.powerTN(cp), tn, `TN for ${cp} CP`);
    assert.equal(R.drainTop(cp), drain, `drain for ${cp} CP`);
  }
});

test("the rulebook's Confusion example costs 13 CP: TN 9, drain 1–3", () => {
  const power = R.psychicPower("control", "confusion");
  const picks = pick(power, { targets: "1 Target", resist: "+1 Bonus", duration: "1 minute x PAB" });
  const cp = R.constructionPoints(power, picks);
  assert.equal(cp, 13);
  assert.equal(R.powerTN(cp), 9);
  assert.equal(R.drainTop(cp), 3);
  const fx = R.powerEffects(power, picks);
  assert.equal(fx.targets, 1);
  assert.equal(fx.resist, 1);
  assert.equal(fx.duration, "minute");
});

test("every psychic discipline has an A, B and C power with one option per group", () => {
  for (const [discipline, powers] of Object.entries(PSYCHIC_POWERS)) {
    assert.deepEqual(powers.map(p => p.rating), ["A", "B", "C"], discipline);
    for (const p of powers) {
      assert.ok(p.base > 0, `${p.name} base`);
      for (const g of p.groups) assert.ok(g.options.length > 0, `${p.name} ${g.label}`);
    }
  }
  assert.equal(Object.keys(PSYCHIC_POWERS).length, 15);
});

test("psychic ratings by rank", () => {
  assert.deepEqual(R.psychicRatings(0), []);
  assert.deepEqual(R.psychicRatings(3), ["A"]);
  assert.deepEqual(R.psychicRatings(4), ["A", "B"]);
  assert.deepEqual(R.psychicRatings(6), ["A", "B", "C"]);
});

test("damage powers carry a damage profile", () => {
  const power = R.psychicPower("cryokinesis", "throwIce");
  const picks = pick(power, { damage: "2 Wounds (even)", heavy: "Counts as" });
  assert.deepEqual(R.powerEffects(power, picks).damage, { wounds: 2, increment: "even", heavy: true });
  assert.equal(R.constructionPoints(power, picks), 4 + 3 + 10 + 10);
});

test("totem animals cap aspect tiers", () => {
  assert.equal(Object.keys(TOTEM_ANIMALS).length, 15);
  for (const a of Object.values(TOTEM_ANIMALS)) assert.equal(Object.keys(a.limits).length, 15, a.name);
  assert.equal(TOTEM_ANIMALS.bear.limits.healing, "grand");
  assert.equal(TOTEM_ANIMALS.raccoon.limits.creation, "grand");
  assert.equal(TOTEM_ANIMALS.turtle.limits.attunement, "grand");
  assert.equal(TOTEM_ANIMALS.wolf.limits.controlling, "grand");

  const heal = R.totemPower("healing", "wolf"); // Wolf: Healing minor
  const allowed = heal.groups[0].options.filter(o => R.optionAllowed(o, heal.cap)).map(o => o.label);
  assert.deepEqual(allowed, ["1 Wound"]);
  const bear = R.totemPower("healing", "bear");
  assert.equal(bear.groups[0].options.filter(o => R.optionAllowed(o, bear.cap)).length, 4);
  // A stored pick above the cap falls back to the cheapest allowed option.
  assert.equal(R.completePicks(heal, { heal: 3 }).heal, 0);
  // Untiered groups stay open.
  const prot = R.totemPower("protective", "rat");
  assert.ok(prot.groups.find(g => g.key === "heavyArmor").options.every(o => R.optionAllowed(o, prot.cap)));
});

test("words spells merge three words; aspect damage only when the spell damages", () => {
  const bolt = R.wordsSpell("destroy", "fire", "you");
  assert.equal(bolt.incantation, "Oblitus Ignis Tibi");
  assert.ok(bolt.groups.some(g => g.id === "aspect-damage"));
  const picks = pick(bolt, { "action-increment": "Success based on Even", "aspect-damage": "2 Wounds" });
  assert.deepEqual(R.powerEffects(bolt, picks).damage, { wounds: 2, increment: "even", heavy: false });
  assert.equal(R.constructionPoints(bolt, picks), 4 + 0 + 4 + 1);

  const ward = R.wordsSpell("armor", "earth", "me");
  assert.ok(!ward.groups.some(g => g.id === "aspect-damage"));
  assert.ok(R.wordsSpell("shield", "force", "me").groups.some(g => g.id === "aspect-damage"), "Force always damages");
  assert.equal(R.wordsSpell("fire", "destroy", "you"), null, "wrong word order");
  assert.equal(Object.values(WORDS).filter(w => w.type === "action").length, 10);
  assert.equal(Object.values(WORDS).filter(w => w.type === "aspect").length, 10);
  assert.equal(Object.values(WORDS).filter(w => w.type === "target").length, 6);
});

test("words use the lowest of the three word skills", () => {
  const spell = R.wordsSpell("destroy", "fire", "you");
  assert.equal(R.castingRank(spell.skills, { word_destroy: 3, word_fire: 1, word_you: 2 }), 1);
});

test("cast problems", () => {
  const power = R.psychicPower("control", "dominate"); // C rated
  const ctx = { category: "psychic", ranks: { psy_control: 4 }, drainDie: 8 };
  assert.equal(R.castProblem(power, ctx), "EDGELINER.Cast.RatingLocked");
  assert.equal(R.castProblem(power, { ...ctx, ranks: { psy_control: 6 } }), null);
  assert.equal(R.castProblem(power, { ...ctx, ranks: { psy_control: 6 }, drainDie: 0 }), "EDGELINER.Cast.Drained");
  assert.equal(R.castProblem(power, { ...ctx, category: "totem" }), "EDGELINER.Cast.WrongTradition");
  assert.equal(R.castProblem(power, { ...ctx, ranks: {} }), "EDGELINER.Cast.Untrained");
});

test("success chance", () => {
  assert.equal(R.successChance(12, 0, 1), 1);
  assert.equal(R.successChance(12, 0, 13), 0);
  assert.equal(R.successChance(12, 0, 7), 0.5);
  assert.ok(R.successChance(12, 0, 7, 1) > 0.5);
  assert.ok(R.successChance(12, 0, 7, -1) < 0.5);
});

test("skills: one per power, all under Power, plus Occult", () => {
  assert.equal(Object.keys(POWER_SKILLS).length, 15 + 15 + 26);
  assert.equal(NEW_SKILLS.occult.attribute, "knowledge");
  assert.ok(Object.entries(NEW_SKILLS).filter(([k]) => k !== "occult").every(([, s]) => s.attribute === "power"));
  assert.equal(Object.keys(TOTEM_POWERS).length, 15);
});

test("cybernetics math", () => {
  assert.equal(R.strainUsed([{ strain: 2 }, { strain: 1 }, { strain: 0 }]), 3);
  assert.equal(R.limbArmor(1), 0);
  assert.equal(R.limbArmor(2), 1);
  assert.equal(R.smartgunRelief(-4), 2);
  assert.equal(R.smartgunRelief(-1), 1);
  assert.equal(R.smartgunRelief(0), 0);
  assert.equal(R.chippedRank(0), 2);
  assert.equal(R.chippedRank(4), 4);
});

test("deck stats with modules and programs", () => {
  const board = { evasion: 8, armor: 1, wounds: 1, increment: "odd", memory: 2, modules: 2 };
  const stats = R.deckStats(board,
    [{ slot: "armor", value: 2 }, { slot: "range", value: "close" }],
    [{ program: "warhammer" }, { program: "droneControl" }]);
  assert.equal(stats.armor, 3);
  assert.equal(stats.range, "close");
  assert.equal(stats.increment, "even");
  assert.equal(stats.droneControl, 1);
  const every = R.deckStats({ ...board, increment: "every" }, [], [{ program: "warhammer" }]);
  assert.equal(every.wounds, 2, "already at every: +1 wound");
  assert.equal(R.deckStats({ ...board, memory: 4 }, [{ slot: "memory", value: 2 }, { slot: "memory", value: 2 }]).memory, 6, "memory caps at 6");
});

test("deck limits", () => {
  const board = { modules: 2 };
  assert.equal(R.moduleProblem(board, [{ slot: "armor" }], { slot: "armor" }), "EDGELINER.Deck.OneOfEach");
  assert.equal(R.moduleProblem(board, [{ slot: "armor" }, { slot: "range" }], { slot: "memory" }), "EDGELINER.Deck.ModulesFull");
  assert.equal(R.moduleProblem(board, [{ slot: "armor" }], { slot: "memory" }), null);
  assert.equal(R.programProblem(2, [{ program: "smoke" }], { program: "smoke" }), "EDGELINER.Deck.OneProgram");
  assert.equal(R.programProblem(2, [{ program: "droneControl" }], { program: "droneControl" }), null);
  assert.equal(R.programProblem(1, [{ program: "droneControl" }], { program: "droneControl" }), "EDGELINER.Deck.MemoryFull");
});

test("hacking tables", () => {
  assert.equal(R.burstRounds(1), 2);
  assert.equal(R.burstRounds(6), 2);
  assert.equal(R.burstRounds(7), 4);
  assert.equal(R.burstRounds(11), 8);
  assert.equal(R.burstRounds(12), 16);
  assert.deepEqual(R.delveResult(12), { security: false, obstacle: true, cache: true });
  assert.deepEqual(R.delveResult(2), { security: true, obstacle: false, cache: false });
  assert.deepEqual(R.delveResult(5), { security: false, obstacle: false, cache: false });
  assert.equal(R.alertState(2, 3), "normal");
  assert.equal(R.alertState(3, 3), "boosted");
  assert.equal(R.alertState(6, 3), "shutdown");
  assert.ok(R.withinRange("veryClose", "close"));
  assert.ok(!R.withinRange("far", "close"));
  assert.equal(EDGELINER.securityRanks.blackSite.evasion, 12);
  // v0.5: alert thresholds and armor by rank.
  assert.deepEqual(Object.values(EDGELINER.securityRanks).map(s => s.alert), [11, 9, 7, 5, 3]);
  assert.deepEqual(Object.values(EDGELINER.securityRanks).map(s => s.armor), [0, 1, 2, 3, 4]);
});

test("drones and wounds", () => {
  assert.equal(R.pseudoAIPenalty(3), -3);
  assert.equal(R.countWounds({ base: 1, increment: "odd", tn: 9, total: 12 }), 2, "only 11 is odd");
  assert.equal(R.stepDie(8, -1), 6);
});

test("saved picks: no dotted group ids, and old dotted/nested saves still load", () => {
  for (const [a, b, c] of [["shield", "earth", "you"], ["destroy", "fire", "them"]]) {
    assert.ok(R.wordsSpell(a, b, c).groups.every(g => !g.id.includes(".")));
  }
  assert.deepEqual(R.normalizePicks({ action: { duration: 2 }, target: { target: 0 } }), { "action-duration": 2, "target-target": 0 });
  assert.deepEqual(R.normalizePicks({ "action.duration": 1, targets: 3 }), { "action-duration": 1, targets: 3 });
  const spell = R.wordsSpell("shield", "earth", "you");
  const picks = R.completePicks(spell, R.normalizePicks({ action: { duration: 2 } }));
  assert.equal(picks["action-duration"], 2);
});
