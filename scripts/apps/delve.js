/**
 * Long System Delves (p. 9–10). A delve is one system; hackers jack into it and move through it in runs.
 *
 *  - The system: name, security rank, Alert Threshold, the alert level (one alert for the whole system, which
 *    every hacker's trouble raises), shutdown, the data caches found in it, and its History.
 *  - A run: one or more hackers moving together (Multiple Hackers, p. 10). Each run rolls its own usage checks,
 *    so hackers who go their separate ways each get their own; hackers who proceed together share every step and
 *    fight security together. A hacker can split off into a run of their own, or join another run, whenever
 *    neither run is mid-gate or mid-fight.
 *
 * Each round a run searches:
 *  1. Every hacker gains access on their own: a Hacking check against the standard TN. A hacker who fails can
 *     try again once another hacker in the system has searched a round (straight away if nobody else can).
 *  2. The d12 usage check: 1–2 security, 3/6/9/12 a password gate, 4/8/12 a data cache (4 low, 8 mid, 12 high
 *     value).
 *  3. Security is fought like combat with the decks' stats; contact raises the alert 1. Every hacker in the fight
 *     and security roll a d6 Initiative Die (which shifts like the core's: a 1 drops it, a max raises it); highest
 *     total first, ties to the hackers, each using all its actions (1 per 6 points) before the next. Security
 *     attacks the deck the GM picks. Smoke takes one hacker out; the fight ends when security crashes or nobody
 *     is left in it.
 *  4. A gate: every hacker in the run with access makes the Hacking check (Stealth +1). Each failure raises the
 *     alert 1; once all have rolled, the run gets through if anyone did, and the cache behind it with them.
 *  5. At the threshold security gets advantage; at double the system shuts everyone out for 24 hours.
 *
 * A cache found by a run belongs to everyone in it. Each member gets a copy on their Cyber tab, and when there are
 * several, each copy is worth one step less than the GM's price (one multiplier, or one die size at x1).
 *
 * The window is open to everyone. A player acts for the hackers they own: their checks are rolled on their own
 * client (Edge, advantage) and the result goes to the GM's client, which owns the delve state (a world setting).
 * Set-up, security's attacks and the alert stay with the GM; the alert is hidden unless the GM shows it.
 */
import { PENTRA, Rolls, CoreRules } from "../core.js";
import { MODULE, SYSTEM, EDGELINER } from "../config.js";
import { delveResult, alertState, countWounds } from "../rules.js";
import { hackingReady, damageDeck } from "../hacking.js";
import { CACHE_VALUES, cacheValue, valueOptions, giveCache, FIELDS as WORTH_FIELDS, worthLabel, worthDieOptions, worthMultOptions } from "../data-caches.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SETTING = "delves";
const CHANNEL = `module.${MODULE}`;
const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);
const randomID = () => foundry.utils.randomID();

/**
 * Security Integrity: how much damage a security program takes before it's beaten. The rulebook doesn't give
 * security a Health score; the default is the "four wounds before it crashes" it gives computers. The GM can
 * change it per delve.
 */
const DEFAULT_INTEGRITY = 4;

/**
 * The delve's history is kept whole so the table can read back the session. The cap only stops a delve that
 * runs for months from bloating the world setting every change is broadcast in.
 */
const LOG_LIMIT = 1000;

const newDelve = () => ({
  id: randomID(), name: "", rank: "low", threshold: EDGELINER.securityRanks.low.alert, alert: 0, showAlert: false,
  integrity: DEFAULT_INTEGRITY, hackers: [], runs: [], searches: 0, caches: [], log: []
});

const newRun = (members = [], round = 0) => ({ id: randomID(), members, round, gate: null, security: null });

/* -------------------------------------------------------------------------- */
/*  State shape                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Bring a delve up to the current shape. Delves saved with one hacker (`hackerUuid`, `access`, `round`, `gate`,
 * `security` on the delve itself) become a system with that hacker in a single run.
 * Everything is kept in arrays (no actor uuids as object keys).
 */
function normalize(d) {
  if (!Array.isArray(d.runs)) {
    const uuid = d.hackerUuid || "";
    d.hackers = uuid ? [{ uuid, access: !!d.access, retryAt: null }] : [];
    d.runs = uuid ? [{
      id: randomID(), members: [uuid], round: d.round ?? 0,
      gate: d.gate ? { evades: [] } : null,
      security: d.security ? legacySecurity(d.security, uuid) : null
    }] : [];
    d.searches = d.round ?? 0;
    for (const key of ["hackerUuid", "access", "round", "gate", "security"]) delete d[key];
  }
  d.hackers ??= [];
  d.searches ??= 0;
  d.log ??= [];
  cachesOf(d);
  return d;
}

/** A one-hacker encounter saved before runs: its "hacker"/"security" sides become the fighter list. */
function legacySecurity(sec, uuid) {
  const side = s => ({ die: s?.die ?? HACKING_INIT_DIE, total: s?.total ?? null, actions: s?.actions ?? 0 });
  const sides = [{ key: SECURITY, ...side(sec.security) }, { key: uuid, ...side(sec.hacker) }];
  const turn = sec.turn === "hacker" ? uuid : sec.turn === "security" ? SECURITY : null;
  return { wounds: sec.wounds ?? 0, exchange: sec.exchange ?? 0, turn, sides, order: turn ? orderOf(sides) : [], fighters: [uuid] };
}

const hackerEntry = (d, uuid) => d.hackers.find(h => h.uuid === uuid) ?? null;
const runById = (d, id) => d.runs.find(r => r.id === id) ?? null;
const runOf = (d, uuid) => d.runs.find(r => r.members.includes(uuid)) ?? null;
const actorOf = uuid => (uuid ? fromUuidSync(uuid) : null);
const nameOf = uuid => actorOf(uuid)?.name ?? "?";
const hasAccess = (d, uuid) => !!hackerEntry(d, uuid)?.access;
const shutdown = d => alertState(d.alert, d.threshold) === "shutdown";

/** "Vex", "Vex & Zed", "Vex, Zed & Kit". */
function joinNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}
const runLabel = run => joinNames(run.members.map(nameOf));

/** The hackers in the run who are in (have access): they search, evade and fight. */
const inside = (d, run) => run.members.filter(uuid => hasAccess(d, uuid));

/** A run can split, merge, take new members or search only when it isn't mid-gate or mid-fight. */
const idle = run => !run.gate && !run.security;

/**
 * Can this hacker try to gain access? After a failure they wait until another hacker in the system has searched
 * a round; if no one else can search (nobody else is in), they may try again straight away.
 */
function canRetry(d, uuid) {
  const h = hackerEntry(d, uuid);
  if (!h || h.access) return false;
  if (h.retryAt == null || d.searches >= h.retryAt) return true;
  return !d.hackers.some(o => o.uuid !== uuid && o.access);
}

