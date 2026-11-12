/**
 * The one place this module reaches into the core system's code. Relative paths (not "/systems/…") so a Foundry
 * route prefix still resolves; the URLs match the system's own imports, so these are the same module instances
 * (and the same PENTRA config object) the system uses.
 */
export { PENTRA } from "../../../systems/pentra-core-foundry-vtt/modules/config.js";
export * as CoreRules from "../../../systems/pentra-core-foundry-vtt/modules/rules.js";
export * as Rolls from "../../../systems/pentra-core-foundry-vtt/modules/rolls.js";
export * as Vehicles from "../../../systems/pentra-core-foundry-vtt/modules/vehicles.js";
export * as CoreModels from "../../../systems/pentra-core-foundry-vtt/modules/models.js";
export {
  PentraItem, PentraCombat, PentraCombatant, acquireGear
} from "../../../systems/pentra-core-foundry-vtt/modules/documents.js";
export { PentraCharacterSheet } from "../../../systems/pentra-core-foundry-vtt/modules/sheets/actor-sheet.js";
export { PentraItemSheet } from "../../../systems/pentra-core-foundry-vtt/modules/sheets/item-sheet.js";
export { actorUnderwater } from "../../../systems/pentra-core-foundry-vtt/modules/underwater.js";
