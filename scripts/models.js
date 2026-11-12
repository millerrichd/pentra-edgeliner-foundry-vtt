/**
 * Data models: the core character and NPC models extended with Strain, cybernetic armor and the character's power
 * tradition, plus the four item types this module adds.
 */
import { PENTRA, CoreModels, CoreRules } from "./core.js";
import { EDGELINER, MODULE, TYPES } from "./config.js";
import { strainUsed, limbArmor, deckStats } from "./rules.js";

const { fields } = foundry.data;

const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const dieField = (initial, opts = {}) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, initial, choices: PENTRA.usageDice, ...opts });
const nullableDie = () =>
  new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, choices: PENTRA.usageDice });
const costField = (die = 6, multiplier = 1) => new fields.SchemaField({
  die: dieField(die), multiplier: int(multiplier, { min: 1, max: 6 })
});
const str = (initial = "", opts = {}) => new fields.StringField({ required: true, blank: true, initial, ...opts });

/* -------------------------------------------------------------------------- */
/*  Actors                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything Edgeliner derives on a character or NPC. Runs after the core derivations, so it can add to armor.
 * @param {object} system  The actor's system data (this)
 * @param {number} strainMax
 */
function prepareEdgeliner(system, strainMax) {
  const actor = system.parent;
  const items = actor?.items ?? [];
  const cyber = items.filter(i => i.type === TYPES.cyberware);

  // Strain: every implant point counts against the maximum, and is -1 on power checks.
  const used = strainUsed(cyber.map(c => c.system));
  system.strain = { used, max: strainMax, left: strainMax - used, over: used > strainMax };

  // Cybernetic armor. Replaced limbs keep their armor even while disabled (they're still metal and composite);
  // subdermal plates are the same, but give nothing once their usage die is spent.
  const limbs = { arms: 0, legs: 0 };
  let subdermal = 0;
  for (const c of cyber) {
    if (c.system.effect === "limb" && c.system.location in limbs) limbs[c.system.location]++;
    if (c.system.effect === "subdermal" && (c.system.usage ?? 0) > 0) subdermal = EDGELINER.subdermalAR;
  }
  if (system.armor) {
    for (const loc of Object.keys(system.armor)) system.armor[loc] += subdermal;
    system.armor.arms += limbArmor(limbs.arms);
    system.armor.legs += limbArmor(limbs.legs);
  }
  system.cyberArmor = { subdermal, arms: limbArmor(limbs.arms), legs: limbArmor(limbs.legs) };

  // Power tradition: from the one Power talent.
  const powerTalent = items.find(i => i.type === "talent" && i.getFlag(MODULE, "power"));
  system.powerTradition = powerTalent?.getFlag(MODULE, "power") ?? null;
  system.totemAnimal = actor?.getFlag(MODULE, "totem") ?? null;

  // Ancestry features (Awakened AI).
  const ancestry = items.find(i => i.type === "ancestry");
  system.noPowers = !!ancestry?.getFlag(MODULE, "noPowers");
  system.noBreath = !!ancestry?.getFlag(MODULE, "noBreath");
  /** A machine body: flesh-healing powers don't work on it. */
  system.machine = !!ancestry?.getFlag(MODULE, "machine");
}

export class EdgelinerCharacterModel extends CoreModels.PentraCharacterModel {
  prepareDerivedData() {
    super.prepareDerivedData();
    prepareEdgeliner(this, EDGELINER.baseStrain + (this.traitMods?.strain ?? 0));
  }
}

export class EdgelinerNPCModel extends CoreModels.PentraNPCModel {
  prepareDerivedData() {
    super.prepareDerivedData();
    prepareEdgeliner(this, EDGELINER.baseStrain);
  }
}

/* -------------------------------------------------------------------------- */
/*  Items                                                                     */
/* -------------------------------------------------------------------------- */

class EdgelinerItemBase extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { description: new fields.HTMLField(), cost: costField(), legal: new fields.BooleanField({ initial: true }) };
  }

  get costLabel() {
    return CoreRules.formatCost(this.cost.die, this.cost.multiplier);
  }
}

