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

Hooks.once("init", () => {
  log("Initializing");

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

  CONFIG.Canvas.layers.portraitSprites = {
    layerClass: PortraitSpritesLayer,
    group: "interface"
  };
});

Hooks.on("canvasReady", canvasInstance => {
  log("Canvas Ready");

  const layer = canvasInstance.portraitSprites;
  if (!layer) return;

  // InteractionLayer activation is owned by Foundry's scene controls. Keep the
  // portrait layer passive unless Foundry reports that it is the active layer.
  layer.setInteractionActive?.(Boolean(layer.active));
  log("Layer initialized with", layer.sprites.size, "sprites");
});

Hooks.on("getSceneControlButtons", controls => {
  // The layer property is important: Foundry uses it to activate this layer and
  // to restore Tokens, Tiles, Drawings, and other layers when controls change.
  controls.portraitSprites = {
    name: "portraitSprites",
    layer: "portraitSprites",
    title: game.i18n.localize("PORTRAIT_SPRITES.Layer"),
    icon: "fas fa-user-circle",
    order: Object.keys(controls).length,
    activeTool: "select",
    tools: {
      select: {
        name: "select",
        title: game.i18n.localize("CONTROLS.CommonSelect"),
        icon: "fas fa-mouse-pointer",
        order: 0
      },
      portraitSpriteCreator: {
        name: "portraitSpriteCreator",
        title: game.i18n.localize("PORTRAIT_SPRITES.Creator.Tool"),
        icon: "fas fa-plus-circle",
        order: 1,
        button: true,
        onChange: (_event, active) => {
          if (active === false) return;
          new PortraitSpriteCreator().render(true);
        }
      }
    }
  };
});

window.PortraitSprites = createPortraitSpritesApi();

log("Module loaded");