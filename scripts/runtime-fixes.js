import { NO_EXPRESSION } from "./no-expression.js";

const VIEWPORT_MARGIN = 64;
const PICKER_MIN_HEIGHT = 360;
const PICKER_DEFAULT_HEIGHT = 620;
const PICKER_MIN_CARD_WIDTH = 112;
const FACE_CROP_HEIGHT = 0.78;
const FACE_BOUNDS_PADDING = 0.04;
const ALPHA_THRESHOLD = 8;
const visibleFrameBoundsCache = new WeakMap();

function getContentElement(root) {
  return root?.querySelector?.('[data-application-part="content"]')
    ?? root?.querySelector?.(".window-content")
    ?? null;
}

function installWheelScrolling(element) {
  if (!element || element.dataset.portraitWheelScroll === "true") return;
  element.dataset.portraitWheelScroll = "true";
  element.addEventListener("wheel", event => {
    if (element.scrollHeight <= element.clientHeight + 1) return;
    const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
    const next = Math.max(0, Math.min(maximum, element.scrollTop + event.deltaY));
    if (next === element.scrollTop) return;
    element.scrollTop = next;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, passive: false });
}

function configureExpressionPicker(application) {
  const root = application.element;
  if (!root) return;

  const viewportHeight = Math.max(PICKER_MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN);
  const currentHeight = root.getBoundingClientRect().height || PICKER_DEFAULT_HEIGHT;
  const targetHeight = Math.min(Math.max(PICKER_MIN_HEIGHT, currentHeight), viewportHeight);
  if (Math.abs(currentHeight - targetHeight) > 1) {
    application.setPosition?.({ height: targetHeight });
  }

  const content = getContentElement(root);
  const picker = root.querySelector(".expression-picker-content");
  const grid = root.querySelector(".expression-choice-grid");
  if (!content || !picker || !grid) return;

  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    maxHeight: `${viewportHeight}px`,
    overflow: "hidden"
  });
  Object.assign(content.style, {
    display: "flex",
    flex: "1 1 0",
    flexDirection: "column",
    height: "auto",
    minHeight: "0",
    overflow: "hidden"
  });
  Object.assign(picker.style, {
    display: "grid",
    flex: "1 1 auto",
    gridTemplateRows: "auto minmax(0, 1fr)",
    height: "100%",
    minHeight: "0",
    overflow: "hidden"
  });
  Object.assign(grid.style, {
    alignContent: "start",
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${PICKER_MIN_CARD_WIDTH}px, 1fr))`,
    height: "100%",
    minHeight: "0",
    overflowX: "hidden",
    overflowY: "scroll",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable"
  });

  installWheelScrolling(grid);
  if (Number.isFinite(application._portraitPickerScrollTop)) {
    grid.scrollTop = application._portraitPickerScrollTop;
  }
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawNoExpressionPreview(canvasElement) {
  const context = canvasElement.getContext("2d");
  if (!context) return;

  const { width, height } = canvasElement;
  context.clearRect(0, 0, width, height);
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.78)";
  context.lineWidth = Math.max(3, width * 0.035);
  context.beginPath();
  context.arc(width / 2, height / 2, Math.min(width, height) * 0.25, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(width * 0.32, height * 0.68);
  context.lineTo(width * 0.68, height * 0.32);
  context.stroke();
  context.restore();
}

function getFallbackFaceBounds(frame) {
  return {
    x: Number(frame.x),
    y: Number(frame.y),
    width: Math.max(1, Number(frame.width)),
    height: Math.max(1, Number(frame.height) * FACE_CROP_HEIGHT)
  };
}

function getVisibleFaceBounds(image, frame) {
  if (!image || !frame) return null;

  let imageCache = visibleFrameBoundsCache.get(image);
  if (!imageCache) {
    imageCache = new Map();
    visibleFrameBoundsCache.set(image, imageCache);
  }

  const frameX = Math.round(Number(frame.x));
  const frameY = Math.round(Number(frame.y));
  const frameWidth = Math.max(1, Math.round(Number(frame.width)));
  const frameHeight = Math.max(1, Math.round(Number(frame.height)));
  const cacheKey = `${frameX}:${frameY}:${frameWidth}:${frameHeight}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const fallback = getFallbackFaceBounds(frame);
  const sample = document.createElement("canvas");
  sample.width = frameWidth;
  sample.height = frameHeight;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) {
    imageCache.set(cacheKey, fallback);
    return fallback;
  }

  context.clearRect(0, 0, frameWidth, frameHeight);
  context.drawImage(
    image,
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    0,
    0,
    frameWidth,
    frameHeight
  );

  let pixels;
  try {
    pixels = context.getImageData(0, 0, frameWidth, frameHeight).data;
  } catch (_error) {
    imageCache.set(cacheKey, fallback);
    return fallback;
  }

  let minY = frameHeight;
  let maxY = -1;
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      if (pixels[(y * frameWidth + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxY < minY) {
    imageCache.set(cacheKey, fallback);
    return fallback;
  }

  const visibleHeight = maxY - minY + 1;
  const faceMaxY = Math.min(maxY, minY + Math.max(1, Math.round(visibleHeight * FACE_CROP_HEIGHT)) - 1);
  let minX = frameWidth;
  let maxX = -1;

  // Measure horizontal bounds only through the face crop. This excludes wide
  // shoulders and, importantly, removes asymmetric transparent padding from
  // the sprite-sheet cell before centering the thumbnail.
  for (let y = minY; y <= faceMaxY; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      if (pixels[(y * frameWidth + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }

  if (maxX < minX) {
    imageCache.set(cacheKey, fallback);
    return fallback;
  }

  const measuredWidth = maxX - minX + 1;
  const measuredHeight = faceMaxY - minY + 1;
  const paddingX = Math.max(1, Math.round(measuredWidth * FACE_BOUNDS_PADDING));
  const paddingY = Math.max(1, Math.round(measuredHeight * FACE_BOUNDS_PADDING));
  minX = Math.max(0, minX - paddingX);
  maxX = Math.min(frameWidth - 1, maxX + paddingX);
  minY = Math.max(0, minY - paddingY);
  const paddedMaxY = Math.min(frameHeight - 1, faceMaxY + paddingY);

  const bounds = {
    x: frameX + minX,
    y: frameY + minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, paddedMaxY - minY + 1)
  };
  imageCache.set(cacheKey, bounds);
  return bounds;
}

function drawHeadPreview(canvasElement, image, frame) {
  const context = canvasElement.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (!image || !frame) return;

  const source = getVisibleFaceBounds(image, frame) ?? getFallbackFaceBounds(frame);
  const padding = 6;
  const scale = Math.min(
    (canvasElement.width - padding * 2) / Math.max(1, source.width),
    (canvasElement.height - padding * 2) / Math.max(1, source.height)
  );
  const width = source.width * scale;
  const height = source.height * scale;
  const x = (canvasElement.width - width) / 2;
  const y = (canvasElement.height - height) / 2;

  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    x,
    y,
    width,
    height
  );
}

function getExpressionRecords(application) {
  const sprite = application.sprite;
  const noExpressionLabel = game.i18n.localize("PORTRAIT_SPRITES.HUD.NoExpression");
  return [
    {
      index: NO_EXPRESSION,
      label: noExpressionLabel,
      frame: null,
      isNoExpression: true,
      isActive: sprite?.currentExpression === NO_EXPRESSION
    },
    ...(sprite?.headFrames ?? []).map((frame, index) => ({
      index,
      label: frame.name || game.i18n.format("PORTRAIT_SPRITES.HUD.ExpressionNumber", { index: index + 1 }),
      frame: {
        x: Number(frame.x),
        y: Number(frame.y),
        width: Number(frame.width),
        height: Number(frame.height)
      },
      isNoExpression: false,
      isActive: sprite.currentExpression === index
    }))
  ];
}

async function activateExpression(application, index) {
  const grid = application.element?.querySelector?.(".expression-choice-grid");
  application._portraitPickerScrollTop = grid?.scrollTop ?? 0;
  if (!Number.isInteger(index)) return;

  application.sprite.currentExpression = index;
  application.sprite.updateExpression();
  await application.sprite._saveToScene();
  application.render(false);
}

function createExpressionCard(application, record) {
  const card = document.createElement("div");
  card.className = `expression-choice${record.isActive ? " is-active" : ""}`;
  card.dataset.expressionIndex = String(record.index);
  card.setAttribute("role", "option");
  card.setAttribute("aria-selected", record.isActive ? "true" : "false");
  card.tabIndex = 0;
  Object.assign(card.style, {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    minWidth: "0",
    textAlign: "center",
    width: "100%"
  });

  const canvasElement = document.createElement("canvas");
  canvasElement.className = "expression-choice-preview";
  canvasElement.width = 128;
  canvasElement.height = 128;
  canvasElement.setAttribute("aria-hidden", "true");
  Object.assign(canvasElement.style, {
    alignSelf: "center",
    display: "block",
    flex: "0 0 auto",
    margin: "0 auto",
    maxWidth: "100%"
  });

  const label = document.createElement("span");
  label.className = "expression-choice-label";
  label.textContent = record.label;
  Object.assign(label.style, {
    alignSelf: "stretch",
    boxSizing: "border-box",
    display: "block",
    margin: "0",
    textAlign: "center",
    width: "100%"
  });

  card.append(canvasElement, label);
  card.addEventListener("click", event => {
    event.preventDefault();
    activateExpression(application, record.index);
  });
  card.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateExpression(application, record.index);
  });

  return { card, canvasElement, record };
}