/** A cybernetic implant. Owned means installed. */
export class CyberwareModel extends EdgelinerItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      strain: int(1, { min: 0 }),
      effect: str("none", { blank: false, choices: EDGELINER.cyberEffects }),
      /** skillAdvantage: the attribute whose skills get advantage. */
      attribute: str("", { choices: ["", ...Object.keys(PENTRA.attributes)] }),
      /** resistAdvantage: the resistance that gets advantage. */
      resistance: str("", { choices: ["", ...Object.keys(PENTRA.resistances)] }),
      /** limb: which pair of limbs it replaces. */
      location: str("arms", { choices: ["arms", "legs"] }),
      /** skillChip: the (non-Power) skill on the chip, and whether it's slotted. */
      skill: str(""),
      slotted: new fields.BooleanField({ initial: false }),
      /** subdermal: its own usage die (starts at the wearer's Durability Die). */
      usage: nullableDie(),
      /** Rounds left disabled by a Short Burst hack (0 = working). */
      disabled: int(0, { min: 0 })
    };
  }

  /** Does this implant work right now? */
  get active() {
    return this.disabled <= 0;
  }

  get summary() {
    const i18n = game.i18n;
    const loc = key => i18n.localize(key);
    switch (this.effect) {
      case "skillAdvantage": return this.attribute ? i18n.format("EDGELINER.Cyber.Summary.skillAdvantage", { attribute: loc(PENTRA.attributes[this.attribute]) }) : "";
      case "resistAdvantage": return this.resistance ? i18n.format("EDGELINER.Cyber.Summary.resistAdvantage", { resistance: loc(PENTRA.resistances[this.resistance]) }) : "";
      case "limb": return i18n.format("EDGELINER.Cyber.Summary.limb", { location: loc(PENTRA.hitLocations[this.location].label) });
      case "skillChip": return this.skill && PENTRA.skills[this.skill] ? i18n.format("EDGELINER.Cyber.Summary.skillChip", { skill: loc(PENTRA.skills[this.skill].label) }) : "";
      default: return loc(`EDGELINER.Cyber.Summary.${this.effect}`);
    }
  }
}

/** A CyberDeck motherboard. Modules and programs are separate items that point at it. */
export class CyberdeckModel extends EdgelinerItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      size: str("normal", { blank: false, choices: Object.keys(PENTRA.sizes) }),
      evasion: int(8),
      armor: int(1, { min: 0 }),
      wounds: int(1, { min: 0 }),
      increment: str("odd", { blank: false, choices: Object.keys(PENTRA.increments) }),
      memory: int(2, { min: 0, max: EDGELINER.maxMemory }),
      modules: int(2, { min: 0 }),
      range: str("veryClose", { blank: false, choices: EDGELINER.deckRanges }),
      health: new fields.SchemaField({ value: int(10, { min: 0 }), max: int(10, { min: 0 }) }),
      /** The deck's armor usage die; null until owned, then the owner's Durability Die. */
      durability: nullableDie(),
      /** The deck the character is using (one at a time). */
      equipped: new fields.BooleanField({ initial: false })
    };
  }

  /** Modules and programs on the same actor that are installed in this deck. */
  get installed() {
    const item = this.parent;
    const actor = item?.parent;
    const mine = i => i.system.installedIn === item.id;
    return {
      modules: actor ? actor.items.filter(i => i.type === TYPES.deckmodule && mine(i)) : [],
      programs: actor ? actor.items.filter(i => i.type === TYPES.deckprogram && mine(i)) : []
    };
  }

  /** Working stats with modules and programs applied. */
  get stats() {
    const { modules, programs } = this.installed;
    return deckStats(this, modules.map(m => m.system.moduleData), programs.map(p => ({ program: p.system.program })));
  }

  get crashed() {
    return this.health.value <= 0;
  }
}

export class DeckModuleModel extends EdgelinerItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      slot: str("armor", { blank: false, choices: EDGELINER.moduleSlots }),
      /** +Armor, +Wounds or +Memory; range modules use `range` instead. */
      value: int(1, { min: 0 }),
      range: str("close", { blank: false, choices: EDGELINER.deckRanges }),
      installedIn: str("")
    };
  }

  get moduleData() {
    return { slot: this.slot, value: this.slot === "range" ? this.range : this.value };
  }

  get summary() {
    const i18n = game.i18n;
    if (this.slot === "range") return i18n.format("EDGELINER.Deck.Summary.range", { range: i18n.localize(PENTRA.rangeBands[this.range]) });
    return i18n.format(`EDGELINER.Deck.Summary.${this.slot}`, { value: this.value });
  }
}

export class DeckProgramModel extends EdgelinerItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      program: str("burst", { blank: false, choices: EDGELINER.programs }),
      installedIn: str("")
    };
  }

  get summary() {
    return game.i18n.localize(`EDGELINER.Program.${this.program}.Summary`);
  }
}