/* -------------------------------------------------------------------------- */
/*  Data caches                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Each find is kept: the run's round, what became of it, who it belongs to (everyone in the run that found it),
 * the value tier from the d12 that found it, and what's in it and what it's worth (the GM fills those in; players
 * see them once the cache is theirs). A cache in the open is recovered on the spot; one behind a password gate
 * stays locked until the run gets through, and is lost if nobody does, or left if the run walks away.
 */
const CACHE_STATUS = ["recovered", "locked", "left", "lost"];
const member = uuid => ({ uuid, name: nameOf(uuid) });

const newCache = (run, status, value = "") => ({
  id: randomID(), round: run?.round ?? null, runId: run?.id ?? "", status, value, contents: "", given: false,
  worthDie: 0, worthMult: 1, members: status === "recovered" && run ? run.members.map(member) : []
});

/** Caches saved as a count, or credited to one `hackerUuid`, are brought up to date. */
function cachesOf(d) {
  if (!Array.isArray(d.caches)) {
    const n = Number(d.caches) || 0;
    d.caches = Array.from({ length: n }, () => ({ id: randomID(), round: null, status: "recovered", contents: "", members: [] }));
  }
  for (const c of d.caches) {
    if (!Array.isArray(c.members)) {
      c.members = c.hackerUuid ? [{ uuid: c.hackerUuid, name: c.by || nameOf(c.hackerUuid) }] : [];
      delete c.hackerUuid;
      delete c.by;
    }
  }
  return d.caches;
}

/** Recovered, credited to someone, and not yet sent to their Cyber tabs. */
const unsent = c => c.status === "recovered" && !c.given && c.members.length > 0;

/** Ready to send in bulk: the GM has described it and given it a Resource Die price. */
const cacheReady = c => unsent(c) && !!String(c.contents ?? "").trim() && Number(c.worthDie) > 0;

/**
 * What each copy is worth. One owner: the GM's price. Shared: one step less each, a multiplier off (d8x2 →
 * d8x1), or a die size at x1 (d8x1 → d6x1); a d4x1 can't go lower and stays d4x1.
 */
export function shareWorth({ worthDie, worthMult = 1 }, owners) {
  const die = Number(worthDie) || 0;
  const mult = Number(worthMult) || 1;
  if (!die || owners <= 1) return { worthDie: die, worthMult: mult };
  if (mult > 1) return { worthDie: die, worthMult: mult - 1 };
  return { worthDie: Math.max(CoreRules.stepDie(die, -1) || 4, 4), worthMult: 1 };
}

/** Settle the cache behind the gate this run just dealt with. */
function settleLocked(d, run, status) {
  const cache = cachesOf(d).findLast(c => c.status === "locked" && c.runId === run.id);
  if (!cache) return null;
  cache.status = status;
  if (status === "recovered") cache.members = run.members.map(member);
  return cache;
}

/** Send a cache: a copy to each owner's Cyber tab. Returns the names it went to. */
async function sendCache(d, cache) {
  const copy = shareWorth(cache, cache.members.length);
  const names = [];
  for (const m of cache.members) {
    const actor = actorOf(m.uuid);
    if (!actor) continue;
    await giveCache(actor, { ...cache, ...copy, delve: d.name });
    names.push(actor.name);
  }
  if (names.length) cache.given = true;
  return names;
}

/* -------------------------------------------------------------------------- */
/*  Storage and the socket                                                    */
/* -------------------------------------------------------------------------- */

const getDelves = () => foundry.utils.deepClone(game.settings.get(MODULE, SETTING) ?? []).map(normalize);
const saveDelves = delves => game.settings.set(MODULE, SETTING, delves);

export function registerDelveSetting() {
  game.settings.register(MODULE, SETTING, {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => DelveApp.refresh()
  });
}

/** Players' requests reach the active GM's client, which applies them. */
export function registerDelveSocket() {
  game.socket.on(CHANNEL, data => {
    if (data?.scope === "delve" && game.users.activeGM?.isSelf) applyOp(data);
  });
}

/* -------------------------------------------------------------------------- */
/*  Permissions                                                               */
/* -------------------------------------------------------------------------- */

const owns = (user, uuid) => !!actorOf(uuid)?.testUserPermission(user, "OWNER");

/**
 * What a player may do: act for a hacker they own (`payload.uuid`) who is in the delve, or jack one in. Passing
 * names the side in `payload.side`. Everything else (set-up, security, the alert, caches) is the GM's.
 */
const PLAYER_OPS = new Set(["join", "access", "round", "evade", "leaveGate", "hackerAttack", "smoke", "jackOut", "pass", "split", "merge"]);

function playerMay(user, d, op, payload) {
  if (!PLAYER_OPS.has(op)) return false;
  const uuid = op === "pass" ? payload.side : payload.uuid;
  if (!uuid || !owns(user, uuid)) return false;
  return op === "join" || !!hackerEntry(d, uuid);
}

/** Cache fields the GM edits inline. */
const CACHE_FIELDS = {
  contents: String,
  status: v => (CACHE_STATUS.includes(v) ? v : "recovered"),
  value: v => (CACHE_VALUES.includes(v) ? v : ""),
  // The GM's price for the data, as a Resource Die value; the owners sell it for this.
  worthDie: WORTH_FIELDS.worthDie,
  worthMult: WORTH_FIELDS.worthMult
};

/** Fields the GM edits inline. */
const FIELDS = { name: String, rank: String, threshold: Number, integrity: Number, showAlert: Boolean };

/* -------------------------------------------------------------------------- */
/*  Chat and the History                                                      */
/* -------------------------------------------------------------------------- */

const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);

/** The GM and the players of everyone in the system. */
const crewIds = d => game.users.filter(u => u.isGM || d.hackers.some(h => owns(u, h.uuid))).map(u => u.id);

/**
 * A line is plain text, or `{ text, strong: true }` for one that should stand out (who acts first). The core's
 * card escapes its lines, so the delve builds the same card markup itself with the strong lines in bold.
 */
const lineText = l => (typeof l === "string" ? l : l.text);
const strongLine = text => ({ text, strong: true });

async function chat(title, lines, rolls = [], whisper = null) {
  const esc = foundry.utils.escapeHTML;
  const items = lines.map(l => `<li>${typeof l === "object" && l.strong ? `<strong>${esc(l.text)}</strong>` : esc(lineText(l))}</li>`).join("");
  // The dice themselves (click to expand each one), as the core's roll cards show them.
  const dice = (await Promise.all(rolls.map(r => r.render?.() ?? ""))).join("");
  const content = `<div class="pentra chat-card"><header class="card-header"><h3>${esc(title)}</h3></header>${dice}<ul class="notes">${items}</ul></div>`;
  return ChatMessage.create({ speaker: { alias: loc("EDGELINER.Delve.Title") }, content, rolls, ...(whisper ? { whisper } : {}) });
}

/** A History entry, tagged with the run (who, and its round) it happened in. */
function note(d, run, text, extra = {}) {
  d.log.push({ text, round: run?.round || null, who: run ? runLabel(run) : "", ...extra });
}

/** A chat card title: the delve, and the run when there's more than one. */
const titleFor = (d, run, what) => [d.name, d.runs.length > 1 && run ? runLabel(run) : "", what].filter(Boolean).join(": ");

