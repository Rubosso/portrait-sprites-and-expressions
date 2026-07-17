/**
 * Portrait Sprites & Expressions
 * Main initialization script
 */

import { createPortraitSpritesApi, MODULE_ID } from "./api.js";
import { log } from "./constants.js";
import { PortraitSprite, PortraitSpriteHUD, PortraitSpritesLayer } from "./layer.js";
import { PortraitSpriteCreator } from "./creator.js";
import { installNoExpressionSupport } from "./no-expression.js";
import { installTransformSupport } from "./transform.js";
import {
  installSpriteMenus,
  PortraitExpressionPicker,
  PortraitSpriteEditor
} from "./sprite-menus.js";
import { installContextMenuFix } from "./context-menu-fix.js";
import { installScrollableApplicationLayouts } from "./scroll-layout.js";
import {
  installExpressionPickerAlignment,
  installPortraitLayerIsolation
} from "./runtime-fixes.js";

installNoExpressionSupport(PortraitSprite, PortraitSpriteHUD);
installTransformSupport(PortraitSpritesLayer, PortraitSprite, PortraitSpriteHUD);
installSpriteMenus(PortraitSprite);
installContextMenuFix(
  PortraitSpritesLayer,
  PortraitSprite,
  PortraitSpriteEditor,
  PortraitExpressionPicker
);
installScrollableApplicationLayouts(PortraitSpriteCreator, PortraitExpressionPicker);
installExpressionPickerAlignment(PortraitExpressionPicker);
installPortraitLayerIsolation(PortraitSpritesLayer);

function activatePortraitLayer() {
  const layer = canvas.portraitSprites;
  if (!layer) return;

  layer.activate?.({ tool: "select" });
  layer.setInteractionActive?.(true);
}

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
  
  // Interactive canvas layers belong in the interface group in Foundry v13.
  CONFIG.Canvas.layers.portraitSprites = {
    layerClass: PortraitSpritesLayer,
    group: "interface"
  };
});

Hooks.on("canvasReady", (canvas) => {
  log("Canvas Ready");
  
  const layer = canvas.portraitSprites;
  if (layer) {
    // Keep the portrait layer passive unless it is the canvas' active layer.
    layer.setInteractionActive?.(canvas.activeLayer === layer);
    log("Layer initialized with", layer.sprites.size, "sprites");
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
          if (active) activatePortraitLayer();
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

      activatePortraitLayer();
    }
  };
});

// API for managing portrait sprites
window.PortraitSprites = createPortraitSpritesApi();

log("Module loaded");