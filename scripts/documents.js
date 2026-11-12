/**
 * Document classes layered over the core ones: buying Edgeliner gear, Strain limits, the Power talent rules,
 * CyberDeck installs, Wired Reflexes initiative, and disabled implants counting down in combat.
 */
import { PentraItem, PentraCombat, PentraCombatant, acquireGear } from "./core.js";
import { MODULE, TYPES, PURCHASED } from "./config.js";
import { moduleProblem, programProblem } from "./rules.js";

const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

/** Warn and block for players; warn and allow for the GM (like core's creation limits). */
function softBlock(user, text) {
  if (user.isGM) {
    ui.notifications.warn(`${text} ${loc("PENTRA.Creation.GMAllowed")}`);
    return undefined;
  }
  ui.notifications.warn(text);
  return false;
}

export class EdgelinerItem extends PentraItem {
  /** Module item types get the system's icons too. @override */
  static getDefaultArtwork(itemData) {
    const icons = {
      [TYPES.cyberware]: "modules/pentra-edgeliner-foundry-vtt/assets/noun_cybernetic_orange@512.webp",
      [TYPES.cyberdeck]: "modules/pentra-edgeliner-foundry-vtt/assets/noun_cyberdeck_orange@512.webp",
      [TYPES.deckmodule]: "modules/pentra-edgeliner-foundry-vtt/assets/noun_cyberdeck_module_orange@512.webp",
      [TYPES.deckprogram]: "modules/pentra-edgeliner-foundry-vtt/assets/noun_cyberdeck_program_orange@512.webp"
    };
    return icons[itemData?.type] ? { img: icons[itemData.type] } : super.getDefaultArtwork(itemData);
  }

  /** @override */
  async _preCreate(data, options, user) {
    const actor = this.parent;
    // Hard rules first, so a talent that's refused never charges Karma (core asks for it in super._preCreate).
    if (actor instanceof Actor && !options.pentraBypass && this.#powerRuleProblem(actor)) return false;
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (!(actor instanceof Actor)) return;

    const die = actor.system.durabilityDie?.value ?? 8;
    if (this.type === TYPES.cyberware && this.system.effect === "subdermal" && this.system.usage === null) {
      this.updateSource({ "system.usage": die });
    }
    if (this.type === TYPES.cyberdeck && this.system.durability === null) this.updateSource({ "system.durability": die });
    // Arrives uninstalled / unslotted / not in use; the owner sets it up on the Cyber tab.
    if ([TYPES.deckmodule, TYPES.deckprogram].includes(this.type)) this.updateSource({ "system.installedIn": "" });
    if (this.type === TYPES.cyberdeck) this.updateSource({ "system.equipped": false });
    if (this.type === TYPES.cyberware) this.updateSource({ "system.slotted": false, "system.disabled": 0 });

    if (this.type === TYPES.cyberware && actor.system.strain) {
      const after = actor.system.strain.used + this.system.strain;
      if (after > actor.system.strain.max) {
        const text = fmt("EDGELINER.Strain.TooMuch", { name: this.name, actor: actor.name, used: after, max: actor.system.strain.max });
        if (softBlock(user, text) === false) return false;
      }
    }

    if (actor.type !== "character" || options.pentraBypass || !PURCHASED.includes(this.type)) return;
    return acquireGear(actor, { name: this.name, cost: this.system.cost }, user);
  }

  /**
   * The Power talents: only one per character, and none for an Awakened AI (whose machine body blocks powers).
   * An AI ancestry can't arrive on a character who already has one. Hard rules, the GM included.
   * @returns {boolean} true if blocked
   */
  #powerRuleProblem(actor) {
    const powerTalent = i => i.type === "talent" && i.getFlag(MODULE, "power");
    if (this.type === "talent" && this.getFlag(MODULE, "power")) {
      const other = actor.items.find(powerTalent);
      if (other) {
        ui.notifications.warn(fmt("EDGELINER.Power.OnlyOne", { name: this.name, other: other.name }));
        return true;
      }
      if (actor.system.noPowers) {
        ui.notifications.warn(fmt("EDGELINER.Power.NoPowers", { name: actor.name }));
        return true;
      }
    }
    if (this.type === "ancestry" && this.getFlag(MODULE, "noPowers")) {
      const talent = actor.items.find(powerTalent);
      if (talent) {
        ui.notifications.warn(fmt("EDGELINER.Power.AncestryBlocked", { name: this.name, talent: talent.name }));
        return true;
      }
    }
    return false;
  }

