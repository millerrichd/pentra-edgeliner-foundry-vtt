/**
 * Item sheet for this module's item types. It reuses the core item sheet (header, cost, description) and swaps in
 * a details template from this module.
 */
import { PENTRA, PentraItemSheet } from "../core.js";
import { MODULE, TYPES, EDGELINER, POWER_SKILLS } from "../config.js";

const loc = key => game.i18n.localize(key);

export class EdgelinerItemSheet extends PentraItemSheet {
  static DEFAULT_OPTIONS = { classes: ["edgeliner"] };

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const short = this.item.type.split(".").pop();
    parts.details.template = `modules/${MODULE}/templates/item/details-${short}.hbs`;
    return parts;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context.options, {
      cyberEffects: Object.fromEntries(EDGELINER.cyberEffects.map(k => [k, `EDGELINER.Cyber.Effect.${k}`])),
      resistances: { "": "PENTRA.None", ...PENTRA.resistances },
      limbs: { arms: PENTRA.hitLocations.arms.label, legs: PENTRA.hitLocations.legs.label },
      chipSkills: {
        "": loc("PENTRA.None"),
        ...Object.fromEntries(Object.entries(PENTRA.skills).filter(([k]) => !POWER_SKILLS[k]).map(([k, s]) => [k, loc(s.label)]))
      },
      moduleSlots: Object.fromEntries(EDGELINER.moduleSlots.map(k => [k, `EDGELINER.Deck.Slot.${k}`])),
      deckRanges: Object.fromEntries(EDGELINER.deckRanges.map(k => [k, PENTRA.rangeBands[k]])),
      programs: Object.fromEntries(EDGELINER.programs.map(k => [k, `EDGELINER.Program.${k}.Name`])),
      memory: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(n => [n, String(n)]))
    });
    context.isGM = game.user.isGM;
    context.usesDeck = this.item.type === TYPES.cyberdeck;
    return context;
  }
}
