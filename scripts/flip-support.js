import { updateSceneSprite } from "./scene-flags.js";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getActiveHeadFrame(sprite) {
  const index = Number(sprite.currentExpression);
  if (!Number.isInteger(index) || index < 0 || index >= (sprite.headFrames?.length ?? 0)) return null;
  return sprite.headFrames[index];
}

function redrawSelectionFrame(sprite, bounds) {
  if (!sprite.selectionFrame || !bounds) return;
  sprite.selectionFrame.clear();
  sprite.selectionFrame.lineStyle(2, 0xffc107, 1);
  sprite.selectionFrame.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
  sprite.selectionFrame.visible = Boolean(sprite.selected);
}

function getFlippedContentBounds(sprite) {
  const bodyWidth = Math.max(1, finiteNumber(sprite.bodyFrame?.width, 1));
  const bodyHeight = Math.max(1, finiteNumber(sprite.bodyFrame?.height, 1));
  const frame = getActiveHeadFrame(sprite);
  if (!frame || sprite.headSprite?.visible === false) {
    return new PIXI.Rectangle(0, 0, bodyWidth, bodyHeight);
  }

  const offsetX = finiteNumber(sprite.headOffset?.x);
  const offsetY = finiteNumber(sprite.headOffset?.y);
  const frameWidth = Math.max(0, finiteNumber(frame.width));
  const frameHeight = Math.max(0, finiteNumber(frame.height));
  const headLeft = sprite.flippedX
    ? bodyWidth - offsetX - frameWidth
    : offsetX;
  const headRight = sprite.flippedX
    ? bodyWidth - offsetX
    : offsetX + frameWidth;

  const left = Math.min(0, headLeft);
  const top = Math.min(0, offsetY);
  const right = Math.max(bodyWidth, headRight);
  const bottom = Math.max(bodyHeight, offsetY + frameHeight);
  return new PIXI.Rectangle(left, top, right - left, bottom - top);
}

function refreshContentBounds(sprite) {
  const bounds = getFlippedContentBounds(sprite);

  // Transform support keeps an unpadded content rectangle separately from the
  // larger pointer hit area used for resize/rotation handles. Replace that
  // content rectangle so selection, marquee, and direct transforms all follow
  // the mirrored sprite correctly.
  if ("transformContentBounds" in sprite || sprite.refreshTransformEventHitArea) {
    sprite.transformContentBounds = new PIXI.Rectangle(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );
    sprite.refreshTransformEventHitArea?.();
    sprite.updateTransformHandles?.();
  } else {
    sprite.hitArea = bounds;
  }

  redrawSelectionFrame(sprite, bounds);
}

function applyHorizontalFlip(sprite) {
  const flipped = Boolean(sprite.flippedX);
  const sign = flipped ? -1 : 1;
  const bodyWidth = Math.max(1, finiteNumber(sprite.bodyFrame?.width, 1));
  const headOffsetX = finiteNumber(sprite.headOffset?.x);
  const headOffsetY = finiteNumber(sprite.headOffset?.y);

  if (sprite.bodySprite) {
    sprite.bodySprite.scale.x = sign;
    sprite.bodySprite.position.x = flipped ? bodyWidth : 0;
  }

  if (sprite.faceReplacementBodyContainer) {
    sprite.faceReplacementBodyContainer.scale.x = sign;
    sprite.faceReplacementBodyContainer.position.x = flipped ? bodyWidth : 0;
  }

  if (sprite.headSprite) {
    sprite.headSprite.scale.x = sign;
    sprite.headSprite.position.set(
      flipped ? bodyWidth - headOffsetX : headOffsetX,
      headOffsetY
    );
  }

  refreshContentBounds(sprite);
}

/**
 * Add a persisted horizontal mirror state without using a negative container
 * scale. Mirroring only the portrait artwork keeps the existing rotation/resize
 * transform math and handles stable while still flipping body and expression as
 * one visual composition.
 */
export function installFlipSupport(PortraitSpritesLayer, PortraitSprite) {
  if (PortraitSprite.prototype.flipSupportInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "flipSupportInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalCreateSprite = PortraitSpritesLayer.prototype.createSprite;
  const originalDraw = PortraitSprite.prototype.draw;
  const originalUpdate = PortraitSprite.prototype.update;
  const originalUpdateExpression = PortraitSprite.prototype.updateExpression;

  PortraitSprite.prototype.applyHorizontalFlip = function() {
    applyHorizontalFlip(this);
  };

  PortraitSprite.prototype.setHorizontalFlip = async function(flipped) {
    this.flippedX = Boolean(flipped);
    applyHorizontalFlip(this);
    return updateSceneSprite(this.id, sprite => ({
      ...sprite,
      flipX: this.flippedX
    }));
  };

  PortraitSprite.prototype.toggleHorizontalFlip = async function() {
    return this.setHorizontalFlip(!this.flippedX);
  };

  PortraitSprite.prototype.draw = async function(...args) {
    const result = await originalDraw.apply(this, args);
    applyHorizontalFlip(this);
    return result;
  };

  PortraitSprite.prototype.updateExpression = function(...args) {
    const result = originalUpdateExpression.apply(this, args);
    applyHorizontalFlip(this);
    return result;
  };

  PortraitSprite.prototype.update = async function(updates = {}) {
    if (updates.flipX !== undefined) this.flippedX = Boolean(updates.flipX);
    const result = await originalUpdate.call(this, updates);
    applyHorizontalFlip(this);
    return result;
  };

  PortraitSpritesLayer.prototype.createSprite = async function(data) {
    const sprite = await originalCreateSprite.call(this, data);
    sprite.flippedX = Boolean(data?.flipX);
    applyHorizontalFlip(sprite);
    return sprite;
  };
}
