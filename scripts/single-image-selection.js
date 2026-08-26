const ALPHA_THRESHOLD = 4;
const HANDLE_TOLERANCE = 12;
const MIN_BODY_SIZE = 1;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
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

function findVisibleAlphaBounds(image) {
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const context = canvasElement.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width, height };

  try {
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  } catch (error) {
    console.warn("Portrait Sprites | Could not inspect single-image transparency", error);
    return { x: 0, y: 0, width, height };
  }
}

function syncBodyInputs(application) {
  const body = application.formData?.bodyFrame;
  if (!body || !application.element) return;
  for (const key of ["x", "y", "width", "height"]) {
    const input = application.element.querySelector(`[name='bodyFrame.${key}']`);
    if (input) input.value = body[key];
  }
}

function drawBodyOutline(context, body) {
  context.save();
  context.strokeStyle = "rgba(248, 113, 113, 0.98)";
  context.lineWidth = 5;
  const inset = context.lineWidth / 2;
  context.strokeRect(
    finiteNumber(body.x) + inset,
    finiteNumber(body.y) + inset,
    Math.max(1, finiteNumber(body.width, 1) - context.lineWidth),
    Math.max(1, finiteNumber(body.height, 1) - context.lineWidth)
  );
  context.restore();
}

function redrawSingleImagePreviews(application) {
  const image = application.previewImage;
  const body = application.formData?.bodyFrame;
  if (!image || !body || !application.element) return;

  const sourceCanvas = application.element.querySelector(".sprite-preview-canvas");
  const sourceContext = sourceCanvas?.getContext?.("2d");
  if (sourceCanvas && sourceContext) {
    sourceCanvas.width = Math.max(1, image.naturalWidth || image.width || 1);
    sourceCanvas.height = Math.max(1, image.naturalHeight || image.height || 1);
    sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceContext.drawImage(image, 0, 0);
    drawBodyOutline(sourceContext, body);
  }

  const finalCanvas = application.element.querySelector(".final-sprite-preview-canvas");
  const finalContext = finalCanvas?.getContext?.("2d");
  if (finalCanvas && finalContext) {
    finalCanvas.width = Math.max(1, finiteNumber(body.width, 1));
    finalCanvas.height = Math.max(1, finiteNumber(body.height, 1));
    finalContext.clearRect(0, 0, finalCanvas.width, finalCanvas.height);
    finalContext.imageSmoothingEnabled = false;
    finalContext.drawImage(
      image,
      finiteNumber(body.x),
      finiteNumber(body.y),
      Math.max(1, finiteNumber(body.width, 1)),
      Math.max(1, finiteNumber(body.height, 1)),
      0,
      0,
      finalCanvas.width,
      finalCanvas.height
    );
  }
}

async function configureAlphaBodyDefault(application) {
  if (!application.singleImageMode) return false;
  const src = String(application.formData?.spritesheet || "");
  if (!src) return false;
  if (application._singleImageAlphaConfiguredSpritesheet === src) return false;

  // The single-image support first finishes its own spritesheet setup. Waiting
  // for this marker prevents its whole-image fallback from overwriting the alpha
  // crop after we calculate it.
  if (application._singleImageConfiguredSpritesheet !== src) return false;

  // Existing body-only sprites already have an intentional saved crop. Preserve
  // it when opening the editor; only auto-crop again after choosing a new image.
  if (application.sprite
      && (application.sprite.headFrames?.length ?? 0) === 0
      && application.sprite.spritesheet === src) {
    application._singleImageAlphaConfiguredSpritesheet = src;
    return false;
  }

  const image = await loadImage(src);
  if (!image || !application.singleImageMode || application.formData?.spritesheet !== src) return false;

  application.formData.imageWidth = Math.max(1, image.naturalWidth || image.width || 1);
  application.formData.imageHeight = Math.max(1, image.naturalHeight || image.height || 1);
  application.formData.bodyFrame = findVisibleAlphaBounds(image);
  application.formData.expressionCount = 0;
  application._singleImageAlphaConfiguredSpritesheet = src;
  syncBodyInputs(application);
  redrawSingleImagePreviews(application);
  return true;
}

