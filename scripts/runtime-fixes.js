import { NO_EXPRESSION } from "./no-expression.js";

const VIEWPORT_MARGIN = 64;
const PICKER_MIN_HEIGHT = 360;
const PICKER_DEFAULT_HEIGHT = 620;
const PICKER_MIN_CARD_WIDTH = 112;

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

function drawHeadPreview(canvasElement, image, frame) {
  const context = canvasElement.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (!image || !frame) return;

  const padding = 8;
  const scale = Math.min(
    (canvasElement.width - padding * 2) / Math.max(1, frame.width),
    (canvasElement.height - padding * 2) / Math.max(1, frame.height)
  );
  const width = frame.width * scale;
  const height = frame.height * scale;
  const x = (canvasElement.width - width) / 2;
  const y = (canvasElement.height - height) / 2;

  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    x,
    y,
    width,
    height
  );
}

function renderExpressionCards(application) {
  const root = application.element;
  if (!root) return;

  const generation = (application._portraitPreviewGeneration ?? 0) + 1;
  application._portraitPreviewGeneration = generation;
  loadImage(application.sprite?.spritesheet).then(image => {
    if (application._portraitPreviewGeneration !== generation || !application.element?.isConnected) return;

    application.element.querySelectorAll(".expression-choice[data-expression-index]").forEach(card => {
      const index = Number(card.dataset.expressionIndex);
      const canvasElement = card.querySelector(".expression-choice-preview");
      if (!canvasElement || !Number.isInteger(index)) return;

      if (index === NO_EXPRESSION) {
        drawNoExpressionPreview(canvasElement);
        return;
      }
      drawHeadPreview(canvasElement, image, application.sprite?.headFrames?.[index]);
    });
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

    const activateCard = async card => {
      const grid = this.element?.querySelector?.(".expression-choice-grid");
      this._portraitPickerScrollTop = grid?.scrollTop ?? 0;
      const index = Number(card.dataset.expressionIndex);
      if (!Number.isInteger(index)) return;

      this.sprite.currentExpression = index;
      this.sprite.updateExpression();
      await this.sprite._saveToScene();
      this.render(false);
    };

    this.element.querySelectorAll(".expression-choice[data-expression-index]").forEach(card => {
      card.addEventListener("click", event => {
        event.preventDefault();
        activateCard(card);
      });
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateCard(card);
      });
    });

    window.requestAnimationFrame(() => {
      configureExpressionPicker(this);
      renderExpressionCards(this);
      window.requestAnimationFrame(() => configureExpressionPicker(this));
    });
  };
}

function disablePortraitLayer() {
  canvas?.portraitSprites?.setInteractionActive?.(false);
}

function wrapControlActivation(control) {
  if (!control || control._portraitLayerIsolationWrapped) return;
  Object.defineProperty(control, "_portraitLayerIsolationWrapped", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalOnChange = control.onChange;
  control.onChange = function(event, active, ...args) {
    if (active !== false) disablePortraitLayer();
    return originalOnChange?.call(this, event, active, ...args);
  };

  for (const tool of Object.values(control.tools ?? {})) {
    if (!tool || tool._portraitLayerIsolationWrapped) continue;
    Object.defineProperty(tool, "_portraitLayerIsolationWrapped", {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    const originalToolOnChange = tool.onChange;
    tool.onChange = function(event, active, ...args) {
      if (active !== false) disablePortraitLayer();
      return originalToolOnChange?.call(this, event, active, ...args);
    };
  }
}

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
    this.setInteractionActive(Boolean(this.interactionActive));
    return result;
  };

  Hooks.on("getSceneControlButtons", controls => {
    for (const [name, control] of Object.entries(controls ?? {})) {
      if (name === "portraitSprites") continue;
      wrapControlActivation(control);
    }
  });
}
