/**
 * Adds a persisted "no expression" state to portrait sprites without changing
 * the existing scene flag shape. The sentinel value is stored in
 * currentExpression alongside the existing numeric frame indexes.
 */

export const NO_EXPRESSION = -1;

function hasExpression(sprite, index = sprite.currentExpression) {
  return Number.isInteger(index) && index >= 0 && index < sprite.headFrames.length;
}

function normalizeExpression(sprite, index) {
  return hasExpression(sprite, index) ? index : NO_EXPRESSION;
}

function redrawSelectionFrame(sprite) {
  if (!sprite.selectionFrame || !sprite.hitArea) return;

  sprite.selectionFrame.clear();
  sprite.selectionFrame.lineStyle(2, 0xffc107, 1);
  sprite.selectionFrame.drawRect(
    sprite.hitArea.x,
    sprite.hitArea.y,
    sprite.hitArea.width,
    sprite.hitArea.height
  );
  sprite.selectionFrame.visible = sprite.selected;
}

function updateVisibleHitArea(sprite) {
  const headFrame = hasExpression(sprite) ? sprite.headFrames[sprite.currentExpression] : null;
  const minX = headFrame ? Math.min(0, sprite.headOffset.x) : 0;
  const minY = headFrame ? Math.min(0, sprite.headOffset.y) : 0;
  const maxX = headFrame
    ? Math.max(sprite.bodyFrame.width, sprite.headOffset.x + headFrame.width)
    : sprite.bodyFrame.width;
  const maxY = headFrame
    ? Math.max(sprite.bodyFrame.height, sprite.headOffset.y + headFrame.height)
    : sprite.bodyFrame.height;

  sprite.hitArea = new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
  redrawSelectionFrame(sprite);
}

/**
 * Extend the existing sprite and HUD classes with the no-expression state.
 * @param {typeof import("./layer.js").PortraitSprite} PortraitSprite
 * @param {typeof import("./layer.js").PortraitSpriteHUD} PortraitSpriteHUD
 */
export function installNoExpressionSupport(PortraitSprite, PortraitSpriteHUD) {
  if (PortraitSprite.prototype.noExpressionSupportInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "noExpressionSupportInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalDraw = PortraitSprite.prototype.draw;
  const originalUpdate = PortraitSprite.prototype.update;
  const originalPrepareContext = PortraitSpriteHUD.prototype._prepareContext;

  PortraitSprite.prototype.draw = async function(...args) {
    const requestedExpression = normalizeExpression(this, this.currentExpression);

    // The original draw method needs a real frame to construct the head sprite.
    // Use the first frame temporarily, then restore and apply the requested state.
    if (requestedExpression === NO_EXPRESSION) this.currentExpression = 0;
    await originalDraw.apply(this, args);

    this.currentExpression = requestedExpression;
    this.updateExpression();
  };

  PortraitSprite.prototype.update = async function(...args) {
    await originalUpdate.apply(this, args);
    this.currentExpression = normalizeExpression(this, this.currentExpression);
    this.updateExpression();
  };

  PortraitSprite.prototype.updateExpression = function() {
    if (!this.headSprite) return;

    const headFrame = hasExpression(this) ? this.headFrames[this.currentExpression] : null;
    if (!headFrame) {
      this.currentExpression = NO_EXPRESSION;
      this.headSprite.visible = false;
      updateVisibleHitArea(this);
      return;
    }

    this.headSprite.visible = true;
    this.headSprite.texture.frame = new PIXI.Rectangle(
      headFrame.x,
      headFrame.y,
      headFrame.width,
      headFrame.height
    );
    this.headSprite.texture.updateUvs();
    updateVisibleHitArea(this);
  };

  PortraitSprite.prototype.nextExpression = function() {
    if (this.headFrames.length === 0 || this.currentExpression >= this.headFrames.length - 1) {
      this.currentExpression = NO_EXPRESSION;
    } else {
      this.currentExpression += 1;
    }

    this.updateExpression();
    this._saveToScene();
  };

  PortraitSprite.prototype.previousExpression = function() {
    if (this.headFrames.length === 0) {
      this.currentExpression = NO_EXPRESSION;
    } else if (this.currentExpression === NO_EXPRESSION) {
      this.currentExpression = this.headFrames.length - 1;
    } else if (this.currentExpression === 0) {
      this.currentExpression = NO_EXPRESSION;
    } else {
      this.currentExpression -= 1;
    }

    this.updateExpression();
    this._saveToScene();
  };

  PortraitSpriteHUD.prototype._prepareContext = async function(options) {
    const context = await originalPrepareContext.call(this, options);
    const hasSelectedExpression = hasExpression(this.sprite);
    const noExpressionLabel = game.i18n.localize("PORTRAIT_SPRITES.HUD.NoExpression");

    return {
      ...context,
      currentExpressionLabel: hasSelectedExpression
        ? game.i18n.format("PORTRAIT_SPRITES.HUD.ExpressionLabel", {
            current: this.sprite.currentExpression + 1,
            total: this.sprite.headFrames.length
          })
        : noExpressionLabel,
      expressions: [
        {
          index: NO_EXPRESSION,
          label: noExpressionLabel,
          isActive: this.sprite.currentExpression === NO_EXPRESSION
        },
        ...context.expressions
      ],
      hasSelectedExpression
    };
  };
}
