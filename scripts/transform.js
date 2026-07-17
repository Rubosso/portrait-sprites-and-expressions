import { updateSceneSprite } from "./scene-flags.js";

const MIN_SCALE = 0.01;
const MAX_SCALE = 5;
const ROTATION_STEP = 15;
const HANDLE_SIZE = 12;
const HANDLE_HIT_SIZE = 24;
const ROTATION_HANDLE_OFFSET = 36;
const MARQUEE_THRESHOLD = 4;

const RESIZE_HANDLES = {
  nw: { x: 0, y: 0, cursor: "nwse-resize", proportional: true, fixedX: 1, fixedY: 1 },
  n: { x: 0.5, y: 0, cursor: "ns-resize", axis: "y", fixedX: 0.5, fixedY: 1 },
  ne: { x: 1, y: 0, cursor: "nesw-resize", proportional: true, fixedX: 0, fixedY: 1 },
  e: { x: 1, y: 0.5, cursor: "ew-resize", axis: "x", fixedX: 0, fixedY: 0.5 },
  se: { x: 1, y: 1, cursor: "nwse-resize", proportional: true, fixedX: 0, fixedY: 0 },
  s: { x: 0.5, y: 1, cursor: "ns-resize", axis: "y", fixedX: 0.5, fixedY: 0 },
  sw: { x: 0, y: 1, cursor: "nesw-resize", proportional: true, fixedX: 1, fixedY: 0 },
  w: { x: 0, y: 0.5, cursor: "ew-resize", axis: "x", fixedX: 1, fixedY: 0.5 }
};

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

function isAdditiveSelection(event) {
  return Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
}

function getLocalPointerPosition(event, target) {
  if (typeof event?.getLocalPosition === "function") return event.getLocalPosition(target);
  return event?.data?.getLocalPosition?.(target) ?? new PIXI.Point();
}

