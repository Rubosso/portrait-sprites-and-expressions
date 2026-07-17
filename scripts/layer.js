/**
 * Custom canvas layer for rendering portrait sprites
 */
import { DEFAULT_BODY_FRAME, DEFAULT_HEAD_FRAME, DEFAULT_HEAD_OFFSET, TEMPLATES } from "./constants.js";
import { getSceneSprites, updateSceneSprite } from "./scene-flags.js";
const CanvasLayerBase = foundry.canvas?.layers?.CanvasLayer ?? globalThis.CanvasLayer;
const InteractionLayerBase = foundry.canvas?.layers?.InteractionLayer ?? globalThis.InteractionLayer ?? CanvasLayerBase;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PortraitSpritesLayer extends InteractionLayerBase {
  constructor() {
    super();
    this.sprites = new Map();
    this.interactionActive = false;
    this.eventMode = "static";
    this.interactive = true;
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
    sprite.setInteractive(this.interactionActive);
    
    return sprite;
  }

  /**
   * @override
   */
  activate(...args) {
    const result = super.activate?.(...args);
    this.setInteractionActive(true);
    return result ?? this;
  }

  /**
   * @override
   */
  deactivate(...args) {
    this.setInteractionActive(false);
    const result = super.deactivate?.(...args);
    return result ?? this;
  }

  /**
   * @override
   */
  _activate(...args) {
    const result = super._activate?.(...args);
    this.setInteractionActive(true);
    return result;
  }

  /**
   * @override
   */
  _deactivate(...args) {
    this.setInteractionActive(false);
    return super._deactivate?.(...args);
  }

  /**
   * Enable or disable sprite pointer interactions for the selected tool.
   * @param {boolean} active
   */
  setInteractionActive(active) {
    this.interactionActive = Boolean(active);
    this.#setSpritesInteractive(this.interactionActive);
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

  #setSpritesInteractive(active) {
    for (const sprite of this.sprites.values()) {
      sprite.setInteractive(active);
    }
  }
}

/**
 * A portrait sprite composed of body and head with expression frames
 */
class PortraitSprite extends PIXI.Container {
  constructor(data) {
    super();

    this.setInteractive(false);
    
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
    this.#updateHitArea();
    
    this.on("rightclick", this._onRightClick.bind(this));
    this.on("rightdown", this._onRightClick.bind(this));
    this.on("pointerdown", this._onDragStart.bind(this));
    this.on("pointerup", this._onDragEnd.bind(this));
    this.on("pointerupoutside", this._onDragEnd.bind(this));
    this.on("pointermove", this._onDragMove.bind(this));
  }

  /**
   * Enable or disable pointer interaction for this sprite. Foundry activates
   * interaction-layer children only while their layer is selected.
   * @param {boolean} active
   */
  setInteractive(active) {
    this.eventMode = active ? "static" : "none";
    this.cursor = active ? "pointer" : null;
    this.interactive = active;
    this.buttonMode = active;
    if (this.bodySprite) this.bodySprite.eventMode = "none";
    if (this.headSprite) this.headSprite.eventMode = "none";
  }

  #updateHitArea() {
    const minX = Math.min(0, this.headOffset.x);
    const minY = Math.min(0, this.headOffset.y);
    const maxX = Math.max(this.bodyFrame.width, this.headOffset.x + (this.headFrames[this.currentExpression]?.width ?? 0));
    const maxY = Math.max(this.bodyFrame.height, this.headOffset.y + (this.headFrames[this.currentExpression]?.height ?? 0));
    this.hitArea = new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
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
      this.#updateHitArea();
    }
    if (updates.headFrames) {
      this.headFrames = updates.headFrames;
      if (updates.currentExpression === undefined) {
        this.currentExpression = Math.min(this.currentExpression, this.headFrames.length - 1);
      }
      this.updateExpression();
      this.#updateHitArea();
    }
    if (updates.currentExpression !== undefined) {
      this.currentExpression = updates.currentExpression;
      this.updateExpression();
      this.#updateHitArea();
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
    event.stopPropagation?.();
    
    // Show expression HUD
    const hud = new PortraitSpriteHUD(this);
    hud.render(true);
  }

  _onDragStart(event) {
    if (this.#getPointerButton(event) !== 0) return;
    event.stopPropagation?.();
    this.isDragging = true;
    const position = this.#getLocalPointerPosition(event);
    this.dragOffset.x = position.x - this.position.x;
    this.dragOffset.y = position.y - this.position.y;
  }

  _onDragMove(event) {
    if (!this.isDragging) return;
    event.stopPropagation?.();
    const position = this.#getLocalPointerPosition(event);
    this.position.set(position.x - this.dragOffset.x, position.y - this.dragOffset.y);
  }

  async _onDragEnd(event) {
    if (!this.isDragging) return;
    event?.stopPropagation?.();
    this.isDragging = false;
    await this._savePosition();
  }

  #getPointerButton(event) {
    return event?.button ?? event?.data?.button ?? 0;
  }

  #getLocalPointerPosition(event) {
    if (typeof event?.getLocalPosition === "function") {
      return event.getLocalPosition(this.parent);
    }
    return event.data.getLocalPosition(this.parent);
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
class PortraitSpriteHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(sprite) {
    super();
    this.sprite = sprite;
  }

  /**
   * @override
   */
  static DEFAULT_OPTIONS = {
    id: "portrait-sprite-hud",
    classes: ["portrait-sprite-hud"],
    position: {
      width: 200,
      height: "auto"
    },
    window: {
      title: "PORTRAIT_SPRITES.HUD.Title",
      frame: true,
      resizable: false
    }
  };

  static PARTS = {
    content: {
      template: TEMPLATES.hud
    }
  };

  /**
   * @override
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const expressions = this.sprite.headFrames.map((frame, index) => ({
      index,
      label: frame.name || game.i18n.format("PORTRAIT_SPRITES.HUD.ExpressionNumber", { index: index + 1 }),
      isActive: index === this.sprite.currentExpression
    }));
    return {
      ...context,
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
  _onRender(context, options) {
    super._onRender(context, options);
    
    this.element.querySelector(".prev-expression")?.addEventListener("click", () => {
      this.sprite.previousExpression();
      this.render();
    });
    
    this.element.querySelector(".next-expression")?.addEventListener("click", () => {
      this.sprite.nextExpression();
      this.render();
    });

    this.element.querySelector(".expression-select")?.addEventListener("change", event => {
      const index = Number(event.currentTarget.value);
      if (Number.isNaN(index)) return;
      this.sprite.currentExpression = index;
      this.sprite.updateExpression();
      this.sprite._saveToScene();
      this.render();
    });

    this.element.querySelector(".expression-name-input")?.addEventListener("change", event => {
      const name = event.currentTarget.value.trim();
      this.sprite.updateExpressionName(name);
      this.render();
    });
  }
}

// Export the PortraitSprite class for external use
export { PortraitSprite, PortraitSpriteHUD };
