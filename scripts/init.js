/**
 * Portrait Sprites & Expressions
 * Main initialization script
 */

import { createPortraitSpritesApi, MODULE_ID } from "./api.js";
import { log } from "./constants.js";
import { PortraitSprite, PortraitSpriteHUD, PortraitSpritesLayer } from "./layer.js";
import { PortraitSpriteCreator } from "./creator.js";
import { CountAwarePortraitSpriteEditor } from "./count-aware-editor.js";
import { installNoExpressionSupport } from "./no-expression.js";
import { installFaceReplacement } from "./face-replacement.js";
import { installV13LayerControls } from "./v13-layer-controls.js";
import { installTransformSupport } from "./transform.js";
import { installFlipSupport } from "./flip-support.js";
import {
  installSpriteMenus,
  PortraitExpressionPicker
} from "./sprite-menus.js";
import { installContextMenuFix } from "./context-menu-fix.js";
import { installPlayerVisibility } from "./player-visibility.js";
import { installKeyboardDelete } from "./keyboard-delete.js";
import { installFinalPreviewControls } from "./final-preview-controls.js";
import { installScrollableApplicationLayouts } from "./scroll-layout.js";
import { installExpressionPickerAlignment } from "./runtime-fixes.js";
import { installLargeExpressionPreviews } from "./expression-preview-size.js";
import { installLiveSceneSync } from "./live-sync.js";
import { installDragSync } from "./drag-sync.js";
import {
  installSingleImageRuntimeSupport,
  installSingleImageUiSupport
} from "./single-image-support.js";
import { installSingleImageSelection } from "./single-image-selection.js";
import {
  PortraitSpriteLibrary,
  SPRITE_LIBRARY_SETTING,
  syncSpriteLibraryFromScenes
} from "./sprite-library.js";

// Install body-only rendering before the existing expression wrappers capture
// the base PortraitSprite methods.
installSingleImageRuntimeSupport(PortraitSprite);
installNoExpressionSupport(PortraitSprite, PortraitSpriteHUD);
installFaceReplacement(PortraitSprite);
installV13LayerControls(PortraitSpritesLayer, PortraitSprite, PortraitSpriteCreator, PortraitSpriteLibrary);
installTransformSupport(PortraitSpritesLayer, PortraitSprite, PortraitSpriteHUD);
installFlipSupport(PortraitSpritesLayer, PortraitSprite);
installSpriteMenus(PortraitSprite);
installContextMenuFix(
  PortraitSpritesLayer,
  PortraitSprite,
  CountAwarePortraitSpriteEditor,
  PortraitExpressionPicker
);
installPlayerVisibility(PortraitSpritesLayer, PortraitSprite);
installKeyboardDelete();
installFinalPreviewControls(PortraitSpriteCreator);
installScrollableApplicationLayouts(PortraitSpriteCreator, PortraitExpressionPicker);
installExpressionPickerAlignment(PortraitExpressionPicker);
installLargeExpressionPreviews(PortraitExpressionPicker);
installLiveSceneSync();
// Install UI behavior last so it can suppress expression-specific controls and
// preview timers after the existing creator/context-menu wrappers run.
installSingleImageUiSupport(PortraitSpriteCreator, CountAwarePortraitSpriteEditor, PortraitSprite);
// Refine Single Image preview interaction after the UI wrapper so the hidden
// expression/head hit regions can never intercept body selection drags.
installSingleImageSelection(PortraitSpriteCreator);

Hooks.once("init", () => {
  log("Initializing");

  game.settings.register(MODULE_ID, "version", {
    name: "Module Version",
    scope: "world",
    config: false,
    default: "1.0.0",
    type: String
  });

  game.settings.register(MODULE_ID, SPRITE_LIBRARY_SETTING, {
    name: "Portrait Sprite Library",
    scope: "world",
    config: false,
    default: { entries: [], ignoredSignatures: [] },
    type: Object
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

Hooks.once("ready", () => {
  installDragSync(PortraitSprite);
  if (game.user?.isGM) syncSpriteLibraryFromScenes();
});

Hooks.on("canvasReady", canvasInstance => {
  const layer = canvasInstance.portraitSprites;
  if (!layer) return;
  log("Canvas Ready with", layer.sprites.size, "portrait sprites");
});

window.PortraitSprites = createPortraitSpritesApi();

log("Module loaded");
