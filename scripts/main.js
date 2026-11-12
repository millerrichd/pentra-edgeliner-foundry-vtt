/**
 * Pentra: Edgeliner — setting module for the Pentra: Five-Dice Engine core system.
 *
 * Load order: the core system's scripts run first, then this module. The core builds its data schemas lazily from
 * its shared PENTRA config, so adding the Power attribute, the new skills and the Strain trait here (before any
 * document is prepared) gives every character and NPC real fields for them.
 */
import { PENTRA } from "./core.js";
import { MODULE, SYSTEM, TYPES, NEW_SKILLS, EDGELINER } from "./config.js";
import * as rules from "./rules.js";
import * as models from "./models.js";
import { EdgelinerItem, EdgelinerCombat, EdgelinerCombatant } from "./documents.js";
import { registerCheckHooks, center } from "./checks.js";
import * as Powers from "./powers.js";
import * as Hacking from "./hacking.js";
import * as Drones from "./drones.js";
import { EdgelinerCharacterSheet } from "./sheets/character-sheet.js";
import { EdgelinerItemSheet } from "./sheets/item-sheet.js";
import { DelveApp, registerDelveSetting, registerDelveSocket } from "./apps/delve.js";
import { PowerCaster } from "./apps/caster.js";

/* -------------------------------------------------------------------------- */
/*  Rules additions to the core config                                        */
/* -------------------------------------------------------------------------- */

/** The Power attribute governs the three power traditions (p. 3). */
PENTRA.attributes.power = "EDGELINER.Attribute.power";
/** Occult (Knowledge) and one skill per psychic discipline, totem aspect and word of power (p. 4). */
Object.assign(PENTRA.skills, NEW_SKILLS);
/** Strain: how much cyberware the body can take (p. 6). Talents and hindrances move it like any trait. */
PENTRA.traits.strain = { label: "EDGELINER.Trait.strain", type: "number", base: EDGELINER.baseStrain };

/* -------------------------------------------------------------------------- */
/*  Init                                                                      */
/* -------------------------------------------------------------------------- */

Hooks.once("init", () => {
  console.log("Pentra | Edgeliner | Initializing");
  if (game.system.id !== SYSTEM) return;

  CONFIG.EDGELINER = EDGELINER;
  game.edgeliner = {
    config: EDGELINER, rules, powers: Powers, hacking: Hacking, drones: Drones,
    delves: () => DelveApp.open(),
    caster: actor => new PowerCaster(actor).render({ force: true }),
    center
  };

  // Documents and data models (the core registered its own during its init, which ran first).
  CONFIG.Item.documentClass = EdgelinerItem;
  CONFIG.Combat.documentClass = EdgelinerCombat;
  CONFIG.Combatant.documentClass = EdgelinerCombatant;
  Object.assign(CONFIG.Actor.dataModels, {
    character: models.EdgelinerCharacterModel,
    npc: models.EdgelinerNPCModel
  });
  Object.assign(CONFIG.Item.dataModels, {
    [TYPES.cyberware]: models.CyberwareModel,
    [TYPES.cyberdeck]: models.CyberdeckModel,
    [TYPES.deckmodule]: models.DeckModuleModel,
    [TYPES.deckprogram]: models.DeckProgramModel
  });
  CONFIG.Actor.trackableAttributes.character.value.push("drainDie.value");

  // Sheets
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, MODULE, EdgelinerCharacterSheet, {
    types: ["character"], makeDefault: true, label: "EDGELINER.Sheet.Character"
  });
  DocumentSheetConfig.registerSheet(Item, MODULE, EdgelinerItemSheet, {
    types: Object.values(TYPES), makeDefault: true, label: "EDGELINER.Sheet.Item"
  });

  registerDelveSetting();
  registerCheckHooks();
});

Hooks.once("ready", async () => {
  if (game.system.id !== SYSTEM) return;
  registerDelveSocket();
  // Edgeliner uses the Drain Die, so diseases and talents should offer it.
  if (game.user.isActiveGM && !game.settings.get(SYSTEM, "showDrainDie")) await game.settings.set(SYSTEM, "showDrainDie", true);
});

/* -------------------------------------------------------------------------- */
/*  Chat cards                                                                */
/* -------------------------------------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  for (const button of html.querySelectorAll("[data-edgeliner-action]")) {
    button.addEventListener("click", event => {
      event.preventDefault();
      switch (button.dataset.edgelinerAction) {
        case "resist": return Powers.resistPower(message, button.dataset.resistance);
        case "apply-direct": return Powers.applyDirect(message);
        case "apply-heal": return Powers.applyHealing(message);
        case "burst-disable": return Hacking.disableFromBurst(message);
      }
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  Sidebar and sheet refreshes                                               */
/* -------------------------------------------------------------------------- */

/** A Delves button at the top of the Actors sidebar, beside the core's Clocks and Counters (GM and players). */
Hooks.on("renderActorDirectory", (app, html) => {
  if (html.querySelector(".edgeliner-delves-btn")) return;
  const actions = html.querySelector(".header-actions") ?? html.querySelector(".directory-header");
  if (!actions) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edgeliner-delves-btn";
  button.innerHTML = `<i class="fa-solid fa-network-wired" inert></i> <span>${game.i18n.localize("EDGELINER.Delve.Title")}</span>`;
  button.addEventListener("click", () => DelveApp.open());
  actions.append(button);
});

/** Character sheets list their drones, and the Delve tracker shows decks: redraw them when those change. */
function refreshEdgeliner(doc) {
  // Drones show on their operator's sheet: refresh when one is bought, sold, changed, or placed on the scene.
  const actor = doc instanceof Actor ? doc : doc instanceof TokenDocument ? doc.actor : doc.parent;
  if (Drones.isDrone(actor) || actor?.type === "vehicle") {
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof EdgelinerCharacterSheet && app.rendered) app.render();
    }
  }
  if (doc instanceof Item && doc.type === TYPES.cyberdeck) DelveApp.refresh();
}
for (const hook of ["createActor", "updateActor", "deleteActor", "updateItem", "createItem", "deleteItem", "createToken", "deleteToken"]) Hooks.on(hook, refreshEdgeliner);
