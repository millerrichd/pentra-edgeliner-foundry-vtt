/**
 * The core character sheet with two more tabs: Cyber (Strain, implants, CyberDecks with their modules and
 * programs, hacking, and drones, the way the Gear tab holds vehicles) and Powers (tradition, Drain, building and
 * casting).
 */
import { PENTRA, PentraCharacterSheet, Vehicles } from "../core.js";
import { MODULE, TYPES, EDGELINER, POWER_SKILLS } from "../config.js";
import { PSYCHIC_POWERS, TOTEM_POWERS, TOTEM_ANIMALS, WORDS } from "../powers-data.js";
import * as R from "../rules.js";
import { PowerCaster, savedBuilds } from "../apps/caster.js";
import { castPower, buildPower } from "../powers.js";
import { center } from "../checks.js";
import { shortBurst, hackingReady, defragDeck, deckDamaged } from "../hacking.js";
import { DelveApp } from "../apps/delve.js";
import * as Drones from "../drones.js";
import * as DataCaches from "../data-caches.js";

const TEMPLATES = `modules/${MODULE}/templates/actor`;
const loc = key => game.i18n.localize(key);
const die = n => (n ? `d${n}` : "0");

export class EdgelinerCharacterSheet extends PentraCharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["edgeliner"],
    actions: {
      edgeCreate: EdgelinerCharacterSheet.#onEdgeCreate,
      openCaster: EdgelinerCharacterSheet.#onOpenCaster,
      castBuild: EdgelinerCharacterSheet.#onCastBuild,
      editBuild: EdgelinerCharacterSheet.#onEditBuild,
      deleteBuild: EdgelinerCharacterSheet.#onDeleteBuild,
      center: EdgelinerCharacterSheet.#onCenter,
      cyberRestore: EdgelinerCharacterSheet.#onCyberRestore,
      burst: EdgelinerCharacterSheet.#onBurst,
      openDelves: () => DelveApp.open(),
      uninstall: EdgelinerCharacterSheet.#onUninstall,
      droneOpen: EdgelinerCharacterSheet.#onDroneOpen,
      droneLink: EdgelinerCharacterSheet.#onDroneLink,
      droneSell: EdgelinerCharacterSheet.#onDroneSell,
      droneUnlink: EdgelinerCharacterSheet.#onDroneUnlink,
      droneDeep: EdgelinerCharacterSheet.#onDroneDeep,
      droneManeuver: EdgelinerCharacterSheet.#onDroneManeuver,
      droneFire: EdgelinerCharacterSheet.#onDroneFire,
      dataCacheRemove: EdgelinerCharacterSheet.#onDataCacheRemove,
      dataCacheSell: EdgelinerCharacterSheet.#onDataCacheSell,
      defrag: EdgelinerCharacterSheet.#onDefrag
    }
  };

  static PARTS = (() => {
    const core = PentraCharacterSheet.PARTS;
    return {
      header: core.header,
      tabs: core.tabs,
      skills: core.skills,
      combat: core.combat,
      gear: core.gear,
      cyber: { template: `${TEMPLATES}/tab-cyber.hbs`, scrollable: [""] },
      powers: { template: `${TEMPLATES}/tab-powers.hbs`, scrollable: [""] },
      traits: core.traits,
      downtime: core.downtime,
      biography: core.biography
    };
  })();

  static TABS = (() => {
    const core = PentraCharacterSheet.TABS.primary;
    const tabs = [...core.tabs];
    tabs.splice(tabs.findIndex(t => t.id === "gear") + 1, 0,
      { id: "cyber", icon: "fa-solid fa-microchip" },
      { id: "powers", icon: "fa-solid fa-hand-sparkles" });
    return { primary: { ...core, tabs } };
  })();

  /** Only the Power skills of the character's own tradition appear under Power. @override */
  _prepareSkills(attribute) {
    const skills = super._prepareSkills(attribute);
    if (attribute !== "power") return skills;
    const tradition = this.actor.system.powerTradition;
    return skills.filter(s => POWER_SKILLS[s.key]?.category === tradition);
  }

  /** Drones are listed on the Cyber tab, so the Gear tab's vehicle list leaves them out. @override */
  _prepareVehicles() {
    return super._prepareVehicles().filter(v => !Drones.isDrone(fromUuidSync(v.uuid)));
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // Edgeliner uses the Drain Die whatever the world setting says.
    context.showDrain = true;
    context.edgeliner = {
      powers: this.#preparePowers(),
      cyber: this.#prepareCyber()
    };
    return context;
  }

  /* ------------------------------------------------------------------------ */
  /*  Powers tab                                                              */
  /* ------------------------------------------------------------------------ */

  #preparePowers() {
    const actor = this.actor;
    const sys = actor.system;
    const tradition = sys.powerTradition;
    const rank = key => sys.skills[key] ?? 0;
    const out = {
      tradition, traditionLabel: tradition ? loc(EDGELINER.powerCategories[tradition].label) : null,
      noPowers: sys.noPowers,
      attribute: sys.attributes.power?.formatted,
      pab: sys.attributes.power?.bonus ?? 0,
      drain: { value: die(sys.drainDie.value), max: die(sys.drainDie.max), full: sys.drainDie.value >= sys.drainDie.max, empty: !sys.drainDie.value },
      strain: sys.strain?.used ?? 0
    };
    if (tradition === "psychic") {
      out.disciplines = Object.entries(PSYCHIC_POWERS).filter(([id]) => rank(`psy_${id}`) > 0).map(([id, powers]) => {
        const r = rank(`psy_${id}`);
        const unlocked = R.psychicRatings(r);
        return {
          id, rank: r, label: loc(PENTRA.skills[`psy_${id}`].label),
          powers: powers.map(p => ({ id: p.id, name: p.name, rating: p.rating, locked: !unlocked.includes(p.rating), text: p.text }))
        };
      });
    }
    if (tradition === "totem") {
      const animal = sys.totemAnimal;
      out.animal = animal;
      out.animals = Object.fromEntries(Object.entries(TOTEM_ANIMALS).map(([k, a]) => [k, a.name]));
      out.animalText = TOTEM_ANIMALS[animal]?.text ?? null;
      out.aspects = Object.entries(TOTEM_POWERS).map(([id, p]) => ({
        id, name: p.name, rank: rank(`totem_${id}`), known: rank(`totem_${id}`) > 0,
        cap: loc(`EDGELINER.Tier.${R.totemCap(animal, id)}`), text: p.text
      }));
    }
    if (tradition === "words") {
      out.words = ["action", "aspect", "target"].map(type => ({
        type, label: loc(`EDGELINER.WordType.${type}`),
        list: Object.entries(WORDS).filter(([, w]) => w.type === type).map(([id, w]) => ({
          id, name: w.name, incantation: w.incantation, rank: rank(`word_${id}`), known: rank(`word_${id}`) > 0
        }))
      }));
      out.canCompose = out.words.every(g => g.list.some(w => w.known));
    }
    out.builds = savedBuilds(actor).map(b => {
      const power = buildPower(actor, b.sel);
      if (!power) return { ...b, broken: true };
      const picks = R.completePicks(power, b.picks);
      const cp = R.constructionPoints(power, picks);
      return { ...b, power: power.name, cp, tn: R.powerTN(cp), drain: R.drainTop(cp) };
    });
    return out;
  }

  /* ------------------------------------------------------------------------ */
  /*  Cyber tab                                                               */
  /* ------------------------------------------------------------------------ */

  #prepareCyber() {
    const actor = this.actor;
    const sys = actor.system;
    const items = [...actor.items].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const ofType = t => items.filter(i => i.type === t);
    const chipSkills = Object.fromEntries([["", loc("PENTRA.None")],
      ...Object.entries(PENTRA.skills).filter(([k]) => !POWER_SKILLS[k]).map(([k, s]) => [k, loc(s.label)])
        .sort((a, b) => a[1].localeCompare(b[1]))]);
    const usage = Object.fromEntries(PENTRA.usageDice.map(d => [d, d ? `d${d}` : loc("PENTRA.Broken")]));
    const hasChipSystem = ofType(TYPES.cyberware).some(c => c.system.effect === "chipSystem");

    const implants = ofType(TYPES.cyberware).map(i => ({
      id: i.id, name: i.name, img: i.img, system: i.system, summary: i.system.summary, cost: i.system.costLabel,
      isChip: i.system.effect === "skillChip", isSubdermal: i.system.effect === "subdermal",
      disabled: i.system.disabled
    }));

    const decks = ofType(TYPES.cyberdeck).map(d => {
      const stats = d.system.stats;
      const { modules, programs } = d.system.installed;
      return {
        id: d.id, name: d.name, img: d.img, system: d.system, cost: d.system.costLabel,
        crashed: d.system.crashed, damaged: deckDamaged(d),
        stats: {
          ...stats,
          damage: `${stats.wounds} (${loc(PENTRA.increments[stats.increment])})`,
          range: loc(PENTRA.rangeBands[stats.range]),
          durability: d.system.durability ? `d${d.system.durability}` : loc("PENTRA.Broken")
        },
        modules: modules.map(m => ({ id: m.id, name: m.name, summary: m.system.summary })),
        programs: programs.map(p => ({ id: p.id, name: p.name, summary: p.system.summary }))
      };
    });
    const deckChoices = { "": loc("EDGELINER.Deck.NotInstalled"), ...Object.fromEntries(decks.map(d => [d.id, d.name])) };
    const loose = [...ofType(TYPES.deckmodule), ...ofType(TYPES.deckprogram)]
      .filter(i => !i.system.installedIn || !actor.items.has(i.system.installedIn))
      .map(i => ({ id: i.id, name: i.name, img: i.img, summary: i.system.summary, cost: i.system.costLabel, installedIn: i.system.installedIn }));

    const ready = hackingReady(actor);
    return {
      strain: sys.strain, implants, decks, loose, deckChoices, chipSkills, usage, hasChipSystem,
      canHack: !ready.problem, hackProblem: ready.problem,
      drones: Drones.droneRows(actor), droneReady: Drones.droneReady(actor),
      dataCaches: DataCaches.actorCaches(actor).map(dc => ({
        ...dc,
        valueLabel: dc.value ? game.i18n.localize(`EDGELINER.DataCache.Value.${dc.value}`) : "",
        worth: DataCaches.worthLabel(dc),
        from: dc.delve ? (dc.round ? game.i18n.format("EDGELINER.DataCache.From", { delve: dc.delve, round: dc.round }) : dc.delve) : ""
      })),
      cacheValues: DataCaches.valueOptions(), worthDice: DataCaches.worthDieOptions(), worthMults: DataCaches.worthMultOptions(),
      armor: sys.cyberArmor,
      isGM: game.user.isGM
    };
  }

  /* ------------------------------------------------------------------------ */
  /*  Rendering and drops                                                     */
  /* ------------------------------------------------------------------------ */

  /** The totem animal select is stored on the actor, not in the system data. @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const totem = this.element.querySelector("select.totem-select");
    totem?.addEventListener("change", event => {
      event.stopPropagation();
      this.actor.setFlag(MODULE, "totem", totem.value);
    });
    // GM: what's in a recovered data cache, and its value tier.
    for (const input of this.element.querySelectorAll(".data-caches [data-cache-field]")) {
      input.addEventListener("change", event => {
        event.stopPropagation();
        const id = input.closest("[data-cache-id]")?.dataset.cacheId;
        DataCaches.updateActorCache(this.actor, id, input.dataset.cacheField, input.value);
      });
    }
    this.#addPowerDowntime();
    this.#addCampDefrag();
  }

  /**
   * Power downtime (p. 10): Centering is a short downtime activity, and a night of rest (Camp, or a Day of rest in
   * the city) recovers all lost Drain. Added to the core Downtime tab for anyone who can use powers.
   */
  #addPowerDowntime() {
    const sys = this.actor.system;
    if (!sys.drainDie || sys.noPowers) return;
    const root = this.element;
    root.querySelectorAll(".edgeliner-center, .edgeliner-drain-note").forEach(el => el.remove());
    const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
    const { value, max } = sys.drainDie;
    const dieLabel = `${value ? `d${value}` : "0"} / d${max}`;
    // The Combat tab has its own Treat Wounds button, so look only inside the Downtime tab.
    const shortPanel = root.querySelector('.downtime-tab .downtime-panel [data-action="treatWounds"]')?.closest(".downtime-panel");
    if (shortPanel && this.isEditable) {
      const row = document.createElement("div");
      row.className = "activity edgeliner-center";
      row.innerHTML = `<button type="button" data-action="center" ${value >= max ? "disabled" : ""}><i class="fa-solid fa-spa"></i> ${esc(game.i18n.localize("EDGELINER.Drain.Center"))}</button>
        <span class="hint">${esc(game.i18n.localize("EDGELINER.Drain.CenterHint"))} (${esc(game.i18n.localize("PENTRA.Trait.drainDie"))} ${dieLabel})</span>`;
      shortPanel.append(row);
    }
    for (const kind of ["camp", "city"]) {
      const hint = root.querySelector(`.downtime-tab [data-action="rest"][data-kind="${kind}"]`)?.closest(".activity")?.querySelector(".hint");
      if (!hint) continue;
      const note = document.createElement("span");
      note.className = "edgeliner-drain-note";
      note.textContent = ` ${game.i18n.localize("EDGELINER.Drain.RestNote")} (${game.i18n.localize("PENTRA.Trait.drainDie")} ${dieLabel})`;
      hint.append(note);
    }
  }

  /**
   * Defragmentation of CyberDeck is a camp downtime activity (p. 10): add a row per damaged deck to the core
   * Downtime tab's camp panel, beside Rest.
   */
  #addCampDefrag() {
    const panel = this.element.querySelector('.downtime-tab [data-action="rest"][data-kind="camp"]')?.closest(".downtime-panel");
    if (!panel || !this.isEditable) return;
    panel.querySelectorAll(".edgeliner-defrag").forEach(el => el.remove());
    const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
    for (const deck of this.actor.items.filter(i => i.type === TYPES.cyberdeck && deckDamaged(i))) {
      const row = document.createElement("div");
      row.className = "activity edgeliner-defrag";
      row.dataset.itemId = deck.id;
      const { value, max } = deck.system.health;
      row.innerHTML = `<button type="button" data-action="defrag"><i class="fa-solid fa-screwdriver-wrench"></i> ${esc(game.i18n.format("EDGELINER.Deck.DefragCamp", { name: deck.name }))}</button>
        <span class="hint">${esc(game.i18n.localize("EDGELINER.Deck.DefragCampHint"))} (${value}/${max}${deck.system.crashed ? `, ${esc(game.i18n.localize("EDGELINER.Deck.CrashedShort"))}` : ""})</span>`;
      panel.append(row);
    }
  }

  /**
   * Dropping a drone buys it like any vehicle (the core creates a world actor this character owns). Dropping one
   * this character already owns takes control of it. @override
   */
  async _onDropActor(event, actor) {
    if (Drones.isDrone(actor) && !actor.pack && actor.system.owner === this.actor.uuid && this.isEditable) {
      return Drones.linkDrone(this.actor, actor);
    }
    return super._onDropActor(event, actor);
  }

  /* ------------------------------------------------------------------------ */
  /*  Actions                                                                 */
  /* ------------------------------------------------------------------------ */

  /** GM: a blank Edgeliner item is still being written up, so it's a gift (no purchase prompt). */
  static async #onEdgeCreate(event, target) {
    if (!game.user.isGM) return;
    const type = TYPES[target.dataset.type];
    if (!type) return;
    const name = game.i18n.format("DOCUMENT.New", { type: loc(CONFIG.Item.typeLabels[type]) });
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }], { pentraBypass: true });
    item?.sheet.render(true);
  }

  static async #onOpenCaster(event, target) {
    const { discipline, power, aspect } = target.dataset;
    const category = this.actor.system.powerTradition;
    let sel = null;
    if (discipline && power) sel = { category, discipline, power };
    else if (aspect) sel = { category, aspect };
    // A new-power builder is already open: close it so this one starts on the power clicked.
    await foundry.applications.instances.get(`edgeliner-caster-${this.actor.id}-new`)?.close();
    return new PowerCaster(this.actor, sel).render({ force: true });
  }

  #build(target) {
    const id = target.closest("[data-build-id]")?.dataset.buildId;
    return savedBuilds(this.actor).find(b => b.id === id);
  }

  static #onCastBuild(event, target) {
    const b = this.#build(target);
    if (b) return castPower(this.actor, b.sel, b.picks, { name: b.name });
  }

  static #onEditBuild(event, target) {
    const b = this.#build(target);
    if (!b) return;
    // One editor per build: bring an open one forward instead of opening a second.
    const open = foundry.applications.instances.get(`edgeliner-caster-${this.actor.id}-${b.id}`);
    if (open) return open.bringToFront();
    return new PowerCaster(this.actor, b.sel, b.picks, { build: b }).render({ force: true });
  }

  static #onDeleteBuild(event, target) {
    const b = this.#build(target);
    if (b) return this.actor.setFlag(MODULE, "builds", savedBuilds(this.actor).filter(x => x.id !== b.id));
  }

  /** Camp downtime: defragment a CyberDeck (from its row on the Cyber tab or the Downtime tab's camp panel). */
  static #onDefrag(event, target) {
    const deck = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (deck) return defragDeck(deck);
  }

  static #onCenter() {
    return center(this.actor);
  }

  static #onCyberRestore(event, target) {
    if (!game.user.isGM) return;
    return this._getItem(target)?.update({ "system.disabled": 0 });
  }

  static #onBurst() {
    return shortBurst(this.actor);
  }

  static #onUninstall(event, target) {
    return this._getItem(target)?.update({ "system.installedIn": "" });
  }

  #drone(target) {
    return fromUuidSync(target.closest("[data-drone-uuid]")?.dataset.droneUuid);
  }

  static #onDataCacheSell(event, target) {
    const id = target.closest("[data-cache-id]")?.dataset.cacheId;
    if (id) return DataCaches.sellActorCache(this.actor, id);
  }

  static #onDataCacheRemove(event, target) {
    const id = target.closest("[data-cache-id]")?.dataset.cacheId;
    if (id) return DataCaches.removeActorCache(this.actor, id);
  }

  static #onDroneOpen(event, target) {
    this.#drone(target)?.sheet.render(true);
  }

  static #onDroneLink(event, target) {
    const drone = this.#drone(target);
    if (drone) return Drones.linkDrone(this.actor, drone);
  }

  static #onDroneSell(event, target) {
    const drone = this.#drone(target);
    if (drone) return Vehicles.sellVehicle(drone);
  }

  static #onDroneUnlink(event, target) {
    return Drones.unlinkDrone(this.#drone(target));
  }

  static #onDroneDeep(event, target) {
    const drone = this.#drone(target);
    if (drone) return Drones.toggleDeepDive(this.actor, drone);
  }

  static #onDroneManeuver(event, target) {
    const drone = this.#drone(target);
    if (drone) return Drones.maneuver(this.actor, drone);
  }

  static #onDroneFire(event, target) {
    const drone = this.#drone(target);
    const weapon = drone?.items.get(target.dataset.weaponId);
    if (weapon) return Drones.fire(this.actor, drone, weapon);
  }
}
