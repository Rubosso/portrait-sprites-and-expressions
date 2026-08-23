/**
 * Replace the face area of the body crop with the active expression instead of
 * alpha-compositing the expression over the original face.
 *
 * The cutout rectangle is derived entirely from the existing head configuration:
 * headOffset provides the local body position and the active head frame provides
 * the cutout width and height. The cutout matches that rectangle exactly so the
 * replacement expression connects cleanly to the surrounding body artwork.
 */

function getActiveHeadFrame(sprite) {
  const index = Number(sprite.currentExpression);
  if (!Number.isInteger(index) || index < 0 || index >= (sprite.headFrames?.length ?? 0)) return null;
  return sprite.headFrames[index];
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getCutoutRectangle(sprite, frame) {
  if (!frame || !sprite.bodyFrame) return null;

  const bodyWidth = Math.max(0, Number(sprite.bodyFrame.width) || 0);
  const bodyHeight = Math.max(0, Number(sprite.bodyFrame.height) || 0);
  if (!bodyWidth || !bodyHeight) return null;

  const offsetX = Number(sprite.headOffset?.x) || 0;
  const offsetY = Number(sprite.headOffset?.y) || 0;
  const frameWidth = Math.max(0, Number(frame.width) || 0);
  const frameHeight = Math.max(0, Number(frame.height) || 0);
  if (!frameWidth || !frameHeight) return null;

  const left = clamp(offsetX, 0, bodyWidth);
  const top = clamp(offsetY, 0, bodyHeight);
  const right = clamp(offsetX + frameWidth, 0, bodyWidth);
  const bottom = clamp(offsetY + frameHeight, 0, bodyHeight);

  if (right <= left || bottom <= top) return null;
  return new PIXI.Rectangle(left, top, right - left, bottom - top);
}

function destroyBodySlices(container) {
  if (!container) return;
  for (const child of container.removeChildren()) {
    child.texture?.destroy?.(false);
    child.destroy?.({ children: true });
  }
}

function ensureBodyReplacementContainer(sprite) {
  if (sprite.faceReplacementBodyContainer) return sprite.faceReplacementBodyContainer;

  const container = new PIXI.Container();
  container.eventMode = "none";
  container.interactiveChildren = false;
  sprite.faceReplacementBodyContainer = container;

  const bodyIndex = sprite.bodySprite ? sprite.getChildIndex(sprite.bodySprite) : 0;
  sprite.addChildAt(container, Math.max(0, bodyIndex));
  return container;
}

function createBodySlice(sprite, rectangle) {
  if (rectangle.width <= 0 || rectangle.height <= 0) return null;

  const texture = new PIXI.Texture(
    sprite.baseTexture,
    new PIXI.Rectangle(
      sprite.bodyFrame.x + rectangle.x,
      sprite.bodyFrame.y + rectangle.y,
      rectangle.width,
      rectangle.height
    )
  );

  const part = new PIXI.Sprite(texture);
  part.position.set(rectangle.x, rectangle.y);
  part.eventMode = "none";
  return part;
}

function rebuildBodyReplacement(sprite) {
  if (!sprite.bodySprite || !sprite.baseTexture || !sprite.bodyFrame) return;

  const frame = getActiveHeadFrame(sprite);
  const container = ensureBodyReplacementContainer(sprite);
  destroyBodySlices(container);

  // "No Expression" keeps the original body intact because there is no
  // replacement head sprite to fill the cutout.
  if (!frame || sprite.headSprite?.visible === false) {
    container.visible = false;
    sprite.bodySprite.visible = true;
    return;
  }

  const cutout = getCutoutRectangle(sprite, frame);
  if (!cutout) {
    container.visible = false;
    sprite.bodySprite.visible = true;
    return;
  }

  const bodyWidth = sprite.bodyFrame.width;
  const bodyHeight = sprite.bodyFrame.height;
  const slices = [
    // Everything above the replacement area.
    new PIXI.Rectangle(0, 0, bodyWidth, cutout.y),
    // Left and right strips beside the replacement area.
    new PIXI.Rectangle(0, cutout.y, cutout.x, cutout.height),
    new PIXI.Rectangle(
      cutout.x + cutout.width,
      cutout.y,
      bodyWidth - (cutout.x + cutout.width),
      cutout.height
    ),
    // Everything below the replacement area.
    new PIXI.Rectangle(
      0,
      cutout.y + cutout.height,
      bodyWidth,
      bodyHeight - (cutout.y + cutout.height)
    )
  ];

  for (const rectangle of slices) {
    const part = createBodySlice(sprite, rectangle);
    if (part) container.addChild(part);
  }

  container.visible = true;
  sprite.bodySprite.visible = false;
}

/**
 * Install face replacement rendering onto PortraitSprite.
 * @param {typeof import("./layer.js").PortraitSprite} PortraitSprite
 */
export function installFaceReplacement(PortraitSprite) {
  if (PortraitSprite.prototype.faceReplacementInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "faceReplacementInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalDraw = PortraitSprite.prototype.draw;
  const originalUpdate = PortraitSprite.prototype.update;
  const originalUpdateExpression = PortraitSprite.prototype.updateExpression;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSprite.prototype.rebuildFaceReplacement = function() {
    rebuildBodyReplacement(this);
  };

  PortraitSprite.prototype.draw = async function(...args) {
    const result = await originalDraw.apply(this, args);
    rebuildBodyReplacement(this);
    return result;
  };

  PortraitSprite.prototype.updateExpression = function(...args) {
    const result = originalUpdateExpression.apply(this, args);
    rebuildBodyReplacement(this);
    return result;
  };

  PortraitSprite.prototype.update = async function(...args) {
    const result = await originalUpdate.apply(this, args);
    rebuildBodyReplacement(this);
    return result;
  };

  PortraitSprite.prototype.destroy = function(options) {
    if (this.faceReplacementBodyContainer) {
      destroyBodySlices(this.faceReplacementBodyContainer);
      this.faceReplacementBodyContainer.destroy({ children: true });
      this.faceReplacementBodyContainer = null;
    }
    return originalDestroy.call(this, options);
  };
}