/**
 * Post what happened and log it. `lines` are for the table; `secret` lines (the alert) go only to the GM unless
 * the GM shows the alert to players.
 * @param {object} [o]
 * @param {boolean} [o.crewOnly]  Whisper to the GM and the hackers' players instead of posting publicly.
 * @param {boolean} [o.quiet]     Log it in the window without a chat message (the check card already says it).
 */
async function post(d, run, what, lines, { secret = [], rolls = [], crewOnly = false, quiet = false } = {}) {
  const title = titleFor(d, run, what);
  const shown = d.showAlert ? [...lines, ...secret] : lines;
  if (!quiet && shown.length) await chat(title, shown, rolls, crewOnly ? crewIds(d) : null);
  if (!d.showAlert && secret.length) await chat(title, secret, [], gmIds());
  note(d, run, lines.map(lineText).join(" "), {
    secret: secret.map(lineText).join(" "),
    // Kept in pieces only when one stands out, so the History can bold it.
    ...(lines.some(l => typeof l === "object" && l.strong) ? { parts: lines.map(l => (typeof l === "string" ? { text: l } : l)) } : {})
  });
}

/* -------------------------------------------------------------------------- */
/*  The alert                                                                 */
/* -------------------------------------------------------------------------- */

/** Raise the alert: the number is secret, a shutdown isn't (it throws everyone out of every run). */
function raiseAlert(d, lines, secret) {
  const before = alertState(d.alert, d.threshold);
  d.alert += 1;
  const after = alertState(d.alert, d.threshold);
  secret.push(fmt("EDGELINER.Delve.AlertUp", { alert: d.alert }));
  if (after === before) return;
  if (after === "shutdown") {
    lines.push(loc("EDGELINER.Delve.Shutdown"));
    for (const run of d.runs) Object.assign(run, { gate: null, security: null });
    for (const h of d.hackers) h.access = false;
  } else secret.push(loc("EDGELINER.Delve.Boosted"));
}

/* -------------------------------------------------------------------------- */
/*  Hacking combat                                                            */
/* -------------------------------------------------------------------------- */

const HACKING_INIT_DIE = 6;
const SECURITY = "security";
const sideName = key => (key === SECURITY ? loc("EDGELINER.Delve.SecurityTitle") : nameOf(key));

/** A fresh fight: security and every fighter start on a d6 Initiative Die. */
const newSecurity = fighters => ({
  wounds: 0, exchange: 0, turn: null, order: [], fighters: [...fighters],
  sides: [SECURITY, ...fighters].map(key => ({ key, die: HACKING_INIT_DIE, total: null, actions: 0 }))
});

const sideOf = (enc, key) => enc.sides.find(s => s.key === key) ?? null;

/** Highest total first; ties go to the hackers (the core gives ties to PCs). */
function orderOf(sides) {
  return [...sides].sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || (a.key === SECURITY) - (b.key === SECURITY)).map(s => s.key);
}

/** Roll one side's Initiative Die: a natural 1 drops it a size (to d4), a natural max raises it (to d12). */
async function rollSide(state, name) {
  const die = state.die;
  const roll = await new Roll(`1d${die}`).evaluate();
  const natural = roll.dice?.[0]?.total ?? roll.total;
  let shift = "";
  if (natural === 1 && die > 4) {
    state.die = CoreRules.stepDie(die, -1, { min: 4 });
    shift = fmt("PENTRA.Initiative.Crash", { from: CoreRules.formatDie(die), to: CoreRules.formatDie(state.die) });
  } else if (natural === die && die < 12) {
    state.die = CoreRules.stepDie(die, 1, { min: 4 });
    shift = fmt("PENTRA.Initiative.Spike", { from: CoreRules.formatDie(die), to: CoreRules.formatDie(state.die) });
  }
  state.total = roll.total;
  state.actions = CoreRules.actionsFromInitiative(roll.total);
  const line = fmt("EDGELINER.Delve.InitLine", { name, die: CoreRules.formatDie(die), total: roll.total, n: state.actions });
  return { roll, line: shift ? `${line} ${shift}` : line };
}

/**
 * A new exchange: every side rolls. Wired Reflexes doesn't apply: it speeds up the body, and this is the deck's
 * processing speed.
 */
async function rollInitiative(enc, lines) {
  const rolls = [];
  const said = [];
  for (const side of enc.sides) {
    const r = await rollSide(side, sideName(side.key));
    rolls.push(r.roll);
    said.push(r.line);
  }
  enc.exchange += 1;
  enc.order = orderOf(enc.sides);
  enc.turn = enc.order[0];
  lines.push(fmt("EDGELINER.Delve.Exchange", { n: enc.exchange }), ...said,
    strongLine(fmt("EDGELINER.Delve.GoesFirst", { name: sideName(enc.turn) })));
  return rolls;
}

/** Why this side can't act now, or null. */
function turnProblem(run, key) {
  const enc = run?.security;
  if (!enc) return loc("EDGELINER.Delve.NoSecurity");
  if (!enc.turn) return loc("EDGELINER.Delve.NeedInitiative");
  if (!sideOf(enc, key)) return loc("EDGELINER.Delve.NotInFight");
  if (enc.turn !== key) return fmt("EDGELINER.Delve.TurnOf", { name: sideName(enc.turn) });
  if (sideOf(enc, key).actions <= 0) return loc("EDGELINER.Delve.NoActions");
  return null;
}

/** Pass the turn on: the next side in the order with actions left, or a new exchange when nobody has any. */
async function advance(d, run) {
  const enc = run.security;
  if (!enc) return;
  const next = enc.order.find(key => (sideOf(enc, key)?.actions ?? 0) > 0);
  if (next) {
    enc.turn = next;
    return;
  }
  const lines = [];
  const rolls = await rollInitiative(enc, lines);
  await post(d, run, loc("EDGELINER.Delve.InitTitle"), lines, { rolls, crewOnly: true });
}

/** Use one of a side's actions (or all of them, passing), then move on if they're out. */
async function spend(d, run, key, all = false) {
  const side = sideOf(run.security ?? { sides: [] }, key);
  if (!side) return;
  side.actions = all ? 0 : Math.max(side.actions - 1, 0);
  if (side.actions > 0) return;
  await advance(d, run);
}

/**
 * A hacker leaves the fight (Smoke, a crashed deck, jacking out). If nobody's left the encounter ends; if it was
 * their turn, the next side goes.
 */
async function leaveFight(d, run, uuid, lines) {
  const enc = run.security;
  if (!enc?.fighters.includes(uuid)) return;
  enc.fighters = enc.fighters.filter(u => u !== uuid);
  enc.sides = enc.sides.filter(s => s.key !== uuid);
  enc.order = enc.order.filter(k => k !== uuid);
  if (!enc.fighters.length) {
    run.security = null;
    lines.push(loc("EDGELINER.Delve.NoFighters"));
    return;
  }
  lines.push(fmt("EDGELINER.Delve.LeftFight", { name: nameOf(uuid) }));
  if (enc.turn === uuid) await advance(d, run);
}

