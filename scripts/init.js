/**
 * Portrait Sprites & Expressions
 * Main initialization script
 */

import { createPortraitSpritesApi, MODULE_ID } from "./api.js";
import { log } from "./constants.js";
import { PortraitSprite, PortraitSpriteHUD, PortraitSpritesLayer } from "./layer.js";
import { PortraitSpriteCreator } from "./creator.js";
import { installNoExpressionSupport } from "./no-expression.js";
import { installV13LayerControls } from "./v13-layer-controls.js";
import { installTransformSupport } from "./transform.js";
import {
  installSpriteMenus,
  PortraitExpressionPicker,
  PortraitSpriteEditor
} from "./sprite-menus.js";
import { installContextMenuFix } from "./context-menu-fix.js";
import { installScrollableApplicationLayouts } from "./scroll-layout.js";
import { installExpressionPickerAlignment } from "./runtime-fixes.js";

installNoExpressionSupport(PortraitSprite, PortraitSpriteHUD);
installV13LayerControls(PortraitSpritesLayer, PortraitSprite, PortraitSpriteCreator);
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

  // SceneControls discovers the control set from
  // PortraitSpritesLayer.prepareSceneControls() after this layer is registered.
  CONFIG.Canvas.layers.portraitSprites = {
    layerClass: PortraitSpritesLayer,
    group: "interface"
  };
});

Hooks.on("canvasReady", canvasInstance => {
  const layer = canvasInstance.portraitSprites;
  if (!layer) return;
  log("Canvas Ready with", layer.sprites.size, "portrait sprites");
});

window.PortraitSprites = createPortraitSpritesApi();

log("Module loaded");
