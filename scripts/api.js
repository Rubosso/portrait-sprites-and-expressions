/**
 * Public API for managing portrait sprites on the active Scene.
 */

import { DEFAULT_BODY_FRAME, DEFAULT_HEAD_FRAME, DEFAULT_HEAD_OFFSET, MODULE_ID } from "./constants.js";
import { getSceneSprites, setSceneSprites } from "./scene-flags.js";
import { rememberSpriteTemplate } from "./sprite-library.js";

function getDefaultHeadFrame() {
  return {
    ...DEFAULT_HEAD_FRAME,
    name: game.i18n.localize("PORTRAIT_SPRITES.DefaultExpression")
  };
}

function normalizeSpriteConfig(config) {
  return {
    id: foundry.utils.randomID(),
    libraryId: config.libraryId || null,
    name: config.name || "",
    spritesheet: config.spritesheet,
    bodyFrame: config.bodyFrame || { ...DEFAULT_BODY_FRAME },
    headFrames: config.headFrames || [getDefaultHeadFrame()],
    headOffset: config.headOffset || { ...DEFAULT_HEAD_OFFSET },
    x: config.x || 0,
    y: config.y || 0,
    currentExpression: 0
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