/* -------------------------------------------------------------------------- */
/*  Gates                                                                     */
/* -------------------------------------------------------------------------- */

/** Everyone in the run with access who hasn't tried the gate yet. */
const gateWaiting = (d, run) => (run.gate ? inside(d, run).filter(u => !run.gate.evades.some(e => e.uuid === u)) : []);

/** Once everyone has tried: through if anyone got through (and the cache with them), held if nobody did. */
function settleGate(d, run, lines) {
  if (!run.gate || gateWaiting(d, run).length) return;
  const through = run.gate.evades.some(e => e.success);
  run.gate = null;
  lines.push(loc(through ? "EDGELINER.Delve.GateThrough" : "EDGELINER.Delve.GateHeld"));
  if (settleLocked(d, run, through ? "recovered" : "lost")) lines.push(loc(through ? "EDGELINER.Delve.CacheRecovered" : "EDGELINER.Delve.CacheLost"));
}

/* -------------------------------------------------------------------------- */
/*  State changes (the active GM's client)                                    */
/* -------------------------------------------------------------------------- */

/** The hacker's deck, if they can hack, or why not. */
function deckOf(uuid) {
  const hacker = actorOf(uuid);
  if (!hacker) return { problem: loc("EDGELINER.Delve.NoHacker") };
  const { deck, problem } = hackingReady(hacker);
  return problem ? { hacker, problem } : { hacker, deck, stats: deck.system.stats };
}

/** Take a hacker out of their run (and its fight), dropping the run if it empties. */
async function removeFromRun(d, uuid, lines = []) {
  const run = runOf(d, uuid);
  if (!run) return null;
  await leaveFight(d, run, uuid, lines);
  run.members = run.members.filter(u => u !== uuid);
  if (!run.members.length) d.runs = d.runs.filter(r => r !== run);
  else settleGate(d, run, lines);
  return run;
}

