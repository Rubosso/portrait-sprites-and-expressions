/**
 * Custom canvas layer for rendering portrait sprites
 */
import { DEFAULT_BODY_FRAME, DEFAULT_HEAD_FRAME, DEFAULT_HEAD_OFFSET, TEMPLATES } from "./constants.js";
import { getSceneSprites, updateSceneSprite } from "./scene-flags.js";
const CanvasLayerBase = foundry.canvas?.layers?.CanvasLayer ?? globalThis.CanvasLayer;

export class PortraitSpritesLayer extends CanvasLayerBase {
  constructor() {
    super();
    this.sprites = new Map();
  }

  /**
   * @override
   */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "portraitSprites",
      zIndex: 400
    });
  }

  /**
   * @override
   */
  async _draw(_options) {
    this.#clearSprites();

    // Load sprites from scene flags
    const spriteData = getSceneSprites();

    for (const data of spriteData) {
      await this.createSprite(data);
    }

    return this;
  }

  /**
   * Create a portrait sprite from data
   * @param {Object} data - Sprite configuration
   */
  async createSprite(data) {
    const sprite = new PortraitSprite(data);
    await sprite.draw();
    
    this.sprites.set(data.id, sprite);
    this.addChild(sprite);
    
    return sprite;
  }

  /**
   * Remove a sprite by ID
   * @param {string} id - Sprite ID
   */
  removeSprite(id) {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  /**
   * Update sprite data
   * @param {string} id - Sprite ID
   * @param {Object} updates - Updated data
   */
  async updateSprite(id, updates) {
    const sprite = this.sprites.get(id);
    if (sprite) {
      await sprite.update(updates);
    }
  }

  /**
   * @override
   */
  async _tearDown(options) {
    this.#clearSprites();
    return super._tearDown(options);
  }

  /**
   * Destroy and forget all sprites currently drawn on the layer.
   */
  #clearSprites() {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
  }
}

/**
 * A portrait sprite composed of body and head with expression frames
 */
class PortraitSprite extends PIXI.Container {
  constructor(data) {
    super();
    
    this.id = data.id;
    this.spritesheet = data.spritesheet;
    this.position.set(data.x || 0, data.y || 0);
    
    // Body frame configuration
    this.bodyFrame = data.bodyFrame || { ...DEFAULT_BODY_FRAME };
    
    // Head frames configuration (array of frames for different expressions)
    this.headFrames = data.headFrames || [
      {
        ...DEFAULT_HEAD_FRAME,
        name: game.i18n.localize("PORTRAIT_SPRITES.DefaultExpression")
      }
    ];
    this.currentExpression = data.currentExpression || 0;
    
    // Position of head relative to body
    this.headOffset = data.headOffset || { ...DEFAULT_HEAD_OFFSET };
    
    this.bodySprite = null;
    this.headSprite = null;
    this.baseTexture = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
  }

  /**
   * Draw the sprite
   */
  async draw() {
    // Load the base texture
    this.baseTexture = await PIXI.Assets.load(this.spritesheet);
    
    // Create body sprite
    const bodyTexture = new PIXI.Texture(
      this.baseTexture,
      new PIXI.Rectangle(
        this.bodyFrame.x,
        this.bodyFrame.y,
        this.bodyFrame.width,
        this.bodyFrame.height
      )
    );
    this.bodySprite = new PIXI.Sprite(bodyTexture);
    this.addChild(this.bodySprite);
    
    // Create head sprite with initial expression
    const headFrame = this.headFrames[this.currentExpression];
    const headTexture = new PIXI.Texture(
      this.baseTexture,
      new PIXI.Rectangle(
        headFrame.x,
        headFrame.y,
        headFrame.width,
        headFrame.height
      )
    );
    this.headSprite = new PIXI.Sprite(headTexture);
    this.headSprite.position.set(this.headOffset.x, this.headOffset.y);
    this.addChild(this.headSprite);
    
    // Make interactive for HUD
    this.interactive = true;
    this.buttonMode = true;
    this.on("rightclick", this._onRightClick.bind(this));
    this.on("pointerdown", this._onDragStart.bind(this));
    this.on("pointerup", this._onDragEnd.bind(this));
    this.on("pointerupoutside", this._onDragEnd.bind(this));
    this.on("pointermove", this._onDragMove.bind(this));
  }

  /**
   * Update the sprite
   * @param {Object} updates - Updates to apply
   */
  async update(updates) {
    if (updates.x !== undefined) this.position.x = updates.x;
    if (updates.y !== undefined) this.position.y = updates.y;
    if (updates.headOffset) {
      this.headOffset = updates.headOffset;
      if (this.headSprite) {
        this.headSprite.position.set(this.headOffset.x, this.headOffset.y);
      }
    }
    if (updates.headFrames) {
      this.headFrames = updates.headFrames;
      if (updates.currentExpression === undefined) {
        this.currentExpression = Math.min(this.currentExpression, this.headFrames.length - 1);
      }
      this.updateExpression();
    }
    if (updates.currentExpression !== undefined) {
      this.currentExpression = updates.currentExpression;
      this.updateExpression();
    }
  }

