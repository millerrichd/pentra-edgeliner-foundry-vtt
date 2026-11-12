/**
 * Recovered data caches. A delve records each cache it turns up, including its value tier from the round's d12
 * (4 low, 8 mid, 12 high). Once a cache is recovered the GM sends it to the hacker, and it's kept on their
 * character (shown on the Cyber tab) so the GM can price it up afterwards, whatever happens to the delve.
 *
 * The GM prices a cache as a Resource Die value (die and multiplier, like a cost). The character sells it for
 * that: rolled against their Resource Die the way any sale is, but for the full value (the price is what a buyer
 * pays for the data, so there's no resale markdown). Selling removes it.
 */
import { MODULE, EDGELINER } from "./config.js";
import { Rolls, CoreRules } from "./core.js";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

const FLAG = "dataCaches";

export const CACHE_VALUES = ["low", "mid", "high"];

/** The value tier for a round's d12, or "" if it didn't find a cache. */
export const cacheValue = d12 => EDGELINER.cacheValues[d12] ?? "";

/** Resource Die values the GM can price a cache at. 0 = not priced yet. */
export const WORTH_DICE = [4, 6, 8, 10, 12];
export const WORTH_MULTS = [1, 2, 3, 4, 5, 6];
const clampDie = v => (WORTH_DICE.includes(Number(v)) ? Number(v) : 0);
const clampMult = v => (WORTH_MULTS.includes(Number(v)) ? Number(v) : 1);
export const worthDieOptions = () => Object.fromEntries(WORTH_DICE.map(d => [d, `d${d}`]));
export const worthMultOptions = () => Object.fromEntries(WORTH_MULTS.map(m => [m, `x${m}`]));
export const worthLabel = c => (c?.worthDie ? CoreRules.formatCost(c.worthDie, c.worthMult || 1) : "");

export const valueOptions = () => Object.fromEntries(CACHE_VALUES.map(k => [k, `EDGELINER.DataCache.Value.${k}`]));

/** The caches kept on a character. */
export const actorCaches = actor => foundry.utils.deepClone(actor?.getFlag(MODULE, FLAG) ?? []);

const save = (actor, caches) => actor.setFlag(MODULE, FLAG, caches);

/** Keep a recovered cache on the character. Sending the same cache twice does nothing. */
export async function giveCache(actor, entry) {
  const caches = actorCaches(actor);
  if (caches.some(c => c.id === entry.id)) return false;
  caches.push({
    id: entry.id, value: entry.value ?? "", contents: entry.contents ?? "", delve: entry.delve ?? "", round: entry.round ?? null,
    worthDie: clampDie(entry.worthDie), worthMult: clampMult(entry.worthMult)
  });
  await save(actor, caches);
  return true;
}

export const FIELDS = { contents: String, value: v => (CACHE_VALUES.includes(v) ? v : ""), worthDie: clampDie, worthMult: clampMult };

export function updateActorCache(actor, id, key, value) {
  if (!(key in FIELDS)) return;
  const caches = actorCaches(actor);
  const cache = caches.find(c => c.id === id);
  if (!cache) return;
  cache[key] = FIELDS[key](value);
  return save(actor, caches);
}

/** The owner sells a priced cache for its Resource Die value, then it's gone. */
export async function sellActorCache(actor, id) {
  if (!actor?.isOwner) return;
  const cache = actorCaches(actor).find(c => c.id === id);
  if (!cache) return;
  if (!cache.worthDie) return ui.notifications.warn(loc("EDGELINER.DataCache.NotPriced"));
  const name = cache.contents || loc("EDGELINER.DataCache.Unnamed");
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: loc("PENTRA.Sell.Title") },
    content: `<p>${fmt("EDGELINER.DataCache.SellConfirm", { name: foundry.utils.escapeHTML(name), worth: worthLabel(cache) })}</p>`
  });
  if (!ok) return;
  await Rolls.reward(actor, {
    die: cache.worthDie, multiplier: cache.worthMult || 1,
    title: fmt("PENTRA.Sell.Label", { label: name }), valueLabel: loc("PENTRA.Sell.Value")
  });
  return removeActorCache(actor, id);
}

export const removeActorCache = (actor, id) => save(actor, actorCaches(actor).filter(c => c.id !== id));
