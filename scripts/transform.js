import { updateSceneSprite } from "./scene-flags.js";

const MIN_SCALE = 0.01;
const MAX_SCALE = 5;
const ROTATION_STEP = 15;
const HANDLE_SIZE = 14;
const ROTATION_HANDLE_OFFSET = 36;

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

function getPointerButton(event) {
  return event?.button ?? event?.data?.button ?? 0;
}

function getLocalPointerPosition(event, target) {
  if (typeof event?.getLocalPosition === "function") return event.getLocalPosition(target);
  return event?.data?.getLocalPosition?.(target) ?? new PIXI.Point();
}

function getTransformingSprite(layer) {
  return Array.from(layer.sprites?.values?.() ?? []).find(sprite => sprite.transformDragState);
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
  const originalSetInteractionActive = PortraitSpritesLayer.prototype.setInteractionActive;
  const originalDraw = PortraitSprite.prototype.draw;
  const originalUpdate = PortraitSprite.prototype.update;
  const originalUpdateExpression = PortraitSprite.prototype.updateExpression;
  const originalContainsLayerPoint = PortraitSprite.prototype.containsLayerPoint;
  const originalSetSelected = PortraitSprite.prototype.setSelected;
  const originalStartDrag = PortraitSprite.prototype.startDrag;
  const originalDestroy = PortraitSprite.prototype.destroy;
  const originalPrepareContext = PortraitSpriteHUD.prototype._prepareContext;
  const originalOnRender = PortraitSpriteHUD.prototype._onRender;

  PortraitSpritesLayer.prototype.installTransformInteractionHandlers = function() {
    if (this.transformInteractionHandlersInstalled) return;
    this.transformInteractionHandlersInstalled = true;

    this.on("pointerdown", event => {
      if (!this.interactionActive || getPointerButton(event) !== 0) return;
      const point = getLocalPointerPosition(event, this);
      const hitSprite = Array.from(this.sprites.values()).reverse().find(sprite => sprite.containsLayerPoint(point));
      if (!hitSprite) this.clearSpriteSelection();
    });

    this.on("pointermove", event => {
      getTransformingSprite(this)?.updateMouseTransform(event);
    });

    const finishTransform = async event => {
      const sprite = getTransformingSprite(this);
      if (!sprite) return;
      event?.stopPropagation?.();
      await sprite.finishMouseTransform();
    };

    this.on("pointerup", finishTransform);
    this.on("pointerupoutside", finishTransform);
  };

  PortraitSpritesLayer.prototype.selectSprite = function(selectedSprite) {
    for (const sprite of this.sprites.values()) {
      sprite.setSelected(sprite === selectedSprite);
    }
  };

  PortraitSpritesLayer.prototype.clearSpriteSelection = function() {
    for (const sprite of this.sprites.values()) sprite.setSelected(false);
  };

  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    this.installTransformInteractionHandlers();
    const result = originalSetInteractionActive.call(this, active);
    if (!active) this.clearSpriteSelection();
    return result;
  };

  PortraitSprite.prototype.applyTransformState = function({ rotation, scaleX, scaleY } = {}) {
    this.spriteRotation = normalizeRotation(rotation ?? this.spriteRotation ?? 0);
    this.spriteScaleX = normalizeScale(scaleX ?? this.spriteScaleX ?? 1);
    this.spriteScaleY = normalizeScale(scaleY ?? this.spriteScaleY ?? 1);
    this.rotation = this.spriteRotation * (Math.PI / 180);
    this.scale.set(this.spriteScaleX, this.spriteScaleY);
    this.updateTransformHandles();
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
    this.applyTransformState({ rotation: 0, scaleX: 1, scaleY: 1 });
    await this._saveTransform();
  };

  PortraitSprite.prototype.ensureTransformHandles = function() {
    if (this.transformHandles) return;

    this.transformHandles = new PIXI.Container();
    this.transformHandles.eventMode = "static";
    this.transformHandles.interactiveChildren = true;
    this.addChild(this.transformHandles);

    this.rotationConnector = new PIXI.Graphics();
    this.rotationConnector.eventMode = "none";
    this.transformHandles.addChild(this.rotationConnector);

    this.resizeHandle = new PIXI.Graphics();
    this.resizeHandle.beginFill(0xffffff, 1);
    this.resizeHandle.lineStyle(2, 0xffc107, 1);
    this.resizeHandle.drawRect(-HANDLE_SIZE / 2, -HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    this.resizeHandle.endFill();
    this.resizeHandle.eventMode = "static";
    this.resizeHandle.cursor = "nwse-resize";
    this.resizeHandle.on("pointerdown", event => this.startMouseTransform("resize", event));
    this.transformHandles.addChild(this.resizeHandle);

    this.rotationHandle = new PIXI.Graphics();
    this.rotationHandle.beginFill(0xffffff, 1);
    this.rotationHandle.lineStyle(2, 0xffc107, 1);
    this.rotationHandle.drawCircle(0, 0, HANDLE_SIZE / 2);
    this.rotationHandle.endFill();
    this.rotationHandle.eventMode = "static";
    this.rotationHandle.cursor = "grab";
    this.rotationHandle.on("pointerdown", event => this.startMouseTransform("rotate", event));
    this.transformHandles.addChild(this.rotationHandle);

    this.updateTransformHandles();
  };

  PortraitSprite.prototype.updateTransformHandles = function() {
    if (!this.transformHandles || !this.hitArea) return;

    const left = this.hitArea.x;
    const top = this.hitArea.y;
    const right = left + this.hitArea.width;
    const bottom = top + this.hitArea.height;
    const centerX = left + this.hitArea.width / 2;
    const inverseScaleX = 1 / Math.max(MIN_SCALE, Math.abs(this.spriteScaleX ?? 1));
    const inverseScaleY = 1 / Math.max(MIN_SCALE, Math.abs(this.spriteScaleY ?? 1));

    this.resizeHandle.position.set(right, bottom);
    this.resizeHandle.scale.set(inverseScaleX, inverseScaleY);

    this.rotationConnector.clear();
    this.rotationConnector.lineStyle(2, 0xffc107, 1);
    this.rotationConnector.moveTo(0, 0);
    this.rotationConnector.lineTo(0, -ROTATION_HANDLE_OFFSET);
    this.rotationConnector.position.set(centerX, top);
    this.rotationConnector.scale.set(inverseScaleX, inverseScaleY);

    this.rotationHandle.position.set(centerX, top);
    this.rotationHandle.scale.set(inverseScaleX, inverseScaleY);
    this.rotationHandle.pivot.set(0, ROTATION_HANDLE_OFFSET);

    this.transformHandles.visible = Boolean(this.selected);
  };

  PortraitSprite.prototype.startMouseTransform = function(type, event) {
    if (getPointerButton(event) !== 0 || !this.parent) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    this.parent.selectSprite?.(this);

    const point = getLocalPointerPosition(event, this.parent);
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    this.transformDragState = {
      type,
      startRotation: this.spriteRotation ?? 0,
      startScaleX: this.spriteScaleX ?? 1,
      startScaleY: this.spriteScaleY ?? 1,
      startAngle: Math.atan2(dy, dx),
      startDistance: Math.max(1, Math.hypot(dx, dy))
    };
  };

  PortraitSprite.prototype.updateMouseTransform = function(event) {
    const state = this.transformDragState;
    if (!state || !this.parent) return;

    const point = getLocalPointerPosition(event, this.parent);
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;

    if (state.type === "resize") {
      const factor = Math.max(MIN_SCALE, Math.hypot(dx, dy) / state.startDistance);
      this.applyTransformState({
        scaleX: state.startScaleX * factor,
        scaleY: state.startScaleY * factor
      });
      return;
    }

    let delta = (Math.atan2(dy, dx) - state.startAngle) * (180 / Math.PI);
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    let rotation = state.startRotation + delta;
    if (event.shiftKey) rotation = Math.round(rotation / ROTATION_STEP) * ROTATION_STEP;
    this.applyTransformState({ rotation });
  };

  PortraitSprite.prototype.finishMouseTransform = async function() {
    if (!this.transformDragState) return;
    this.transformDragState = null;
    await this._saveTransform();
  };

  PortraitSprite.prototype.draw = async function(...args) {
    await originalDraw.apply(this, args);
    this.ensureTransformHandles();
  };

  PortraitSpritesLayer.prototype.createSprite = async function(data) {
    this.installTransformInteractionHandlers();
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
    if (updates.rotation !== undefined || updates.scaleX !== undefined || updates.scaleY !== undefined) {
      this.applyTransformState({
        rotation: updates.rotation,
        scaleX: updates.scaleX,
        scaleY: updates.scaleY
      });
    }
    this.updateTransformHandles();
  };

  PortraitSprite.prototype.updateExpression = function(...args) {
    const result = originalUpdateExpression.apply(this, args);
    this.updateTransformHandles();
    return result;
  };

  PortraitSprite.prototype.containsLayerPoint = function(position) {
    if (!this.hitArea || !this.parent) return originalContainsLayerPoint.call(this, position);
    const local = this.toLocal(new PIXI.Point(position.x, position.y), this.parent);
    return this.hitArea.contains(local.x, local.y);
  };

  PortraitSprite.prototype.setSelected = function(selected) {
    originalSetSelected.call(this, selected);
    this.updateTransformHandles();
    if (!selected) {
      this.transformDragState = null;
      this.transformHud?.close?.();
      this.transformHud = null;
    }
  };

  PortraitSprite.prototype.startDrag = function(event) {
    this.parent?.selectSprite?.(this);
    originalStartDrag.call(this, event);
  };

  PortraitSprite.prototype.showHud = function() {
    this.parent?.selectSprite?.(this);
    if (this.transformHud) {
      this.transformHud.render(true);
      return;
    }

    const hud = new PortraitSpriteHUD(this);
    this.transformHud = hud;
    const originalClose = hud.close.bind(hud);
    hud.close = async (...args) => {
      const result = await originalClose(...args);
      if (this.transformHud === hud) this.transformHud = null;
      return result;
    };
    hud.render(true);
  };

  PortraitSprite.prototype.destroy = function(options) {
    this.transformHud?.close?.();
    this.transformHud = null;
    this.transformDragState = null;
    return originalDestroy.call(this, options);
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
