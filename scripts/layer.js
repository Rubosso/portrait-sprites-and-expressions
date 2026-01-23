/**
 * Custom canvas layer for rendering portrait sprites
 */
export class PortraitSpritesLayer extends CanvasLayer {
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
  async _draw(options) {
    await super._draw(options);
    
    // Load sprites from scene flags
    const spriteData = canvas.scene.getFlag("portrait-sprites-expressions", "sprites") || [];
    
    for (const data of spriteData) {
      await this.createSprite(data);
    }
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
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    return super._tearDown(options);
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
    this.bodyFrame = data.bodyFrame || { x: 0, y: 0, width: 100, height: 100 };
    
    // Head frames configuration (array of frames for different expressions)
    this.headFrames = data.headFrames || [
      { x: 0, y: 100, width: 100, height: 50 }
    ];
    this.currentExpression = data.currentExpression || 0;
    
    // Position of head relative to body
    this.headOffset = data.headOffset || { x: 0, y: 0 };
    
    this.bodySprite = null;
    this.headSprite = null;
    this.baseTexture = null;
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
  }

  /**
   * Update the sprite
   * @param {Object} updates - Updates to apply
   */
  async update(updates) {
    if (updates.x !== undefined) this.position.x = updates.x;
    if (updates.y !== undefined) this.position.y = updates.y;
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
    const sprites = canvas.scene.getFlag("portrait-sprites-expressions", "sprites") || [];
    const index = sprites.findIndex(s => s.id === this.id);
    
    if (index >= 0) {
      sprites[index].currentExpression = this.currentExpression;
      await canvas.scene.setFlag("portrait-sprites-expressions", "sprites", sprites);
    }
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
      template: "modules/portrait-sprites-expressions/templates/hud.html",
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
    return {
      currentExpression: this.sprite.currentExpression + 1,
      totalExpressions: this.sprite.headFrames.length,
      hasMultipleExpressions: this.sprite.headFrames.length > 1
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
  }
}

// Export the PortraitSprite class for external use
export { PortraitSprite, PortraitSpriteHUD };