const OPS = {
  field(d, { key, value }) {
    if (!(key in FIELDS)) return;
    if (key === "rank" && !(value in EDGELINER.securityRanks)) return;
    d[key] = FIELDS[key](value);
    // A new security rank brings its own Alert Threshold (p. 10); the GM can still adjust it afterwards.
    if (key === "rank") d.threshold = EDGELINER.securityRanks[d.rank].alert;
  },

  /** Jack a hacker into the system: into the run they were dropped on (if it's idle), or a run of their own. */
  join(d, { uuid, runId }) {
    if (!actorOf(uuid) || hackerEntry(d, uuid)) return;
    d.hackers.push({ uuid, access: false, retryAt: null });
    const target = runById(d, runId);
    let run;
    if (target && idle(target)) {
      target.members.push(uuid);
      run = target;
    } else {
      run = newRun([uuid]);
      d.runs.push(run);
    }
    note(d, run, fmt("EDGELINER.Delve.Joined", { name: nameOf(uuid) }));
  },

  async jackOut(d, { uuid }) {
    if (!hackerEntry(d, uuid)) return;
    const lines = [fmt("EDGELINER.Delve.JackedOut", { name: nameOf(uuid) })];
    const run = await removeFromRun(d, uuid, lines);
    d.hackers = d.hackers.filter(h => h.uuid !== uuid);
    note(d, run?.members.length ? run : null, lines.join(" "));
  },

  /** Go separate ways: the hacker leaves for a run of their own (keeping the round count). */
  split(d, { uuid }) {
    const run = runOf(d, uuid);
    if (!run || run.members.length < 2 || !idle(run)) return;
    run.members = run.members.filter(u => u !== uuid);
    const own = newRun([uuid], run.round);
    d.runs.push(own);
    note(d, own, fmt("EDGELINER.Delve.SplitOff", { name: nameOf(uuid) }));
  },

  /** Proceed together: the hacker joins another run. */
  merge(d, { uuid, runId }) {
    const from = runOf(d, uuid);
    const to = runById(d, runId);
    if (!from || !to || from === to || !idle(from) || !idle(to)) return;
    from.members = from.members.filter(u => u !== uuid);
    if (!from.members.length) d.runs = d.runs.filter(r => r !== from);
    to.members.push(uuid);
    to.round = Math.max(to.round, from.round);
    note(d, to, fmt("EDGELINER.Delve.JoinedRun", { name: nameOf(uuid), run: runLabel(to) }));
  },

  /** Gain access: the hacker's own Hacking check against the standard TN (made on their client). */
  async access(d, { uuid, success }) {
    const h = hackerEntry(d, uuid);
    if (!h || h.access || shutdown(d) || !canRetry(d, uuid)) return;
    h.access = !!success;
    h.retryAt = success ? null : d.searches + 1;
    const others = d.hackers.some(o => o.uuid !== uuid && o.access);
    const text = success ? fmt("EDGELINER.Delve.AccessGainedBy", { name: nameOf(uuid) })
      : fmt(others ? "EDGELINER.Delve.AccessDeniedWait" : "EDGELINER.Delve.AccessDeniedBy", { name: nameOf(uuid) });
    await post(d, runOf(d, uuid), "", [text], { quiet: true });
  },

  /** The run's usage check (d12). Security must be dealt with, and a gate passed, before searching on. */
  async round(d, { uuid }) {
    const run = runOf(d, uuid);
    if (!run || !hasAccess(d, uuid) || !idle(run) || shutdown(d)) return;
    const roll = await new Roll("1d12").evaluate();
    const found = delveResult(roll.total);
    run.round += 1;
    d.searches += 1;
    const lines = [fmt("EDGELINER.Delve.RoundRoll", { round: run.round, roll: roll.total })];
    const secret = [];
    const rolls = [roll];
    if (found.security) {
      lines.push(loc("EDGELINER.Delve.Security"));
      raiseAlert(d, lines, secret);
      const fighters = inside(d, run).filter(u => !deckOf(u).problem);
      if (!shutdown(d) && fighters.length) {
        run.security = newSecurity(fighters);
        rolls.push(...await rollInitiative(run.security, lines));
      }
    }
    if (found.obstacle && !shutdown(d)) {
      run.gate = { evades: [] };
      lines.push(loc("EDGELINER.Delve.Gate"));
    }
    if (found.cache) {
      const value = cacheValue(roll.total);
      cachesOf(d).push(newCache(run, run.gate ? "locked" : "recovered", value));
      lines.push(fmt(run.gate ? "EDGELINER.Delve.CacheBehindGate" : "EDGELINER.Delve.Cache", { value: loc(`EDGELINER.DataCache.Value.${value}`) }));
    }
    if (!found.security && !found.obstacle && !found.cache) lines.push(loc("EDGELINER.Delve.Nothing"));
    await post(d, run, fmt("EDGELINER.Delve.Round", { n: run.round }), lines, { secret, rolls, crewOnly: true });
  },

  /** One hacker's try at the gate (their check). A failure raises the alert; the gate settles once all have tried. */
  async evade(d, { uuid, success }) {
    const run = runOf(d, uuid);
    if (!run?.gate || !gateWaiting(d, run).includes(uuid)) return;
    run.gate.evades.push({ uuid, success: !!success });
    const lines = [fmt(success ? "EDGELINER.Delve.EvadedBy" : "EDGELINER.Delve.TrippedBy", { name: nameOf(uuid) })];
    const secret = [];
    if (!success) raiseAlert(d, lines, secret);
    settleGate(d, run, lines);
    const waiting = gateWaiting(d, run);
    if (run.gate && waiting.length) lines.push(fmt("EDGELINER.Delve.GateWaiting", { names: joinNames(waiting.map(nameOf)) }));
    await post(d, run, loc("EDGELINER.Delve.GateTitle"), lines, { secret });
  },

  /** Leave the gate, and any cache behind it, alone: the whole run moves on. */
  leaveGate(d, { uuid }) {
    const run = runOf(d, uuid);
    if (!run?.gate) return;
    run.gate = null;
    const left = settleLocked(d, run, "left");
    note(d, run, loc(left ? "EDGELINER.Delve.LeftCache" : "EDGELINER.Delve.LeftGate"));
  },

  /** GM: fill in what a cache holds, or correct what became of it. */
  cacheField(d, { cacheId, key, value }) {
    const cache = cachesOf(d).find(c => c.id === cacheId);
    if (!cache || !(key in CACHE_FIELDS)) return;
    cache[key] = CACHE_FIELDS[key](value);
    if (key === "status" && cache.status === "recovered" && !cache.members.length) {
      const run = runById(d, cache.runId) ?? d.runs[0];
      if (run) cache.members = run.members.map(member);
    }
  },

  /** GM: a cache found by hand (outside the round roll), belonging to a run's hackers. */
  cacheAdd(d, { runId }) {
    const run = runById(d, runId) ?? d.runs[0] ?? null;
    cachesOf(d).push(newCache(run, "recovered"));
  },

  /** GM: send a recovered cache to its owners' Cyber tabs (a copy each, at a step less when shared). */
  async cacheGive(d, { cacheId }) {
    const cache = cachesOf(d).find(c => c.id === cacheId);
    if (!cache || !unsent(cache)) return;
    const names = await sendCache(d, cache);
    if (names.length) note(d, null, fmt("EDGELINER.Delve.CacheGiven", { name: joinNames(names) }));
  },

  /**
   * GM: send every ready cache (described and priced) to its owners. Caches still missing a description or price
   * stay behind.
   */
  async cacheGiveAll(d) {
    const sent = new Map();
    for (const cache of cachesOf(d).filter(cacheReady)) {
      for (const name of await sendCache(d, cache)) sent.set(name, (sent.get(name) ?? 0) + 1);
    }
    for (const [name, n] of sent) note(d, null, fmt("EDGELINER.Delve.CachesGiven", { n, name }));
  },

  cacheRemove(d, { cacheId }) {
    d.caches = cachesOf(d).filter(c => c.id !== cacheId);
  },

  /** A hacker's attack on security (rolled on their client): their deck's damage, less security's armor. */
  async hackerAttack(d, { uuid, success, total, tn }) {
    const run = runOf(d, uuid);
    const h = deckOf(uuid);
    if (!run || h.problem || turnProblem(run, uuid)) return;
    const sec = EDGELINER.securityRanks[d.rank];
    const lines = [];
    if (success) {
      const wounds = countWounds({ base: h.stats.wounds, increment: h.stats.increment, tn: tn ?? sec.evasion, total: total ?? 0 });
      const taken = Math.max(wounds - sec.armor, 0);
      run.security.wounds += taken;
      lines.push(fmt("EDGELINER.Delve.HitSecurityBy", { name: nameOf(uuid), wounds, armor: sec.armor, taken, total: run.security.wounds, integrity: d.integrity }));
      if (run.security.wounds >= d.integrity) {
        run.security = null;
        lines.push(loc("EDGELINER.Delve.SecurityDown"));
      }
    } else lines.push(fmt("EDGELINER.Delve.MissSecurityBy", { name: nameOf(uuid) }));
    await post(d, run, loc("EDGELINER.Delve.HackerAttack"), lines);
    if (run.security) await spend(d, run, uuid);
  },

  /**
   * Security attacks the deck the GM picks (GM): its attribute + skill (advantage once boosted) against that
   * deck's Evasion. A deck brought to 0 Health crashes: that hacker is out of the fight and loses access.
   */
  async securityAttack(d, { runId, target }) {
    const run = runById(d, runId);
    const problem = turnProblem(run, SECURITY);
    if (problem) return ui.notifications.warn(problem);
    const enc = run.security;
    const victim = enc.fighters.includes(target) ? target : enc.fighters.length === 1 ? enc.fighters[0] : null;
    if (!victim) return ui.notifications.warn(loc("EDGELINER.Delve.PickTarget"));
    const h = deckOf(victim);
    if (h.problem) return ui.notifications.warn(h.problem);
    const sec = EDGELINER.securityRanks[d.rank];
    const { die, bonus } = CoreRules.attributeStep(sec.rank);
    const boosted = alertState(d.alert, d.threshold) === "boosted";
    const roll = await new Roll(`1d${die} + ${bonus} + ${sec.skill}${boosted ? " + 1d6" : ""}`).evaluate();
    const tn = h.stats.evasion;
    const wounds = countWounds({ base: sec.wounds, increment: sec.increment, tn, total: roll.total });
    // Spell the roll out (the die, then each bonus), so the table sees what was rolled, not just the total.
    const parts = [
      fmt("EDGELINER.Delve.RollDie", { roll: roll.dice?.[0]?.total ?? "?", die: `d${die}` }),
      fmt("EDGELINER.Delve.RollAttribute", { n: bonus }),
      fmt("EDGELINER.Delve.RollSkill", { n: sec.skill })
    ];
    if (boosted) parts.push(fmt("EDGELINER.Delve.RollAlert", { roll: roll.dice?.[1]?.total ?? "?" }));
    const lines = [fmt("EDGELINER.Delve.SecurityRollAt", {
      name: nameOf(victim), total: roll.total, tn, parts: parts.join(", "), boosted: boosted ? ` (${loc("EDGELINER.Delve.BoostedShort")})` : ""
    })];
    const rolls = [roll];
    let crashed = false;
    if (wounds > 0) {
      const result = await damageDeck(h.deck, wounds);
      rolls.push(...result.rolls);
      lines.push(fmt("EDGELINER.Delve.DeckHit", { deck: h.deck.name, wounds, armor: result.armor, taken: result.taken, health: result.health }), ...result.lines);
      crashed = result.health <= 0;
    } else lines.push(loc("EDGELINER.Delve.SecurityMissed"));
    if (crashed) {
      const entry = hackerEntry(d, victim);
      if (entry) entry.access = false;
      // Security's action is spent before the crashed hacker leaves, so the turn moves on correctly.
      sideOf(enc, SECURITY).actions = Math.max(sideOf(enc, SECURITY).actions - 1, 0);
      await leaveFight(d, run, victim, lines);
      await post(d, run, loc("EDGELINER.Delve.SecurityAttack"), lines, { rolls });
      if (run.security && run.security.turn === SECURITY && sideOf(run.security, SECURITY).actions <= 0) await advance(d, run);
      return;
    }
    await post(d, run, loc("EDGELINER.Delve.SecurityAttack"), lines, { rolls });
    await spend(d, run, SECURITY);
  },

  /** Smoke: the hacker's check to get out of the fight (the alert has already risen). The others fight on. */
  async smoke(d, { uuid, success }) {
    const run = runOf(d, uuid);
    if (!run || turnProblem(run, uuid)) return;
    const lines = [fmt(success ? "EDGELINER.Delve.EscapedBy" : "EDGELINER.Delve.NotEscapedBy", { name: nameOf(uuid) })];
    if (success) {
      sideOf(run.security, uuid).actions = 0;
      await leaveFight(d, run, uuid, lines);
      await post(d, run, loc("EDGELINER.Program.smoke.Name"), lines, { quiet: true });
      return;
    }
    await post(d, run, loc("EDGELINER.Program.smoke.Name"), lines, { quiet: true });
    await spend(d, run, uuid);
  },

  /** Give up the rest of a side's actions this exchange. Players can only pass for their own hackers. */
  async pass(d, { runId, side }, user) {
    const run = runById(d, runId) ?? runOf(d, side);
    if (!run?.security || run.security.turn !== side) return;
    if (side === SECURITY && !user.isGM) return;
    note(d, run, fmt("EDGELINER.Delve.Passed", { name: sideName(side) }));
    await spend(d, run, side, true);
  },

  /** GM: roll a new exchange now. */
  async initiative(d, { runId }) {
    const run = runById(d, runId);
    if (!run?.security) return;
    const lines = [];
    const rolls = await rollInitiative(run.security, lines);
    await post(d, run, loc("EDGELINER.Delve.InitTitle"), lines, { rolls, crewOnly: true });
  },

  endEncounter(d, { runId }) {
    const run = runById(d, runId);
    if (!run?.security) return;
    run.security = null;
    note(d, run, loc("EDGELINER.Delve.EncounterEnded"));
  },

  alert(d, { delta }) {
    d.alert = Math.max(d.alert + (Number(delta) || 0), 0);
  }
};