function getCanvasPoint(canvasElement, event) {
  const rectangle = canvasElement.getBoundingClientRect();
  return {
    x: ((event.clientX - rectangle.left) / Math.max(1, rectangle.width)) * canvasElement.width,
    y: ((event.clientY - rectangle.top) / Math.max(1, rectangle.height)) * canvasElement.height
  };
}

function hitTestBody(body, point) {
  const left = finiteNumber(body.x);
  const top = finiteNumber(body.y);
  const right = left + Math.max(MIN_BODY_SIZE, finiteNumber(body.width, MIN_BODY_SIZE));
  const bottom = top + Math.max(MIN_BODY_SIZE, finiteNumber(body.height, MIN_BODY_SIZE));
  const inside = point.x >= left - HANDLE_TOLERANCE
    && point.x <= right + HANDLE_TOLERANCE
    && point.y >= top - HANDLE_TOLERANCE
    && point.y <= bottom + HANDLE_TOLERANCE;
  if (!inside) return null;

  const nearLeft = Math.abs(point.x - left) <= HANDLE_TOLERANCE;
  const nearRight = Math.abs(point.x - right) <= HANDLE_TOLERANCE;
  const nearTop = Math.abs(point.y - top) <= HANDLE_TOLERANCE;
  const nearBottom = Math.abs(point.y - bottom) <= HANDLE_TOLERANCE;
  const handle = `${nearTop ? "n" : ""}${nearBottom ? "s" : ""}${nearLeft ? "w" : ""}${nearRight ? "e" : ""}`;
  return {
    mode: handle ? "resize" : "move",
    handle
  };
}

function cursorForHit(hit) {
  if (!hit) return "default";
  if (hit.mode === "move") return "move";
  if (hit.handle === "n" || hit.handle === "s") return "ns-resize";
  if (hit.handle === "e" || hit.handle === "w") return "ew-resize";
  if (hit.handle === "ne" || hit.handle === "sw") return "nesw-resize";
  return "nwse-resize";
}

function getImageBounds(application, canvasElement) {
  return {
    width: Math.max(1, finiteNumber(application.formData?.imageWidth, canvasElement.width || 1)),
    height: Math.max(1, finiteNumber(application.formData?.imageHeight, canvasElement.height || 1))
  };
}

function updateBodyDrag(application, canvasElement, point) {
  const state = application._singleImageBodyDrag;
  if (!state) return;

  const dx = Math.round(point.x - state.startPoint.x);
  const dy = Math.round(point.y - state.startPoint.y);
  const image = getImageBounds(application, canvasElement);
  const start = state.startFrame;

  if (state.mode === "move") {
    const width = Math.min(image.width, Math.max(MIN_BODY_SIZE, start.width));
    const height = Math.min(image.height, Math.max(MIN_BODY_SIZE, start.height));
    application.formData.bodyFrame = {
      x: clamp(start.x + dx, 0, Math.max(0, image.width - width)),
      y: clamp(start.y + dy, 0, Math.max(0, image.height - height)),
      width,
      height
    };
  } else {
    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (state.handle.includes("w")) left = clamp(start.x + dx, 0, right - MIN_BODY_SIZE);
    if (state.handle.includes("e")) right = clamp(start.x + start.width + dx, left + MIN_BODY_SIZE, image.width);
    if (state.handle.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN_BODY_SIZE);
    if (state.handle.includes("s")) bottom = clamp(start.y + start.height + dy, top + MIN_BODY_SIZE, image.height);

    application.formData.bodyFrame = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(MIN_BODY_SIZE, Math.round(right - left)),
      height: Math.max(MIN_BODY_SIZE, Math.round(bottom - top))
    };
  }

  syncBodyInputs(application);
  redrawSingleImagePreviews(application);
}