function rebuildExpressionCards(application) {
  const grid = application.element?.querySelector?.(".expression-choice-grid");
  if (!grid) return;

  const generation = (application._portraitPreviewGeneration ?? 0) + 1;
  application._portraitPreviewGeneration = generation;
  const cards = getExpressionRecords(application).map(record => createExpressionCard(application, record));
  grid.replaceChildren(...cards.map(({ card }) => card));

  loadImage(application.sprite?.spritesheet).then(image => {
    if (application._portraitPreviewGeneration !== generation || !application.element?.isConnected) return;
    for (const { canvasElement, record } of cards) {
      if (record.isNoExpression) drawNoExpressionPreview(canvasElement);
      else drawHeadPreview(canvasElement, image, record.frame);
    }
  });
}

export function installExpressionPickerAlignment(PortraitExpressionPicker) {
  if (PortraitExpressionPicker.prototype.portraitPickerAlignmentInstalled) return;

  Object.defineProperty(PortraitExpressionPicker.prototype, "portraitPickerAlignmentInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const parentPrototype = Object.getPrototypeOf(PortraitExpressionPicker.prototype);
  const baseOnRender = parentPrototype?._onRender;

  PortraitExpressionPicker.prototype._onRender = function(context, options) {
    baseOnRender?.call(this, context, options);

    window.requestAnimationFrame(() => {
      configureExpressionPicker(this);
      rebuildExpressionCards(this);
      window.requestAnimationFrame(() => configureExpressionPicker(this));
    });
  };
}

/**
 * Keep the portrait layer fully passive whenever Foundry deactivates it. Layer
 * switching itself is handled by the SceneControl `layer` property in init.js.
 */
export function installPortraitLayerIsolation(PortraitSpritesLayer) {
  if (PortraitSpritesLayer.prototype.portraitLayerIsolationInstalled) return;

  Object.defineProperty(PortraitSpritesLayer.prototype, "portraitLayerIsolationInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalSetInteractionActive = PortraitSpritesLayer.prototype.setInteractionActive;
  const originalDraw = PortraitSpritesLayer.prototype._draw;

  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    const enabled = Boolean(active);
    const result = originalSetInteractionActive.call(this, enabled);
    this.interactionActive = enabled;
    this.eventMode = enabled ? "static" : "none";
    this.interactive = enabled;
    this.interactiveChildren = enabled;
    if (!enabled) this.cursor = null;
    return result;
  };

  PortraitSpritesLayer.prototype._draw = async function(...args) {
    const result = await originalDraw.apply(this, args);
    this.setInteractionActive(Boolean(this.active));
    return result;
  };
}