function cloneRectangle(rectangle) {
  if (!rectangle) return null;
  return new PIXI.Rectangle(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
}

function rectangleFromFractions(bounds, xFraction, yFraction) {
  return new PIXI.Point(
    bounds.x + bounds.width * xFraction,
    bounds.y + bounds.height * yFraction
  );
}

function rotateVector(x, y, rotationRadians) {
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  return new PIXI.Point(
    cosine * x - sine * y,
    sine * x + cosine * y
  );
}

function inverseRotateVector(x, y, rotationRadians) {
  return rotateVector(x, y, -rotationRadians);
}

function localPointToLayer(sprite, point, {
  positionX = sprite.position.x,
  positionY = sprite.position.y,
  rotation = sprite.rotation,
  scaleX = sprite.spriteScaleX ?? sprite.scale.x ?? 1,
  scaleY = sprite.spriteScaleY ?? sprite.scale.y ?? 1
} = {}) {
  const rotated = rotateVector(point.x * scaleX, point.y * scaleY, rotation);
  return new PIXI.Point(positionX + rotated.x, positionY + rotated.y);
}

function getContentBounds(sprite) {
  return sprite.transformContentBounds ?? sprite.hitArea;
}

function getSpriteLayerBounds(sprite) {
  const bounds = getContentBounds(sprite);
  if (!bounds) return null;

  const corners = [
    new PIXI.Point(bounds.x, bounds.y),
    new PIXI.Point(bounds.x + bounds.width, bounds.y),
    new PIXI.Point(bounds.x + bounds.width, bounds.y + bounds.height),
    new PIXI.Point(bounds.x, bounds.y + bounds.height)
  ].map(point => localPointToLayer(sprite, point));

  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return new PIXI.Rectangle(left, top, right - left, bottom - top);
}

function rectanglesIntersect(first, second) {
  return first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y;
}

function normalizeMarqueeRectangle(start, current) {
  return new PIXI.Rectangle(
    Math.min(start.x, current.x),
    Math.min(start.y, current.y),
    Math.abs(current.x - start.x),
    Math.abs(current.y - start.y)
  );
}

function getTransformingSprite(layer) {
  return Array.from(layer.sprites?.values?.() ?? []).find(sprite => sprite.transformDragState);
}

function createResizeHandle(sprite, name, configuration) {
  const handle = new PIXI.Graphics();
  handle.beginFill(0xffffff, 1);
  handle.lineStyle(2, 0xffc107, 1);
  handle.drawRect(-HANDLE_SIZE / 2, -HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  handle.endFill();
  handle.hitArea = new PIXI.Rectangle(
    -HANDLE_HIT_SIZE / 2,
    -HANDLE_HIT_SIZE / 2,
    HANDLE_HIT_SIZE,
    HANDLE_HIT_SIZE
  );
  handle.eventMode = "static";
  handle.interactive = true;
  handle.cursor = configuration.cursor;
  handle.on("pointerdown", event => sprite.startMouseTransform("resize", event, name));
  return handle;
}

/**
 * Add persisted rotation and scale controls, direct manipulation handles,
 * multi-selection, marquee selection, and grouped dragging.
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
  const originalDestroy = PortraitSprite.prototype.destroy;
  const originalPrepareContext = PortraitSpriteHUD.prototype._prepareContext;
  const originalOnRender = PortraitSpriteHUD.prototype._onRender;

  PortraitSpritesLayer.prototype.installTransformInteractionHandlers = function() {
    if (this.transformInteractionHandlersInstalled) return;
    this.transformInteractionHandlersInstalled = true;

    this.on("pointerdown", event => {
      if (!this.interactionActive || getPointerButton(event) !== 0) return;
      if (getTransformingSprite(this) || this.groupDragState) return;

      const point = getLocalPointerPosition(event, this);
      const hitSprite = Array.from(this.sprites.values())
        .reverse()
        .find(sprite => sprite.containsLayerPoint(point));
      if (hitSprite) return;

      this.startMarqueeSelection(point, isAdditiveSelection(event));
    });

    this.on("pointermove", event => {
      const transformingSprite = getTransformingSprite(this);
      if (transformingSprite) {
        transformingSprite.updateMouseTransform(event);
        return;
      }

      if (this.marqueeSelectionState) {
        this.updateMarqueeSelection(getLocalPointerPosition(event, this));
      }
    });

    const finishInteraction = async event => {
      const transformingSprite = getTransformingSprite(this);
      if (transformingSprite) {
        event?.stopPropagation?.();
        await transformingSprite.finishMouseTransform();
        return;
      }

      if (this.marqueeSelectionState) {
        this.finishMarqueeSelection(getLocalPointerPosition(event, this));
      }
    };

    this.on("pointerup", finishInteraction);
    this.on("pointerupoutside", finishInteraction);
  };

  PortraitSpritesLayer.prototype.getSelectedSprites = function() {
    return Array.from(this.sprites.values()).filter(sprite => sprite.selected);
  };

  PortraitSpritesLayer.prototype.selectSprite = function(selectedSprite, { additive = false, toggle = false } = {}) {
    if (!additive && !toggle) {
      for (const sprite of this.sprites.values()) {
        sprite.setSelected(sprite === selectedSprite);
      }
      return;
    }

    if (toggle) {
      selectedSprite.setSelected(!selectedSprite.selected);
      return;
    }

    selectedSprite.setSelected(true);
  };

  PortraitSpritesLayer.prototype.clearSpriteSelection = function() {
    for (const sprite of this.sprites.values()) sprite.setSelected(false);
  };

  PortraitSpritesLayer.prototype.ensureSelectionMarquee = function() {
    if (!this.selectionMarquee) {
      this.selectionMarquee = new PIXI.Graphics();
      this.selectionMarquee.eventMode = "none";
      this.selectionMarquee.visible = false;
      this.addChild(this.selectionMarquee);
    } else {
      this.addChild(this.selectionMarquee);
    }
    return this.selectionMarquee;
  };

  PortraitSpritesLayer.prototype.drawSelectionMarquee = function(rectangle) {
    const graphic = this.ensureSelectionMarquee();
    graphic.clear();
    graphic.beginFill(0x4aa3ff, 0.12);
    graphic.lineStyle(1.5, 0x4aa3ff, 0.95);
    graphic.drawRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    graphic.endFill();
    graphic.visible = true;
  };

  PortraitSpritesLayer.prototype.startMarqueeSelection = function(point, additive = false) {
    this.marqueeSelectionState = {
      start: new PIXI.Point(point.x, point.y),
      current: new PIXI.Point(point.x, point.y),
      additive,
      moved: false
    };
    this.drawSelectionMarquee(new PIXI.Rectangle(point.x, point.y, 0, 0));
  };

  PortraitSpritesLayer.prototype.updateMarqueeSelection = function(point) {
    const state = this.marqueeSelectionState;
    if (!state) return;

    state.current.set(point.x, point.y);
    const rectangle = normalizeMarqueeRectangle(state.start, state.current);
    state.moved = rectangle.width >= MARQUEE_THRESHOLD || rectangle.height >= MARQUEE_THRESHOLD;
    this.drawSelectionMarquee(rectangle);
  };

  PortraitSpritesLayer.prototype.finishMarqueeSelection = function(point) {
    const state = this.marqueeSelectionState;
    if (!state) return;

    state.current.set(point.x, point.y);
    const rectangle = normalizeMarqueeRectangle(state.start, state.current);
    this.marqueeSelectionState = null;

    if (this.selectionMarquee) {
      this.selectionMarquee.clear();
      this.selectionMarquee.visible = false;
    }

    if (!state.moved) {
      if (!state.additive) this.clearSpriteSelection();
      return;
    }

    if (!state.additive) this.clearSpriteSelection();
    for (const sprite of this.sprites.values()) {
      const spriteBounds = getSpriteLayerBounds(sprite);
      if (spriteBounds && rectanglesIntersect(rectangle, spriteBounds)) {
        sprite.setSelected(true);
      }
    }
  };

  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    this.installTransformInteractionHandlers();
    const result = originalSetInteractionActive.call(this, active);
    if (!active) {
      this.groupDragState = null;
      this.marqueeSelectionState = null;
      if (this.selectionMarquee) this.selectionMarquee.visible = false;
      this.clearSpriteSelection();
    }
    return result;
  };

  PortraitSprite.prototype.applyTransformState = function({ rotation, scaleX, scaleY } = {}) {
    this.spriteRotation = normalizeRotation(rotation ?? this.spriteRotation ?? 0);
    this.spriteScaleX = normalizeScale(scaleX ?? this.spriteScaleX ?? 1);
    this.spriteScaleY = normalizeScale(scaleY ?? this.spriteScaleY ?? 1);
    this.rotation = this.spriteRotation * (Math.PI / 180);
    this.scale.set(this.spriteScaleX, this.spriteScaleY);
    this.refreshTransformEventHitArea();
    this.updateTransformHandles();
  };

  PortraitSprite.prototype.getTransformCenterLocal = function() {
    const bounds = getContentBounds(this);
    if (!bounds) return new PIXI.Point();
    return new PIXI.Point(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
  };

  PortraitSprite.prototype.applyTransformAroundCenter = function(updates) {
    const centerLocal = this.getTransformCenterLocal();
    const centerLayer = localPointToLayer(this, centerLocal);
    this.applyTransformState(updates);
    const centerOffset = rotateVector(
      centerLocal.x * this.spriteScaleX,
      centerLocal.y * this.spriteScaleY,
      this.rotation
    );
    this.position.set(centerLayer.x - centerOffset.x, centerLayer.y - centerOffset.y);
  };

  PortraitSprite.prototype._saveTransform = async function() {
    await updateSceneSprite(this.id, sprite => ({
      ...sprite,
      rotation: this.spriteRotation,
      scaleX: this.spriteScaleX,
      scaleY: this.spriteScaleY,
      x: this.position.x,
      y: this.position.y
    }));
  };

  PortraitSprite.prototype.setRotationDegrees = async function(rotation) {
    this.applyTransformAroundCenter({ rotation });
    await this._saveTransform();
  };

  PortraitSprite.prototype.rotateBy = async function(delta) {
    await this.setRotationDegrees((this.spriteRotation ?? 0) + delta);
  };

  PortraitSprite.prototype.setScalePercent = async function(axis, percent) {
    const scale = normalizeScale(toFiniteNumber(percent, 100) / 100);
    const updates = axis === "x" ? { scaleX: scale } : { scaleY: scale };
    this.applyTransformAroundCenter(updates);
    await this._saveTransform();
  };

  PortraitSprite.prototype.resetSize = async function() {
    this.applyTransformAroundCenter({ rotation: 0, scaleX: 1, scaleY: 1 });
    await this._saveTransform();
  };

  PortraitSprite.prototype.prepareContentHitArea = function() {
    if (this.transformContentBounds) {
      this.hitArea = cloneRectangle(this.transformContentBounds);
    }
  };

  PortraitSprite.prototype.captureContentHitArea = function() {
    if (!this.hitArea) return;
    if (this.transformContentBounds && this.hitArea === this.transformEventHitArea) {
      this.refreshTransformEventHitArea();
      this.updateTransformHandles();
      return;
    }

    this.transformContentBounds = cloneRectangle(this.hitArea);
    this.refreshTransformEventHitArea();
    this.updateTransformHandles();
  };

  PortraitSprite.prototype.refreshTransformEventHitArea = function() {
    const bounds = this.transformContentBounds;
    if (!bounds) return;

    const inverseScaleX = 1 / Math.max(MIN_SCALE, Math.abs(this.spriteScaleX ?? 1));
    const inverseScaleY = 1 / Math.max(MIN_SCALE, Math.abs(this.spriteScaleY ?? 1));
    const horizontalPadding = HANDLE_HIT_SIZE * inverseScaleX;
    const bottomPadding = HANDLE_HIT_SIZE * inverseScaleY;
    const topPadding = (ROTATION_HANDLE_OFFSET + HANDLE_HIT_SIZE) * inverseScaleY;

    this.transformEventHitArea = new PIXI.Rectangle(
      bounds.x - horizontalPadding,
      bounds.y - topPadding,
      bounds.width + horizontalPadding * 2,
      bounds.height + topPadding + bottomPadding
    );
    this.hitArea = this.transformEventHitArea;
  };

  PortraitSprite.prototype.ensureTransformHandles = function() {
    if (this.transformHandles) return;

    this.transformHandles = new PIXI.Container();
    this.transformHandles.eventMode = "static";
    this.transformHandles.interactive = true;
    this.transformHandles.interactiveChildren = true;
    this.addChild(this.transformHandles);

    this.rotationConnector = new PIXI.Graphics();
    this.rotationConnector.eventMode = "none";
    this.transformHandles.addChild(this.rotationConnector);

    this.resizeHandles = new Map();
    for (const [name, configuration] of Object.entries(RESIZE_HANDLES)) {
      const handle = createResizeHandle(this, name, configuration);
      this.resizeHandles.set(name, handle);
      this.transformHandles.addChild(handle);
    }

    this.rotationHandle = new PIXI.Graphics();
    this.rotationHandle.beginFill(0xffffff, 1);
    this.rotationHandle.lineStyle(2, 0xffc107, 1);
    this.rotationHandle.drawCircle(0, 0, HANDLE_SIZE / 2);
    this.rotationHandle.endFill();
    this.rotationHandle.hitArea = new PIXI.Rectangle(
      -HANDLE_HIT_SIZE / 2,
      -HANDLE_HIT_SIZE / 2,
      HANDLE_HIT_SIZE,
      HANDLE_HIT_SIZE
    );
    this.rotationHandle.eventMode = "static";
    this.rotationHandle.interactive = true;
    this.rotationHandle.cursor = "grab";
    this.rotationHandle.on("pointerdown", event => this.startMouseTransform("rotate", event));
    this.transformHandles.addChild(this.rotationHandle);

    this.updateTransformHandles();
  };

  PortraitSprite.prototype.updateTransformHandles = function() {
    if (!this.transformHandles || !this.transformContentBounds) return;

    const bounds = this.transformContentBounds;
    const inverseScaleX = 1 / Math.max(MIN_SCALE, Math.abs(this.spriteScaleX ?? 1));
    const inverseScaleY = 1 / Math.max(MIN_SCALE, Math.abs(this.spriteScaleY ?? 1));

    for (const [name, handle] of this.resizeHandles) {
      const configuration = RESIZE_HANDLES[name];
      const point = rectangleFromFractions(bounds, configuration.x, configuration.y);
      handle.position.set(point.x, point.y);
      handle.scale.set(inverseScaleX, inverseScaleY);
    }

    const topCenter = rectangleFromFractions(bounds, 0.5, 0);
    this.rotationConnector.clear();
    this.rotationConnector.lineStyle(2, 0xffc107, 1);
    this.rotationConnector.moveTo(0, 0);
    this.rotationConnector.lineTo(0, -ROTATION_HANDLE_OFFSET);
    this.rotationConnector.position.set(topCenter.x, topCenter.y);
    this.rotationConnector.scale.set(inverseScaleX, inverseScaleY);

    this.rotationHandle.position.set(
      topCenter.x,
      topCenter.y - ROTATION_HANDLE_OFFSET * inverseScaleY
    );
    this.rotationHandle.scale.set(inverseScaleX, inverseScaleY);

    this.transformHandles.visible = Boolean(this.selected);
  };

  PortraitSprite.prototype.startMouseTransform = function(type, event, handleName = null) {
    if (getPointerButton(event) !== 0 || !this.parent) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    this.parent.selectSprite?.(this, { additive: true });

    const point = getLocalPointerPosition(event, this.parent);
    const bounds = getContentBounds(this);
    if (!bounds) return;

    const centerLocal = this.getTransformCenterLocal();
    const centerLayer = localPointToLayer(this, centerLocal);
    const state = {
      type,
      handleName,
      startRotation: this.spriteRotation ?? 0,
      startScaleX: this.spriteScaleX ?? 1,
      startScaleY: this.spriteScaleY ?? 1,
      centerLocal,
      centerLayer,
      startAngle: Math.atan2(point.y - centerLayer.y, point.x - centerLayer.x)
    };

    if (type === "resize") {
      const configuration = RESIZE_HANDLES[handleName];
      if (!configuration) return;

      state.configuration = configuration;
      state.draggedLocal = rectangleFromFractions(bounds, configuration.x, configuration.y);
      state.fixedLocal = rectangleFromFractions(bounds, configuration.fixedX, configuration.fixedY);
      state.fixedLayer = localPointToLayer(this, state.fixedLocal);
      const draggedLayer = localPointToLayer(this, state.draggedLocal);
      state.pointerOffset = new PIXI.Point(
        point.x - draggedLayer.x,
        point.y - draggedLayer.y
      );
      state.localDelta = new PIXI.Point(
        state.draggedLocal.x - state.fixedLocal.x,
        state.draggedLocal.y - state.fixedLocal.y
      );
      state.startScaledDelta = new PIXI.Point(
        state.localDelta.x * state.startScaleX,
        state.localDelta.y * state.startScaleY
      );
    }

    this.transformDragState = state;
  };

  PortraitSprite.prototype.updateMouseTransform = function(event) {
    const state = this.transformDragState;
    if (!state || !this.parent) return;

    const point = getLocalPointerPosition(event, this.parent);
    if (state.type === "rotate") {
      let delta = (Math.atan2(
        point.y - state.centerLayer.y,
        point.x - state.centerLayer.x
      ) - state.startAngle) * (180 / Math.PI);
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      let rotation = state.startRotation + delta;
      if (event.shiftKey) rotation = Math.round(rotation / ROTATION_STEP) * ROTATION_STEP;
      this.applyTransformState({ rotation });

      const centerOffset = rotateVector(
        state.centerLocal.x * this.spriteScaleX,
        state.centerLocal.y * this.spriteScaleY,
        this.rotation
      );
      this.position.set(
        state.centerLayer.x - centerOffset.x,
        state.centerLayer.y - centerOffset.y
      );
      return;
    }

    const adjustedPoint = new PIXI.Point(
      point.x - (state.pointerOffset?.x ?? 0),
      point.y - (state.pointerOffset?.y ?? 0)
    );
    const pointerVector = inverseRotateVector(
      adjustedPoint.x - state.fixedLayer.x,
      adjustedPoint.y - state.fixedLayer.y,
      state.startRotation * (Math.PI / 180)
    );

    let scaleX = state.startScaleX;
    let scaleY = state.startScaleY;
    if (state.configuration.proportional) {
      const base = state.startScaledDelta;
      const denominator = base.x * base.x + base.y * base.y;
      let factor = denominator > 0
        ? (pointerVector.x * base.x + pointerVector.y * base.y) / denominator
        : 1;
      const minimumFactor = Math.max(
        MIN_SCALE / state.startScaleX,
        MIN_SCALE / state.startScaleY
      );
      const maximumFactor = Math.min(
        MAX_SCALE / state.startScaleX,
        MAX_SCALE / state.startScaleY
      );
      factor = Math.min(maximumFactor, Math.max(minimumFactor, factor));
      scaleX = state.startScaleX * factor;
      scaleY = state.startScaleY * factor;
    } else if (state.configuration.axis === "x" && state.localDelta.x) {
      scaleX = normalizeScale(pointerVector.x / state.localDelta.x);
    } else if (state.configuration.axis === "y" && state.localDelta.y) {
      scaleY = normalizeScale(pointerVector.y / state.localDelta.y);
    }

    this.applyTransformState({ scaleX, scaleY });
    const fixedOffset = rotateVector(
      state.fixedLocal.x * this.spriteScaleX,
      state.fixedLocal.y * this.spriteScaleY,
      this.rotation
    );
    this.position.set(
      state.fixedLayer.x - fixedOffset.x,
      state.fixedLayer.y - fixedOffset.y
    );
  };

  PortraitSprite.prototype.finishMouseTransform = async function() {
    if (!this.transformDragState) return;
    this.transformDragState = null;
    await this._saveTransform();
  };

  PortraitSprite.prototype.draw = async function(...args) {
    await originalDraw.apply(this, args);
    this.captureContentHitArea();
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
    this.prepareContentHitArea();
    await originalUpdate.call(this, updates);
    this.captureContentHitArea();

    if (updates.rotation !== undefined || updates.scaleX !== undefined || updates.scaleY !== undefined) {
      this.applyTransformState({
        rotation: updates.rotation,
        scaleX: updates.scaleX,
        scaleY: updates.scaleY
      });
    }
  };

  PortraitSprite.prototype.updateExpression = function(...args) {
    this.prepareContentHitArea();
    const result = originalUpdateExpression.apply(this, args);
    this.captureContentHitArea();
    return result;
  };

  PortraitSprite.prototype.containsLayerPoint = function(position) {
    const bounds = getContentBounds(this);
    if (!bounds || !this.parent) return originalContainsLayerPoint.call(this, position);
    const local = this.toLocal(new PIXI.Point(position.x, position.y), this.parent);
    return bounds.contains(local.x, local.y);
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
    if (getPointerButton(event) !== 0 || !this.parent) return;
    event.stopPropagation?.();

    const additive = isAdditiveSelection(event);
    if (!this.selected) {
      this.parent.selectSprite?.(this, { additive });
    } else if (!additive) {
      // Keep the existing group selected when dragging any selected member.
      this.setSelected(true);
    }

    const selectedSprites = this.parent.getSelectedSprites?.() ?? [this];
    const point = getLocalPointerPosition(event, this.parent);
    this.parent.groupDragState = {
      primary: this,
      startPoint: new PIXI.Point(point.x, point.y),
      positions: new Map(selectedSprites.map(sprite => [
        sprite,
        new PIXI.Point(sprite.position.x, sprite.position.y)
      ]))
    };
    this.isDragging = true;
  };

  PortraitSprite.prototype.dragMove = function(event) {
    const state = this.parent?.groupDragState;
    if (!this.isDragging || !state || state.primary !== this) return;

    const point = getLocalPointerPosition(event, this.parent);
    const deltaX = point.x - state.startPoint.x;
    const deltaY = point.y - state.startPoint.y;
    for (const [sprite, startPosition] of state.positions) {
      sprite.position.set(startPosition.x + deltaX, startPosition.y + deltaY);
    }
  };

  PortraitSprite.prototype.dragEnd = async function() {
    const state = this.parent?.groupDragState;
    if (!this.isDragging || !state || state.primary !== this) return;

    this.isDragging = false;
    this.parent.groupDragState = null;
    for (const sprite of state.positions.keys()) {
      await sprite._savePosition();
    }
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
    if (this.parent?.groupDragState?.positions?.has(this)) {
      this.parent.groupDragState = null;
    }
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