function installBodyOnlyPreviewInteraction(application) {
  const canvasElement = application.element?.querySelector?.(".sprite-preview-canvas");
  if (!canvasElement) return;

  // single-image-support disables this canvas to prevent the old head/grid drag
  // targets. Re-enable the canvas, then own the pointer workflow in capture phase
  // so only the visible body rectangle can ever be grabbed.
  canvasElement.style.pointerEvents = application.singleImageMode ? "auto" : "";
  if (!application.singleImageMode || canvasElement.dataset.singleImageBodyDrag === "true") return;
  canvasElement.dataset.singleImageBodyDrag = "true";
  application.dragState = null;

  canvasElement.addEventListener("pointerdown", event => {
    if (!application.singleImageMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const point = getCanvasPoint(canvasElement, event);
    const hit = hitTestBody(application.formData.bodyFrame, point);
    if (!hit) return;

    application._singleImageBodyDrag = {
      pointerId: event.pointerId,
      startPoint: point,
      startFrame: foundry.utils.deepClone(application.formData.bodyFrame),
      ...hit
    };
    canvasElement.setPointerCapture?.(event.pointerId);
  }, true);

  canvasElement.addEventListener("pointermove", event => {
    if (!application.singleImageMode) return;
    event.stopImmediatePropagation();
    const point = getCanvasPoint(canvasElement, event);
    const state = application._singleImageBodyDrag;
    if (state?.pointerId === event.pointerId) {
      event.preventDefault();
      updateBodyDrag(application, canvasElement, point);
      canvasElement.style.cursor = cursorForHit(state);
      return;
    }
    canvasElement.style.cursor = cursorForHit(hitTestBody(application.formData.bodyFrame, point));
  }, true);

  const finish = event => {
    if (!application.singleImageMode) return;
    event.stopImmediatePropagation();
    const state = application._singleImageBodyDrag;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    application._singleImageBodyDrag = null;
    canvasElement.releasePointerCapture?.(event.pointerId);
    const point = getCanvasPoint(canvasElement, event);
    canvasElement.style.cursor = cursorForHit(hitTestBody(application.formData.bodyFrame, point));
    redrawSingleImagePreviews(application);
  };

  canvasElement.addEventListener("pointerup", finish, true);
  canvasElement.addEventListener("pointercancel", finish, true);
}

function installToggleReset(application) {
  const toggle = application.element?.querySelector?.("[data-action='single-image-mode']");
  if (!toggle || toggle.dataset.singleImageAlphaReset === "true") return;
  toggle.dataset.singleImageAlphaReset = "true";
  toggle.addEventListener("change", event => {
    if (event.currentTarget.checked) {
      application._singleImageAlphaConfiguredSpritesheet = null;
      application._singleImageBodyDrag = null;
      application.dragState = null;
    }
  }, true);
}

/**
 * Refine Single Image mode so its initial body rectangle comes from visible
 * alpha pixels and the preview only allows direct manipulation of that body
 * rectangle. Hidden expression/head regions never participate in hit testing.
 */
export function installSingleImageSelection(PortraitSpriteCreator) {
  if (PortraitSpriteCreator.prototype.singleImageSelectionInstalled) return;

  Object.defineProperty(PortraitSpriteCreator.prototype, "singleImageSelectionInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalOnRender = PortraitSpriteCreator.prototype._onRender;
  const originalClose = PortraitSpriteCreator.prototype.close;

  PortraitSpriteCreator.prototype._onRender = function(...args) {
    const result = originalOnRender.apply(this, args);
    installToggleReset(this);

    if (this.singleImageMode) {
      this.dragState = null;
      installBodyOnlyPreviewInteraction(this);
      configureAlphaBodyDefault(this).then(changed => {
        if (changed && this.element?.isConnected && this.singleImageMode) this.render(false);
      });
    }
    return result;
  };

  PortraitSpriteCreator.prototype.close = async function(...args) {
    this._singleImageBodyDrag = null;
    return originalClose.apply(this, args);
  };
}
