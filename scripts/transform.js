import { updateSceneSprite } from "./scene-flags.js";

const MIN_SCALE = 0.01;
const MAX_SCALE = 5;
const ROTATION_STEP = 15;

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRotation(value) {
  const rotation = toFiniteNumber(value, 0) % 360;
  return rotation < -180 ? rotation + 360 : rotation >= 180 ? rotation - 360 : rotation;
}

function normalizeScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, toFiniteNumber(value, 1)));
}

function roundForDisplay(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Add persisted rotation and scale controls to portrait sprites and their HUD.
 * Existing scene data remains compatible because missing transform values use
 * the original 0-degree, 100%-scale defaults.
 */
export function installTransformSupport(PortraitSpritesLayer, PortraitSprite, PortraitSpriteHUD) {
  if (PortraitSprite.prototype.transformSupportInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "transformSupportInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalCreateSprite = PortraitSpritesLayer.prototype.createSprite;
  const originalUpdate = PortraitSprite.prototype.update;
  const originalContainsLayerPoint = PortraitSprite.prototype.containsLayerPoint;
  const originalPrepareContext = PortraitSpriteHUD.prototype._prepareContext;
  const originalOnRender = PortraitSpriteHUD.prototype._onRender;

  PortraitSprite.prototype.applyTransformState = function({ rotation, scaleX, scaleY } = {}) {
    this.spriteRotation = normalizeRotation(rotation ?? this.spriteRotation ?? 0);
    this.spriteScaleX = normalizeScale(scaleX ?? this.spriteScaleX ?? 1);
    this.spriteScaleY = normalizeScale(scaleY ?? this.spriteScaleY ?? 1);
    this.rotation = this.spriteRotation * (Math.PI / 180);
    this.scale.set(this.spriteScaleX, this.spriteScaleY);
  };

  PortraitSprite.prototype._saveTransform = async function() {
    await updateSceneSprite(this.id, sprite => ({
      ...sprite,
      rotation: this.spriteRotation,
      scaleX: this.spriteScaleX,
      scaleY: this.spriteScaleY
    }));
  };

  PortraitSprite.prototype.setRotationDegrees = async function(rotation) {
    this.applyTransformState({ rotation });
    await this._saveTransform();
  };

  PortraitSprite.prototype.rotateBy = async function(delta) {
    await this.setRotationDegrees((this.spriteRotation ?? 0) + delta);
  };

  PortraitSprite.prototype.setScalePercent = async function(axis, percent) {
    const scale = normalizeScale(toFiniteNumber(percent, 100) / 100);
    const updates = axis === "x" ? { scaleX: scale } : { scaleY: scale };
    this.applyTransformState(updates);
    await this._saveTransform();
  };

  PortraitSprite.prototype.resetSize = async function() {
    this.applyTransformState({ scaleX: 1, scaleY: 1 });
    await this._saveTransform();
  };

  PortraitSpritesLayer.prototype.createSprite = async function(data) {
    const sprite = await originalCreateSprite.call(this, data);
    sprite.applyTransformState({
      rotation: data.rotation,
      scaleX: data.scaleX,
      scaleY: data.scaleY
    });
    return sprite;
  };

  PortraitSprite.prototype.update = async function(updates) {
    await originalUpdate.call(this, updates);
    if (updates.rotation === undefined && updates.scaleX === undefined && updates.scaleY === undefined) return;
    this.applyTransformState({
      rotation: updates.rotation,
      scaleX: updates.scaleX,
      scaleY: updates.scaleY
    });
  };

  PortraitSprite.prototype.containsLayerPoint = function(position) {
    if (!this.hitArea || !this.parent) return originalContainsLayerPoint.call(this, position);
    const local = this.toLocal(new PIXI.Point(position.x, position.y), this.parent);
    return this.hitArea.contains(local.x, local.y);
  };

  PortraitSpriteHUD.prototype._prepareContext = async function(options) {
    const context = await originalPrepareContext.call(this, options);
    return {
      ...context,
      rotationDegrees: roundForDisplay(this.sprite.spriteRotation ?? 0),
      scaleXPercent: roundForDisplay((this.sprite.spriteScaleX ?? 1) * 100),
      scaleYPercent: roundForDisplay((this.sprite.spriteScaleY ?? 1) * 100)
    };
  };

  PortraitSpriteHUD.prototype._onRender = function(context, options) {
    originalOnRender.call(this, context, options);

    this.element.querySelector(".rotate-left")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.sprite.rotateBy(-ROTATION_STEP);
      this.render();
    });

    this.element.querySelector(".rotate-right")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.sprite.rotateBy(ROTATION_STEP);
      this.render();
    });

    this.element.querySelector(".rotation-input")?.addEventListener("change", async event => {
      await this.sprite.setRotationDegrees(event.currentTarget.value);
      this.render();
    });

    this.element.querySelector(".scale-x-input")?.addEventListener("change", async event => {
      await this.sprite.setScalePercent("x", event.currentTarget.value);
      this.render();
    });

    this.element.querySelector(".scale-y-input")?.addEventListener("change", async event => {
      await this.sprite.setScalePercent("y", event.currentTarget.value);
      this.render();
    });

    this.element.querySelector(".reset-size")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.sprite.resetSize();
      this.render();
    });
  };
}