/** One change at a time, so two requests arriving together don't overwrite each other. */
let queue = Promise.resolve();

/** Apply a request: the GM may do anything; a player only acts for their own hackers. */
function applyOp(data) {
  queue = queue.then(() => applyNow(data)).catch(err => console.error(`${MODULE} | delve`, err));
  return queue;
}

async function applyNow({ op, delveId, payload = {}, userId }) {
  const user = game.users.get(userId);
  if (!user) return;
  const delves = getDelves();
  if (op === "add") {
    if (!user.isGM) return;
    delves.push({ ...newDelve(), name: fmt("EDGELINER.Delve.DefaultName", { n: delves.length + 1 }) });
    return saveDelves(delves);
  }
  const d = delves.find(x => x.id === delveId);
  if (!d) return;
  if (!user.isGM && !playerMay(user, d, op, payload)) return;
  if (op === "remove") return user.isGM ? saveDelves(delves.filter(x => x !== d)) : undefined;
  if (!OPS[op]) return;
  await OPS[op](d, payload, user);
  d.log = d.log.slice(-LOG_LIMIT);
  return saveDelves(delves);
}

const delveIdOf = target => target.closest("[data-delve-id]")?.dataset.delveId;
const runIdOf = target => target.closest("[data-run-id]")?.dataset.runId;
const uuidOf = target => target.closest("[data-uuid]")?.dataset.uuid;

/**
 * Which delves this user has folded away. Kept per user (a flag on their User), so the GM can file old delves
 * without hiding them from the players, and each player folds their own.
 */
const COLLAPSED = "collapsedDelves";
const collapsedIds = () => game.user.getFlag(MODULE, COLLAPSED) ?? [];
async function setCollapsed(ids) {
  // Forget delves that no longer exist, so the list doesn't grow forever.
  const live = new Set(getDelves().map(d => d.id));
  await game.user.setFlag(MODULE, COLLAPSED, [...new Set(ids)].filter(id => live.has(id)));
  DelveApp.refresh();
}

/** Send a change to the active GM (or apply it, if this is the GM). */
function request(op, delveId, payload = {}) {
  const data = { scope: "delve", op, delveId, payload, userId: game.user.id };
  if (game.user.isGM) return applyOp(data);
  if (!game.users.activeGM) return ui.notifications.warn(loc("EDGELINER.Delve.NeedGM"));
  game.socket.emit(CHANNEL, data);
}

/* -------------------------------------------------------------------------- */
/*  The window                                                                */
/* -------------------------------------------------------------------------- */