  /**
   * Change the expression by updating the head sprite frame
   * @param {number} expressionIndex - Index of the expression to display
   */
  updateExpression() {
    if (!this.headSprite || !this.headFrames[this.currentExpression]) return;
    
    const headFrame = this.headFrames[this.currentExpression];
    
    // Update the texture frame
    this.headSprite.texture.frame = new PIXI.Rectangle(
      headFrame.x,
      headFrame.y,
      headFrame.width,
      headFrame.height
    );
    
    // Call updateUvs to update the UV coordinates
    this.headSprite.texture.updateUvs();
  }

  /**
   * Update the name of the current expression
   * @param {string} name
   */
  async updateExpressionName(name) {
    if (!this.headFrames[this.currentExpression]) return;
    this.headFrames[this.currentExpression].name = name;
    await this._saveToScene();
  }

  /**
   * Cycle to next expression
   */
  nextExpression() {
    this.currentExpression = (this.currentExpression + 1) % this.headFrames.length;
    this.updateExpression();
    this._saveToScene();
  }

  /**
   * Cycle to previous expression
   */
  previousExpression() {
    this.currentExpression = (this.currentExpression - 1 + this.headFrames.length) % this.headFrames.length;
    this.updateExpression();
    this._saveToScene();
  }

  /**
   * Save current state to scene flags
   */
  async _saveToScene() {
    await updateSceneSprite(this.id, sprite => ({
      ...sprite,
      currentExpression: this.currentExpression,
      headFrames: this.headFrames,
      x: this.position.x,
      y: this.position.y
    }));
  }

  async _savePosition() {
    await updateSceneSprite(this.id, sprite => ({
      ...sprite,
      x: this.position.x,
      y: this.position.y
    }));
  }

  /**
   * Handle right-click to show HUD
   */
  _onRightClick(event) {
    event.stopPropagation();
    
    // Show expression HUD
    const hud = new PortraitSpriteHUD(this);
    hud.render(true);
  }

  _onDragStart(event) {
    if (event.data.button !== 0) return;
    this.isDragging = true;
    const position = event.data.getLocalPosition(this.parent);
    this.dragOffset.x = position.x - this.position.x;
    this.dragOffset.y = position.y - this.position.y;
  }

  _onDragMove(event) {
    if (!this.isDragging) return;
    const position = event.data.getLocalPosition(this.parent);
    this.position.set(position.x - this.dragOffset.x, position.y - this.dragOffset.y);
  }

  async _onDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    await this._savePosition();
  }

  /**
   * Clean up
   */
  destroy(options) {
    if (this.bodySprite) this.bodySprite.destroy();
    if (this.headSprite) this.headSprite.destroy();
    super.destroy(options);
  }
}

/**
 * HUD for cycling through expressions
 */
class PortraitSpriteHUD extends Application {
  constructor(sprite) {
    super();
    this.sprite = sprite;
  }

  /**
   * @override
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "portrait-sprite-hud",
      template: TEMPLATES.hud,
      classes: ["portrait-sprite-hud"],
      width: 200,
      height: "auto",
      popOut: true,
      resizable: false,
      title: game.i18n.localize("PORTRAIT_SPRITES.HUD.Title")
    });
  }

  /**
   * @override
   */
  getData() {
    const expressions = this.sprite.headFrames.map((frame, index) => ({
      index,
      label: frame.name || game.i18n.format("PORTRAIT_SPRITES.HUD.ExpressionNumber", { index: index + 1 }),
      isActive: index === this.sprite.currentExpression
    }));
    return {
      currentExpression: this.sprite.currentExpression + 1,
      totalExpressions: this.sprite.headFrames.length,
      hasMultipleExpressions: this.sprite.headFrames.length > 1,
      expressions,
      currentExpressionName: this.sprite.headFrames[this.sprite.currentExpression]?.name || ""
    };
  }

  /**
   * @override
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    html.find(".prev-expression").click(() => {
      this.sprite.previousExpression();
      this.render();
    });
    
    html.find(".next-expression").click(() => {
      this.sprite.nextExpression();
      this.render();
    });

    html.find(".expression-select").on("change", event => {
      const index = Number(event.currentTarget.value);
      if (Number.isNaN(index)) return;
      this.sprite.currentExpression = index;
      this.sprite.updateExpression();
      this.sprite._saveToScene();
      this.render();
    });

    html.find(".expression-name-input").on("change", event => {
      const name = event.currentTarget.value.trim();
      this.sprite.updateExpressionName(name);
      this.render();
    });
  }
}

// Export the PortraitSprite class for external use
export { PortraitSprite, PortraitSpriteHUD };
