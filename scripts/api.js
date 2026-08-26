/**
 * Public API for managing portrait sprites on the active Scene.
 */

import { DEFAULT_BODY_FRAME, DEFAULT_HEAD_FRAME, DEFAULT_HEAD_OFFSET, MODULE_ID } from "./constants.js";
import { NO_EXPRESSION } from "./no-expression.js";
import { getSceneSprites, setSceneSprites } from "./scene-flags.js";
import { rememberSpriteTemplate } from "./sprite-library.js";

const SPAWN_VIEW_FRACTION = 0.8;
const MIN_SCALE = 0.01;
const MAX_SCALE = 5;

function getDefaultHeadFrame() {
  return {
    ...DEFAULT_HEAD_FRAME,
    name: game.i18n.localize("PORTRAIT_SPRITES.DefaultExpression")
  };
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getSpriteContentBounds(config) {
  const body = config.bodyFrame || DEFAULT_BODY_FRAME;
  const bodyWidth = Math.max(1, finiteNumber(body.width, DEFAULT_BODY_FRAME.width));
  const bodyHeight = Math.max(1, finiteNumber(body.height, DEFAULT_BODY_FRAME.height));
  const offsetX = finiteNumber(config.headOffset?.x, DEFAULT_HEAD_OFFSET.x);
  const offsetY = finiteNumber(config.headOffset?.y, DEFAULT_HEAD_OFFSET.y);

  let left = 0;
  let top = 0;
  let right = bodyWidth;
  let bottom = bodyHeight;

  for (const frame of config.headFrames || []) {
    const width = Math.max(0, finiteNumber(frame?.width));
    const height = Math.max(0, finiteNumber(frame?.height));
    if (!width || !height) continue;
    left = Math.min(left, offsetX);
    top = Math.min(top, offsetY);
    right = Math.max(right, offsetX + width);
    bottom = Math.max(bottom, offsetY + height);
  }

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

function getCurrentCanvasViewport() {
  const screen = canvas.app?.renderer?.screen;
  const coordinateSpace = canvas.portraitSprites ?? canvas.stage;
  if (!screen || !coordinateSpace?.toLocal) return null;

  const corners = [
    new PIXI.Point(0, 0),
    new PIXI.Point(screen.width, 0),
    new PIXI.Point(screen.width, screen.height),
    new PIXI.Point(0, screen.height)
  ].map(point => coordinateSpace.toLocal(point));

  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (![left, right, top, bottom].every(Number.isFinite)) return null;
  if (right <= left || bottom <= top) return null;

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function getViewportSpawnTransform(config) {
  const viewport = getCurrentCanvasViewport();
  if (!viewport) return null;

  const bounds = getSpriteContentBounds(config);
  const fitScale = Math.min(
    viewport.width * SPAWN_VIEW_FRACTION / bounds.width,
    viewport.height * SPAWN_VIEW_FRACTION / bounds.height
  );
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale));
  const viewportCenterX = viewport.x + viewport.width / 2;
  const viewportCenterY = viewport.y + viewport.height / 2;
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  return {
    x: viewportCenterX - contentCenterX * scale,
    y: viewportCenterY - contentCenterY * scale,
    scaleX: scale,
    scaleY: scale
  };
}

function normalizeSpriteConfig(config) {
  const autoPlacement = config.autoPlace === false ? null : getViewportSpawnTransform(config);

  return {
    id: foundry.utils.randomID(),
    libraryId: config.libraryId || null,
    name: config.name || "",
    spritesheet: config.spritesheet,
    bodyFrame: config.bodyFrame || { ...DEFAULT_BODY_FRAME },
    headFrames: config.headFrames || [getDefaultHeadFrame()],
    headOffset: config.headOffset || { ...DEFAULT_HEAD_OFFSET },
    x: autoPlacement?.x ?? finiteNumber(config.x, 0),
    y: autoPlacement?.y ?? finiteNumber(config.y, 0),
    rotation: finiteNumber(config.rotation, 0),
    scaleX: autoPlacement?.scaleX ?? finiteNumber(config.scaleX, 1),
    scaleY: autoPlacement?.scaleY ?? finiteNumber(config.scaleY, 1),
    currentExpression: Number.isInteger(config.currentExpression) ? config.currentExpression : NO_EXPRESSION,
    flipX: Boolean(config.flipX),
    hiddenFromPlayers: Boolean(config.hiddenFromPlayers)
  };
}

function canManagePortraitSprites() {
  return Boolean(game.user?.isGM);
}

function denyMutation() {
  ui.notifications?.warn?.("Only a GM can modify portrait sprites.");
  return null;
}

function changesReusableConfiguration(updates) {
  return ["libraryId", "name", "spritesheet", "bodyFrame", "headFrames", "headOffset"]
    .some(key => updates?.[key] !== undefined);
}

export function createPortraitSpritesApi() {
  return {
    /**
     * Add a new portrait sprite to the scene.
     * By default the sprite is centered in the current canvas view and scaled
     * to fit comfortably inside it. Pass autoPlace: false to preserve explicit
     * x/y/scale values supplied by an API caller.
     * @param {Object} config - Sprite configuration.
     * @returns {Promise<Object|null>} The created sprite data.
     */
    async addSprite(config) {
      if (!canManagePortraitSprites()) return denyMutation();
      if (!canvas.scene) {
        ui.notifications.error("No active scene");
        return null;
      }

      const sprites = getSceneSprites();
      const spriteData = normalizeSpriteConfig(config);
      const libraryEntry = await rememberSpriteTemplate(spriteData);
      if (libraryEntry) {
        spriteData.libraryId = libraryEntry.id;
        spriteData.name = libraryEntry.name;
      }

      sprites.push(spriteData);
      const saved = await setSceneSprites(sprites);
      if (!saved) return null;

      if (canvas.portraitSprites) {
        await canvas.portraitSprites.createSprite(spriteData);
      }

      return spriteData;
    },

    /**
     * Remove a sprite from the scene.
     * @param {string} id - Sprite ID.
     */
    async removeSprite(id) {
      if (!canManagePortraitSprites()) return denyMutation();
      if (!canvas.scene) return;

      const filtered = getSceneSprites().filter(sprite => sprite.id !== id);
      const saved = await setSceneSprites(filtered);
      if (!saved) return null;

      if (canvas.portraitSprites) {
        canvas.portraitSprites.removeSprite(id);
      }
    },

    /**
     * Get all sprites in the current scene.
     * @returns {Array} Array of sprite data.
     */
    getSprites() {
      return getSceneSprites();
    },

    /**
     * Update a sprite.
     * @param {string} id - Sprite ID.
     * @param {Object} updates - Updates to apply.
     */
    async updateSprite(id, updates) {
      if (!canManagePortraitSprites()) return denyMutation();
      if (!canvas.scene) return;

      const sprites = getSceneSprites();
      const index = sprites.findIndex(sprite => sprite.id === id);
      if (index < 0) return;

      sprites[index] = foundry.utils.mergeObject(sprites[index], updates);
      if (changesReusableConfiguration(updates)) {
        const libraryEntry = await rememberSpriteTemplate(sprites[index]);
        if (libraryEntry) {
          sprites[index].libraryId = libraryEntry.id;
          sprites[index].name = libraryEntry.name;
        }
      }

      const saved = await setSceneSprites(sprites);
      if (!saved) return null;

      if (canvas.portraitSprites) {
        await canvas.portraitSprites.updateSprite(id, updates);
      }
      return sprites[index];
    }
  };
}

export { MODULE_ID };
