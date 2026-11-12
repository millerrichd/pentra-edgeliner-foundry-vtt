/**
 * The power builder: choose a power, pick one option from each of its groups, watch the Construction Points, target
 * number, drain range and odds update, then cast it (or save the build for one-click casting).
 */
import { PENTRA } from "../core.js";
import { MODULE, POWER_SKILLS } from "../config.js";
import { PSYCHIC_POWERS, TOTEM_POWERS, WORDS, TOTEM_ANIMALS } from "../powers-data.js";
import * as R from "../rules.js";
import { buildPower, castPreview, castPower } from "../powers.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

/** Saved builds live on the actor (picks normalized, so builds saved with the old dotted ids still load). */
export const savedBuilds = actor => (actor.getFlag(MODULE, "builds") ?? []).map(b => ({ ...b, picks: R.normalizePicks(b.picks) }));

export class PowerCaster extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {Actor} actor
   * @param {object} [sel]    Initial power selection
   * @param {object} [picks]  Initial picks
   * @param {object} [build]  The saved build being edited ({id, name}): Save then updates it in place.
   */
  constructor(actor, sel = null, picks = {}, { build = null, ...options } = {}) {
    super({ ...options, id: `edgeliner-caster-${actor.id}-${build?.id ?? "new"}` });
    this.actor = actor;
    this.sel = sel ?? this.#defaultSelection();
    this.picks = { ...picks };
    this.buildId = build?.id ?? null;
    this.buildName = build?.name ?? "";
  }

  static DEFAULT_OPTIONS = {
    classes: ["pentra", "edgeliner", "caster"],
    tag: "form",
    window: { title: "EDGELINER.Caster.Title", icon: "fa-solid fa-hand-sparkles", resizable: true },
    position: { width: 520, height: "auto" },
    form: { handler: PowerCaster.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      cast: PowerCaster.#onCast,
      save: PowerCaster.#onSave,
      saveNew: PowerCaster.#onSaveNew
    }
  };

  static PARTS = { body: { template: `modules/${MODULE}/templates/apps/caster.hbs` } };

  get title() {
    return fmt("EDGELINER.Caster.TitleFor", { name: this.actor.name });
  }

  /** The skills of the actor's tradition with ranks. */
  #known(category) {
    return Object.entries(POWER_SKILLS)
      .filter(([key, info]) => info.category === category && (this.actor.system.skills[key] ?? 0) > 0)
      .map(([key, info]) => ({ key, id: info.id, rank: this.actor.system.skills[key] }));
  }

  #defaultSelection() {
    const category = this.actor.system.powerTradition;
    const known = category ? this.#known(category) : [];
    if (category === "psychic" && known[0]) return { category, discipline: known[0].id, power: PSYCHIC_POWERS[known[0].id][0].id };
    if (category === "totem" && known[0]) return { category, aspect: known[0].id };
    if (category === "words") {
      const first = type => known.find(k => WORDS[k.id].type === type)?.id ?? null;
      return { category, action: first("action"), aspect: first("aspect"), target: first("target") };
    }
    return { category };
  }

  /** @override */
  async _prepareContext() {
    const actor = this.actor;
    const category = actor.system.powerTradition;
    const known = category ? this.#known(category) : [];
    const ctx = {
      category, categoryLabel: category ? loc(`EDGELINER.Power.${category}`) : null, buildName: this.buildName,
      editing: !!this.buildId && savedBuilds(actor).some(b => b.id === this.buildId)
    };
    if (!category) return { ...ctx, noTradition: true };

    if (category === "psychic") {
      ctx.choices = known.flatMap(k => PSYCHIC_POWERS[k.id].map(p => {
        const unlocked = R.psychicRatings(k.rank).includes(p.rating);
        return {
          value: `${k.id}.${p.id}`, disabled: !unlocked,
          label: `${loc(PENTRA.skills[k.key].label)}: ${p.name} (${p.rating})${unlocked ? "" : ` — ${loc("EDGELINER.Caster.Locked")}`}`,
          selected: this.sel.discipline === k.id && this.sel.power === p.id
        };
      }));
    } else if (category === "totem") {
      const animal = actor.system.totemAnimal;
      ctx.animal = animal ? TOTEM_ANIMALS[animal]?.name : null;
      ctx.choices = known.map(k => ({
        value: k.id, label: `${TOTEM_POWERS[k.id].name} (${loc(`EDGELINER.Tier.${R.totemCap(animal, k.id)}`)})`,
        selected: this.sel.aspect === k.id
      }));
    } else if (category === "words") {
      ctx.wordChoices = ["action", "aspect", "target"].map(type => ({
        type, label: loc(`EDGELINER.WordType.${type}`),
        options: known.filter(k => WORDS[k.id].type === type).map(k => ({
          value: k.id, label: `${WORDS[k.id].name} (${WORDS[k.id].incantation}) · ${k.rank}`, selected: this.sel[type] === k.id
        }))
      }));
    }

    const power = buildPower(actor, this.sel);
    if (!power) return { ...ctx, noPower: true };
    this.picks = R.completePicks(power, this.picks);
    const preview = castPreview(actor, power, this.picks);
    ctx.power = {
      name: power.name, incantation: power.incantation, text: power.text, rating: power.rating,
      cap: power.cap ? loc(`EDGELINER.Tier.${power.cap}`) : null,
      // Radios are named by group position ("pick:3"), not id: Words of Power ids contain dots ("aspect.duration"),
      // which Foundry's form handling reads as nested keys.
      groups: power.groups.map((g, gi) => ({
        id: g.id, index: gi, label: g.label,
        options: g.options.map((o, i) => ({
          index: i, label: o.label, cp: o.cp, checked: i === this.picks[g.id],
          disabled: !R.optionAllowed(o, power.cap),
          tier: o.tier ? loc(`EDGELINER.Tier.${o.tier}`) : null
        }))
      }))
    };
    const signed = n => (n >= 0 ? `+${n}` : `${n}`);
    ctx.preview = {
      ...preview,
      roll: `d${preview.die}${signed(preview.bonus)} ${signed(preview.rank)}${preview.strain ? ` −${preview.strain}` : ""}`,
      problem: preview.problem ? fmt(preview.problem, { name: actor.name, power: power.name }) : null,
      drainDieLabel: preview.drainDie ? `d${preview.drainDie}` : "0"
    };
    return ctx;
  }

  /**
   * Read the form's current values into the selection and picks. Done before every save and cast too, so a
   * change that hasn't been submitted yet (a name still being typed) isn't lost.
   */
  #readForm(form = this.element) {
    if (!(form instanceof HTMLFormElement)) return;
    const value = name => {
      const el = form.elements.namedItem(name);
      if (!el) return undefined;
      return el instanceof RadioNodeList || el.type === "radio" ? (form.querySelector(`[name="${CSS.escape(name)}"]:checked`)?.value) : el.value;
    };
    const category = this.actor.system.powerTradition;
    const sel = { category };
    if (category === "psychic" && value("power")) [sel.discipline, sel.power] = value("power").split(".");
    if (category === "totem") sel.aspect = value("aspect");
    if (category === "words") Object.assign(sel, { action: value("action"), aspect: value("aspect"), target: value("target") });
    const samePower = JSON.stringify(sel) === JSON.stringify(this.sel);
    this.sel = sel;
    this.buildName = value("buildName") ?? this.buildName;
    // Picks belong to the power on screen: when the power changed, the old picks don't apply.
    if (samePower) {
      const power = buildPower(this.actor, sel);
      const picks = {};
      power?.groups.forEach((g, gi) => {
        const v = value(`pick:${gi}`);
        if (v !== undefined) picks[g.id] = Number(v);
      });
      this.picks = { ...this.picks, ...picks };
    } else this.picks = {};
  }

  static #onChange(event, form) {
    this.#readForm(form);
    this.render();
  }

  static async #onCast() {
    this.#readForm();
    await castPower(this.actor, this.sel, this.picks, { name: this.buildName || null });
    this.render();
  }

  /** Save: updates the build being edited, or adds a new one. */
  static #onSave() {
    return this.#save(false);
  }

  /** Save as new: always adds a build, leaving the one being edited alone. */
  static #onSaveNew() {
    return this.#save(true);
  }

  async #save(asNew) {
    this.#readForm();
    const power = buildPower(this.actor, this.sel);
    if (!power) return;
    const name = this.buildName.trim() || power.name;
    const entry = { name, sel: { ...this.sel }, picks: R.completePicks(power, this.picks) };
    const builds = savedBuilds(this.actor);
    const index = asNew ? -1 : builds.findIndex(b => b.id === this.buildId);
    let next;
    if (index >= 0) {
      next = builds.map((b, i) => (i === index ? { ...b, ...entry } : b));
    } else {
      this.buildId = foundry.utils.randomID();
      next = [...builds, { id: this.buildId, ...entry }];
    }
    await this.actor.setFlag(MODULE, "builds", next);
    ui.notifications.info(fmt(index >= 0 ? "EDGELINER.Caster.UpdatedNote" : "EDGELINER.Caster.SavedNote", { name }));
    this.render();
  }
}