export class DelveApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "edgeliner-delves",
    classes: ["pentra", "edgeliner", "delve-app"],
    window: { title: "EDGELINER.Delve.Title", icon: "fa-solid fa-network-wired", resizable: true },
    position: { width: 660, height: "auto" },
    actions: {
      add: () => request("add"),
      remove: DelveApp.#delve("remove"),
      access: DelveApp.#onAccess,
      round: DelveApp.#hacker("round"),
      evade: DelveApp.#onEvade,
      leaveGate: DelveApp.#hacker("leaveGate"),
      hackerAttack: DelveApp.#onHackerAttack,
      securityAttack: DelveApp.#onSecurityAttack,
      smoke: DelveApp.#onSmoke,
      pass: DelveApp.#onPass,
      initiative: DelveApp.#run("initiative"),
      endEncounter: DelveApp.#run("endEncounter"),
      jackOut: DelveApp.#hacker("jackOut"),
      split: DelveApp.#hacker("split"),
      alert: DelveApp.#onAlert,
      openHacker: DelveApp.#onOpenHacker,
      toggleCollapse: DelveApp.#onToggleCollapse,
      collapseAll: DelveApp.#onCollapseAll,
      expandAll: () => setCollapsed([]),
      cacheAdd: DelveApp.#run("cacheAdd"),
      cacheRemove: DelveApp.#cache("cacheRemove"),
      cacheGive: DelveApp.#cache("cacheGive"),
      cacheGiveAll: DelveApp.#delve("cacheGiveAll"),
      cacheGiveEverywhere: DelveApp.#onCacheGiveEverywhere
    }
  };

  static PARTS = { main: { template: `modules/${MODULE}/templates/apps/delve.hbs`, scrollable: [".delve-list"] } };

  static #instance = null;

  static open() {
    this.#instance ??= new this();
    return this.#instance.render({ force: true });
  }

  static refresh() {
    if (this.#instance?.rendered) this.#instance.render();
  }

  /** @override */
  async _prepareContext() {
    const isGM = game.user.isGM;
    const folded = new Set(collapsedIds());
    const ranks = Object.fromEntries(Object.keys(EDGELINER.securityRanks).map(k => [k, `EDGELINER.Security.${k}`]));
    const delves = getDelves().map(d => {
      const sec = EDGELINER.securityRanks[d.rank];
      const state = alertState(d.alert, d.threshold);
      const seeAlert = isGM || d.showAlert;
      const down = state === "shutdown";
      const mineUuid = uuid => isGM || !!actorOf(uuid)?.isOwner;

      const memberView = (run, uuid) => {
        const actor = actorOf(uuid);
        const h = hackerEntry(d, uuid);
        const { deck, problem } = actor ? hackingReady(actor) : { deck: null, problem: loc("EDGELINER.Delve.NoHacker") };
        const stats = deck?.system.stats ?? null;
        const evade = run.gate?.evades.find(e => e.uuid === uuid);
        const mine = mineUuid(uuid);
        return {
          uuid, mine, name: actor?.name ?? "?", img: actor?.img ?? "",
          hacking: actor?.system.skills?.hacking ?? 0,
          access: !!h?.access, problem,
          deck: deck ? {
            name: deck.name, health: deck.system.health.value, max: deck.system.health.max, evasion: stats.evasion, armor: stats.armor,
            damage: `${stats.wounds} (${loc(PENTRA.increments[stats.increment])})`, stealth: stats.stealth, smoke: stats.smoke
          } : null,
          canAccess: mine && !h?.access && !problem && !down && canRetry(d, uuid),
          waiting: !h?.access && !down && !canRetry(d, uuid),
          inFight: !!run.security?.fighters.includes(uuid),
          gateTried: evade ? (evade.success ? "through" : "tripped") : "",
          canEvade: mine && !!run.gate && !evade && !!h?.access && !problem && !down,
          canSplit: mine && run.members.length > 1 && idle(run),
          mergeTargets: mine && idle(run) ? d.runs.filter(r => r !== run && idle(r)).map(r => ({ id: r.id, label: runLabel(r) })) : []
        };
      };

      const runs = d.runs.map((run, i) => {
        const members = run.members.map(uuid => memberView(run, uuid));
        // Next round is clicked as the first of this user's hackers in the run who is in.
        const searcher = members.find(m => m.mine && m.access && !m.problem);
        const enc = run.security;
        const fight = enc ? {
          exchange: enc.exchange, rolled: !!enc.turn, wounds: enc.wounds,
          sides: (enc.order.length ? enc.order : enc.sides.map(s => s.key)).map(key => {
            const s = sideOf(enc, key);
            return { key, name: sideName(key), isSecurity: key === SECURITY, die: CoreRules.formatDie(s.die), total: s.total, actions: s.actions, active: enc.turn === key };
          }),
          // The hacker whose turn it is, if this user plays them.
          myTurn: enc.turn && enc.turn !== SECURITY && mineUuid(enc.turn) ? members.find(m => m.uuid === enc.turn) ?? null : null,
          securityTurn: enc.turn === SECURITY,
          targets: enc.fighters.map(uuid => ({ uuid, name: nameOf(uuid) }))
        } : null;
        return {
          id: run.id, n: i + 1, label: runLabel(run), round: run.round, members, fight,
          gate: run.gate ? { waiting: gateWaiting(d, run).map(nameOf), waitingText: joinNames(gateWaiting(d, run).map(nameOf)) } : null,
          searcher: searcher?.uuid ?? "",
          canSearch: !!searcher && idle(run) && !down,
          mine: members.some(m => m.mine),
          // Anyone in the run can walk away from a gate.
          leaver: members.find(m => m.mine)?.uuid ?? ""
        };
      });

      const caches = cachesOf(d).map(c => {
        const owners = c.members.map(m => m.name);
        const share = shareWorth(c, c.members.length);
        return {
          ...c, statusLabel: loc(`EDGELINER.Delve.CacheStatus.${c.status}`),
          valueLabel: c.value ? loc(`EDGELINER.DataCache.Value.${c.value}`) : "",
          worthLabel: isGM || c.status === "recovered" ? worthLabel(c) : "",
          // Shared caches: each copy is worth a step less.
          shareLabel: c.members.length > 1 && c.worthDie ? fmt("EDGELINER.Delve.EachCopy", { worth: worthLabel(share) }) : "",
          by: owners.length ? joinNames(owners) : "",
          canGive: isGM && unsent(c),
          // Players learn what's inside only once it's theirs.
          shown: isGM || c.status === "recovered" ? c.contents : ""
        };
      });

      return {
        id: d.id, name: d.name, rank: d.rank, alert: d.alert, threshold: d.threshold, showAlert: d.showAlert, integrity: d.integrity,
        seeAlert, collapsed: folded.has(d.id), runs,
        hackerCount: d.hackers.length, searches: d.searches,
        summaryNames: joinNames(d.hackers.map(h => nameOf(h.uuid))),
        fighting: d.runs.some(r => r.security),
        caches, cacheValues: valueOptions(), worthDice: worthDieOptions(), worthMults: worthMultOptions(), cacheStatuses: Object.fromEntries(CACHE_STATUS.map(k => [k, `EDGELINER.Delve.CacheStatus.${k}`])),
        recovered: caches.filter(c => c.status === "recovered").length,
        readyCount: isGM ? cachesOf(d).filter(cacheReady).length : 0,
        waitingCount: isGM ? cachesOf(d).filter(c => unsent(c) && !cacheReady(c)).length : 0,
        rankLabel: loc(ranks[d.rank]),
        secLabel: `${CoreRules.formatAttribute(sec.rank)} · ${loc("PENTRA.Skill.label")} ${sec.skill} · ${loc("PENTRA.Trait.evasion")} ${sec.evasion} · AR ${sec.armor} · ${sec.wounds} (${loc(PENTRA.increments[sec.increment])})`,
        state: seeAlert ? state : "", boosted: seeAlert && state === "boosted", shutdown: down,
        shutdownAt: 2 * Math.max(d.threshold, 1),
        ranks,
        // The whole history, oldest first (the window scrolls it to the newest).
        log: d.log.map(e => (typeof e === "string" ? { text: e } : { text: e.text, parts: e.parts, round: e.round, who: e.who, secret: seeAlert ? e.secret : "" }))
      };
    });
    return { delves, isGM, readyTotal: delves.reduce((n, d) => n + d.readyCount, 0) };
  }

  /** Where each delve's log was scrolled, so a re-render doesn't yank someone reading back. @override */
  _preRender(context, options) {
    this.#logScroll = new Map();
    for (const log of this.element?.querySelectorAll(".delve-log") ?? []) {
      const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
      this.#logScroll.set(delveIdOf(log), atEnd ? null : log.scrollTop);
    }
    return super._preRender(context, options);
  }

  #logScroll = new Map();

  /** Inline edits (GM), the run-merge dropdowns, and dropping a character onto a delve or a run. @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Follow the newest entry, unless the reader had scrolled back.
    for (const log of this.element.querySelectorAll(".delve-log")) {
      const top = this.#logScroll.get(delveIdOf(log));
      log.scrollTop = top ?? log.scrollHeight;
    }
    for (const input of this.element.querySelectorAll("[data-delve-field]")) {
      input.addEventListener("change", () => {
        const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        request("field", delveIdOf(input), { key: input.dataset.delveField, value });
      });
    }
    for (const input of this.element.querySelectorAll("[data-cache-field]")) {
      input.addEventListener("change", () => request("cacheField", delveIdOf(input), {
        cacheId: input.closest("[data-cache-id]")?.dataset.cacheId, key: input.dataset.cacheField, value: input.value
      }));
    }
    for (const select of this.element.querySelectorAll("select.merge-run")) {
      select.addEventListener("change", () => {
        if (select.value) request("merge", delveIdOf(select), { uuid: uuidOf(select), runId: select.value });
      });
    }
    for (const zone of this.element.querySelectorAll("[data-delve-id]")) {
      zone.addEventListener("dragover", e => e.preventDefault());
      zone.addEventListener("drop", e => {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
        if (data?.type !== "Actor") return;
        e.stopPropagation();
        const actor = fromUuidSync(data.uuid);
        if (!game.user.isGM && !actor?.isOwner) return ui.notifications.warn(loc("EDGELINER.Delve.OwnOnly"));
        // Dropped on a run: proceed together with it. Anywhere else: a run of their own.
        return request("join", zone.dataset.delveId, { uuid: data.uuid, runId: e.target.closest?.("[data-run-id]")?.dataset.runId ?? "" });
      });
    }
  }

  /** An action on the delve itself. */
  static #delve(op) {
    return function (event, target) {
      return request(op, delveIdOf(target));
    };
  }

  /** An action on a run (GM). */
  static #run(op) {
    return function (event, target) {
      return request(op, delveIdOf(target), { runId: runIdOf(target) });
    };
  }

  /** An action on a cache (GM). */
  static #cache(op) {
    return function (event, target) {
      return request(op, delveIdOf(target), { cacheId: target.closest("[data-cache-id]")?.dataset.cacheId });
    };
  }

  /** An action a hacker takes, with no roll on this client. */
  static #hacker(op) {
    return function (event, target) {
      return request(op, delveIdOf(target), { uuid: uuidOf(target), runId: runIdOf(target) });
    };
  }

  /** The hacker named on the button, ready to roll on this client, or null (with a warning). */
  #ready(target, check = () => null) {
    const id = delveIdOf(target);
    const uuid = uuidOf(target);
    const d = getDelves().find(x => x.id === id);
    if (!d || !uuid) return null;
    const h = deckOf(uuid);
    if (h.problem) {
      ui.notifications.warn(h.problem);
      return null;
    }
    if (!h.hacker.isOwner) return null;
    const run = runOf(d, uuid);
    const problem = check(d, run, uuid, h);
    if (problem) {
      ui.notifications.warn(problem);
      return null;
    }
    return { id, d, run, uuid, ...h };
  }

  /** Gain access to the node: the hacker's own Hacking check against the standard TN. */
  static async #onAccess(event, target) {
    const r = this.#ready(target, (d, run, uuid) => (canRetry(d, uuid) ? null : loc("EDGELINER.Delve.WaitRetry")));
    if (!r) return;
    const msg = await Rolls.rollCheck(r.hacker, { type: "skill", key: "hacking", label: fmt("EDGELINER.Delve.AccessLabel", { name: r.d.name }) });
    if (msg) return request("access", r.id, { uuid: r.uuid, success: !!msg.getFlag(SYSTEM, "success") });
  }

  /** Evade a password gate: Hacking check (Stealth program +1). */
  static async #onEvade(event, target) {
    const r = this.#ready(target, (d, run) => (run?.gate ? null : loc("EDGELINER.Delve.NoGate")));
    if (!r) return;
    const extraModifiers = r.stats.stealth ? [{ label: loc("EDGELINER.Program.stealth.Name"), value: 1 }] : [];
    const msg = await Rolls.rollCheck(r.hacker, { type: "skill", key: "hacking", extraModifiers, label: fmt("EDGELINER.Delve.EvadeLabel", { name: r.d.name }) });
    if (msg) return request("evade", r.id, { uuid: r.uuid, success: !!msg.getFlag(SYSTEM, "success") });
  }

  /** Attack security with the deck: a Hacking check against the security's Evasion. */
  static async #onHackerAttack(event, target) {
    const r = this.#ready(target, (d, run, uuid) => turnProblem(run, uuid));
    if (!r) return;
    const sec = EDGELINER.securityRanks[r.d.rank];
    const msg = await Rolls.rollCheck(r.hacker, {
      type: "skill", key: "hacking", tn: sec.evasion,
      label: fmt("EDGELINER.Delve.AttackLabel", { deck: r.deck.name })
    });
    if (!msg) return;
    return request("hackerAttack", r.id, {
      uuid: r.uuid, success: !!msg.getFlag(SYSTEM, "success"), tn: msg.getFlag(SYSTEM, "tn") ?? sec.evasion, total: msg.rolls?.[0]?.total ?? 0
    });
  }

  /** The Smoke program: a Hacking check to get out of the fight. */
  static async #onSmoke(event, target) {
    const r = this.#ready(target, (d, run, uuid) => turnProblem(run, uuid));
    if (!r) return;
    if (!r.stats.smoke) return ui.notifications.warn(loc("EDGELINER.Delve.NeedSmoke"));
    const msg = await Rolls.rollCheck(r.hacker, { type: "skill", key: "hacking", label: fmt("EDGELINER.Delve.SmokeLabel", { name: r.hacker.name }) });
    if (msg) return request("smoke", r.id, { uuid: r.uuid, success: !!msg.getFlag(SYSTEM, "success") });
  }

  /** GM: security attacks the deck picked in the fight's target dropdown. */
  static #onSecurityAttack(event, target) {
    const pick = target.closest(".encounter")?.querySelector("select.sec-target")?.value ?? "";
    return request("securityAttack", delveIdOf(target), { runId: runIdOf(target), target: pick });
  }

  static #onPass(event, target) {
    return request("pass", delveIdOf(target), { runId: runIdOf(target), side: target.dataset.side ?? uuidOf(target) });
  }

  static #onAlert(event, target) {
    return request("alert", delveIdOf(target), { delta: Number(target.dataset.delta) || 0 });
  }

  /** GM: send the ready caches of every delve at once. */
  static async #onCacheGiveEverywhere() {
    const delves = getDelves().filter(d => cachesOf(d).some(cacheReady));
    if (!delves.length) return ui.notifications.info(loc("EDGELINER.Delve.NoneReady"));
    for (const d of delves) await request("cacheGiveAll", d.id);
  }

  static #onToggleCollapse(event, target) {
    const id = delveIdOf(target);
    const ids = collapsedIds();
    return setCollapsed(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  /** Fold every delve this user can see. */
  static async #onCollapseAll() {
    const context = await this._prepareContext();
    return setCollapsed([...collapsedIds(), ...context.delves.map(d => d.id)]);
  }

  static #onOpenHacker(event, target) {
    actorOf(uuidOf(target))?.sheet.render(true);
  }
}
