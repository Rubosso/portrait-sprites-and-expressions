/**
 * Portrait Sprites & Expressions
 * Main initialization script
 */

import { PortraitSpritesLayer } from "./layer.js";
import { PortraitSpriteCreator } from "./creator.js";

Hooks.once("init", () => {
  console.log("Portrait Sprites & Expressions | Initializing");
  
  // Register settings if needed in the future
  game.settings.register("portrait-sprites-expressions", "version", {
    name: "Module Version",
    scope: "world",
    config: false,
    default: "1.0.0",
    type: String
  });
});

Hooks.once("setup", () => {
  console.log("Portrait Sprites & Expressions | Setup");
  
  // Register the custom canvas layer
  CONFIG.Canvas.layers.portraitSprites = {
    layerClass: PortraitSpritesLayer,
    group: "primary"
  };
});

Hooks.on("canvasReady", (canvas) => {
  console.log("Portrait Sprites & Expressions | Canvas Ready");
  
  // The layer will automatically draw when canvas is ready
  if (canvas.portraitSprites) {
    console.log("Portrait Sprites & Expressions | Layer initialized with", 
      canvas.portraitSprites.sprites.size, "sprites");
  }
});

Hooks.on("getSceneControlButtons", (controls) => {
  // Add portrait sprites layer control
  controls.push({
    name: "portraitSprites",
    title: game.i18n.localize("PORTRAIT_SPRITES.Layer"),
    icon: "fas fa-user-circle",
    layer: "portraitSprites",
    tools: [
      {
        name: "portraitSpriteCreator",
        title: game.i18n.localize("PORTRAIT_SPRITES.Creator.Tool"),
        icon: "fas fa-plus-circle",
        onClick: () => {
          const creator = new PortraitSpriteCreator();
          creator.render(true);
        },
        button: true
      }
    ],
    activeTool: "select"
  });
});

// API for managing portrait sprites
window.PortraitSprites = {
  /**
   * Add a new portrait sprite to the scene
   * @param {Object} config - Sprite configuration
   * @param {string} config.spritesheet - Path to the spritesheet image
   * @param {Object} config.bodyFrame - Body frame rectangle {x, y, width, height}
   * @param {Array} config.headFrames - Array of head frame rectangles
   * @param {Object} config.headOffset - Head offset from body {x, y}
   * @param {number} config.x - X position on canvas
   * @param {number} config.y - Y position on canvas
   * @returns {Promise<Object>} The created sprite data
   */
  async addSprite(config) {
    if (!canvas.scene) {
      ui.notifications.error("No active scene");
      return null;
    }
    
    const sprites = canvas.scene.getFlag("portrait-sprites-expressions", "sprites") || [];
    
    const spriteData = {
      id: foundry.utils.randomID(),
      spritesheet: config.spritesheet,
      bodyFrame: config.bodyFrame || { x: 0, y: 0, width: 100, height: 100 },
      headFrames: config.headFrames || [
        { x: 0, y: 100, width: 100, height: 50, name: game.i18n.localize("PORTRAIT_SPRITES.DefaultExpression") }
      ],
      headOffset: config.headOffset || { x: 0, y: 0 },
      x: config.x || 0,
      y: config.y || 0,
      currentExpression: 0
    };
    
    sprites.push(spriteData);
    await canvas.scene.setFlag("portrait-sprites-expressions", "sprites", sprites);
    
    // Create the sprite on the layer
    if (canvas.portraitSprites) {
      await canvas.portraitSprites.createSprite(spriteData);
    }
    
    return spriteData;
  },
  
  /**
   * Remove a sprite from the scene
   * @param {string} id - Sprite ID
   */
  async removeSprite(id) {
    if (!canvas.scene) return;
    
    const sprites = canvas.scene.getFlag("portrait-sprites-expressions", "sprites") || [];
    const filtered = sprites.filter(s => s.id !== id);
    
    await canvas.scene.setFlag("portrait-sprites-expressions", "sprites", filtered);
    
    // Remove from layer
    if (canvas.portraitSprites) {
      canvas.portraitSprites.removeSprite(id);
    }
  },
  
  /**
   * Get all sprites in the current scene
   * @returns {Array} Array of sprite data
   */
  getSprites() {
    if (!canvas.scene) return [];
    return canvas.scene.getFlag("portrait-sprites-expressions", "sprites") || [];
  },
  
  /**
   * Update a sprite
   * @param {string} id - Sprite ID
   * @param {Object} updates - Updates to apply
   */
  async updateSprite(id, updates) {
    if (!canvas.scene) return;
    
    const sprites = canvas.scene.getFlag("portrait-sprites-expressions", "sprites") || [];
    const index = sprites.findIndex(s => s.id === id);
    
    if (index >= 0) {
      sprites[index] = foundry.utils.mergeObject(sprites[index], updates);
      await canvas.scene.setFlag("portrait-sprites-expressions", "sprites", sprites);
      
      // Update on layer
      if (canvas.portraitSprites) {
        await canvas.portraitSprites.updateSprite(id, updates);
      }
    }
  }
};

console.log("Portrait Sprites & Expressions | Module loaded");
