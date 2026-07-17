/**
 * Portrait Sprites & Expressions
 * Main initialization script
 */

import { createPortraitSpritesApi, MODULE_ID } from "./api.js";
import { log } from "./constants.js";
import { PortraitSpritesLayer } from "./layer.js";
import { PortraitSpriteCreator } from "./creator.js";

Hooks.once("init", () => {
  log("Initializing");
  
  // Register settings if needed in the future
  game.settings.register(MODULE_ID, "version", {
    name: "Module Version",
    scope: "world",
    config: false,
    default: "1.0.0",
    type: String
  });
});

Hooks.once("setup", () => {
  log("Setup");
  
  // Keep the layer in the primary canvas group so its coordinates use the
  // same panning and zoom transform as canvas.stage.
  CONFIG.Canvas.layers.portraitSprites = {
    layerClass: PortraitSpritesLayer,
    group: "primary"
  };
});

Hooks.on("canvasReady", (canvas) => {
  log("Canvas Ready");
  
  // The layer will automatically draw when canvas is ready
  if (canvas.portraitSprites) {
    log("Layer initialized with", canvas.portraitSprites.sprites.size, "sprites");
  }
});

Hooks.on("getSceneControlButtons", (controls) => {
  // Foundry VTT v13 provides scene controls as a keyed record instead of an array.
  controls.portraitSprites = {
    name: "portraitSprites",
    title: game.i18n.localize("PORTRAIT_SPRITES.Layer"),
    icon: "fas fa-user-circle",
    order: Object.keys(controls).length,
    activeTool: "select",
    tools: {
      select: {
        name: "select",
        title: game.i18n.localize("CONTROLS.CommonSelect"),
        icon: "fas fa-mouse-pointer",
        order: 0,
        onChange: (_event, active) => {
          if (!active) return;
          canvas.portraitSprites?.activate?.({ tool: "select" });
          canvas.portraitSprites?.setInteractionActive?.(true);
        }
      },
      portraitSpriteCreator: {
        name: "portraitSpriteCreator",
        title: game.i18n.localize("PORTRAIT_SPRITES.Creator.Tool"),
        icon: "fas fa-plus-circle",
        order: 1,
        button: true,
        onChange: (_event, active) => {
          if (active === false) return;

          const creator = new PortraitSpriteCreator();
          creator.render(true);
        }
      }
    },
    onChange: (_event, active) => {
      if (active === false) {
        canvas.portraitSprites?.setInteractionActive?.(false);
        return;
      }

      canvas.portraitSprites?.activate?.({ tool: "select" });
      canvas.portraitSprites?.setInteractionActive?.(true);
    }
  };
});

// API for managing portrait sprites
window.PortraitSprites = createPortraitSpritesApi();

log("Module loaded");
