/**
 * Public API for managing portrait sprites on the active Scene.
 */

import { DEFAULT_BODY_FRAME, DEFAULT_HEAD_FRAME, DEFAULT_HEAD_OFFSET, MODULE_ID } from "./constants.js";
import { getSceneSprites, setSceneSprites } from "./scene-flags.js";

function getDefaultHeadFrame() {
  return {
    ...DEFAULT_HEAD_FRAME,
    name: game.i18n.localize("PORTRAIT_SPRITES.DefaultExpression")
  };
}

function normalizeSpriteConfig(config) {
  return {
    id: foundry.utils.randomID(),
    spritesheet: config.spritesheet,
    bodyFrame: config.bodyFrame || { ...DEFAULT_BODY_FRAME },
    headFrames: config.headFrames || [getDefaultHeadFrame()],
    headOffset: config.headOffset || { ...DEFAULT_HEAD_OFFSET },
    x: config.x || 0,
    y: config.y || 0,
    currentExpression: 0
  };
}

export function createPortraitSpritesApi() {
  return {
    /**
     * Add a new portrait sprite to the scene.
     * @param {Object} config - Sprite configuration.
     * @returns {Promise<Object|null>} The created sprite data.
     */
    async addSprite(config) {
      if (!canvas.scene) {
        ui.notifications.error("No active scene");
        return null;
      }

      const sprites = getSceneSprites();
      const spriteData = normalizeSpriteConfig(config);

      sprites.push(spriteData);
      await setSceneSprites(sprites);

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
      if (!canvas.scene) return;

      const filtered = getSceneSprites().filter(sprite => sprite.id !== id);
      await setSceneSprites(filtered);

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
      if (!canvas.scene) return;

      const sprites = getSceneSprites();
      const index = sprites.findIndex(sprite => sprite.id === id);
      if (index < 0) return;

      sprites[index] = foundry.utils.mergeObject(sprites[index], updates);
      await setSceneSprites(sprites);

      if (canvas.portraitSprites) {
        await canvas.portraitSprites.updateSprite(id, updates);
      }
    }
  };
}

export { MODULE_ID };