  /** Installing modules and programs, slotting chips, and using one deck at a time. @override */
  async _preUpdate(changed, options, user) {
    if ((await super._preUpdate(changed, options, user)) === false) return false;
    const actor = this.parent;
    if (!(actor instanceof Actor)) return;
    const next = changed.system ?? {};
    const problem = this.#installProblem(actor, next);
    if (!problem) return;
    ui.notifications.warn(problem);
    actor.sheet?.render();
    return false;
  }

  #installProblem(actor, next) {
    // Modules and programs: within the deck's capacity and memory.
    if ([TYPES.deckmodule, TYPES.deckprogram].includes(this.type) && next.installedIn && next.installedIn !== this.system.installedIn) {
      const deck = actor.items.get(next.installedIn);
      if (deck?.type !== TYPES.cyberdeck) return loc("EDGELINER.Deck.NoDeck");
      const { modules, programs } = deck.system.installed;
      const key = this.type === TYPES.deckmodule
        ? moduleProblem(deck.system, modules.filter(m => m.id !== this.id).map(m => m.system), this.system)
        : programProblem(deck.system.stats.memory, programs.filter(p => p.id !== this.id).map(p => p.system), this.system);
      return key ? fmt(key, { name: this.name, deck: deck.name }) : null;
    }
    // Skill chips: need a working Skill Chip System, two at a time.
    if (this.type === TYPES.cyberware && this.system.effect === "skillChip" && next.slotted && !this.system.slotted) {
      const cyber = actor.items.filter(i => i.type === TYPES.cyberware);
      if (!cyber.some(c => c.system.effect === "chipSystem")) return loc("EDGELINER.Chip.NeedSystem");
      const slotted = cyber.filter(c => c.system.effect === "skillChip" && c.system.slotted && c.id !== this.id).length;
      if (slotted >= 2) return loc("EDGELINER.Chip.Full");
      const skill = next.skill ?? this.system.skill;
      if (!skill) return loc("EDGELINER.Chip.NoSkill");
    }
    return null;
  }

  /** One deck in use at a time; a removed deck leaves its modules and programs behind, uninstalled. @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id || this.type !== TYPES.cyberdeck || !changed.system?.equipped) return;
    const others = this.parent?.items.filter(i => i.type === TYPES.cyberdeck && i.id !== this.id && i.system.equipped) ?? [];
    if (others.length) this.parent.updateEmbeddedDocuments("Item", others.map(i => ({ _id: i.id, "system.equipped": false })));
  }

  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (userId !== game.user.id || this.type !== TYPES.cyberdeck || !(this.parent instanceof Actor)) return;
    const loose = this.parent.items.filter(i => [TYPES.deckmodule, TYPES.deckprogram].includes(i.type) && i.system.installedIn === this.id);
    if (loose.length) this.parent.updateEmbeddedDocuments("Item", loose.map(i => ({ _id: i.id, "system.installedIn": "" })));
  }
}

/** A working implant of this kind on the actor (disabled implants don't count). */
export const activeCyber = (actor, effect) =>
  actor?.items?.find(i => i.type === TYPES.cyberware && i.system.effect === effect && i.system.active) ?? null;

export class EdgelinerCombatant extends PentraCombatant {
  /** Wired Reflexes: advantage (+d6) on initiative. @override */
  _getInitiativeFormula() {
    const base = super._getInitiativeFormula();
    return activeCyber(this.actor, "initiative") ? `${base} + 1d6` : base;
  }
}

export class EdgelinerCombat extends PentraCombat {
  /** Hacked implants come back online as their rounds run out (end of the owner's turn). @override */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    const actor = combatant.actor;
    if (!actor) return;
    const hacked = actor.items.filter(i => i.type === TYPES.cyberware && i.system.disabled > 0);
    if (!hacked.length) return;
    await actor.updateEmbeddedDocuments("Item", hacked.map(i => ({ _id: i.id, "system.disabled": i.system.disabled - 1 })));
    const back = hacked.filter(i => i.system.disabled <= 0);
    if (back.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="pentra chat-card"><p><i class="fa-solid fa-microchip"></i> ${fmt("EDGELINER.Burst.Restored", {
          name: foundry.utils.escapeHTML(actor.name), items: back.map(i => foundry.utils.escapeHTML(i.name)).join(", ")
        })}</p></div>`
      });
    }
  }
}
