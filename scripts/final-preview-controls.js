const EXPRESSION_OVERLAP = 1;
const PREVIEW_INTERVAL_MS = 1000;

function getExpressionCount(application) {
  const columns = Math.max(1, Number(application.formData?.headGrid?.columns) || 1);
  const rows = Math.max(1, Number(application.formData?.headGrid?.rows) || 1);
  const capacity = columns * rows;
  const requested = Number(application.formData?.expressionCount);
  if (!Number.isFinite(requested)) return capacity;
  return Math.min(capacity, Math.max(1, Math.floor(requested)));
}

function getRandomExpressionIndex(application) {
  const count = getExpressionCount(application);
  return Math.floor(Math.random() * Math.max(1, count));
}

function drawFinalPreview(application, canvasElement) {
  const context = canvasElement?.getContext?.("2d");
  if (!context) return;

  const body = application.formData?.bodyFrame;
  const grid = application.formData?.headGrid;
  const headOffset = application.formData?.headOffset;
  if (!body || !grid || !headOffset) return;

  canvasElement.width = Math.max(1, Number(body.width) || 1);
  canvasElement.height = Math.max(1, Number(body.height) || 1);
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.imageSmoothingEnabled = false;

  const image = application.previewImage;
  if (!image) {
    const styles = getComputedStyle(canvasElement);
    context.fillStyle = styles.backgroundColor;
    context.fillRect(0, 0, canvasElement.width, canvasElement.height);
    return;
  }

  context.drawImage(
    image,
    Number(body.x) || 0,
    Number(body.y) || 0,
    Math.max(1, Number(body.width) || 1),
    Math.max(1, Number(body.height) || 1),
    0,
    0,
    Math.max(1, Number(body.width) || 1),
    Math.max(1, Number(body.height) || 1)
  );

  if (!application.finalPreviewShowsExpression) return;

  const count = getExpressionCount(application);
  const index = Math.min(
    Math.max(0, Number(application.finalPreviewRandomIndex) || 0),
    Math.max(0, count - 1)
  );
  const columns = Math.max(1, Number(grid.columns) || 1);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const cellWidth = Math.max(1, Number(grid.cellWidth) || 1);
  const cellHeight = Math.max(1, Number(grid.cellHeight) || 1);
  const sourceX = (Number(grid.startX) || 0) + column * cellWidth;
  const sourceY = (Number(grid.startY) || 0) + row * cellHeight;
  const destinationX = Number(headOffset.x) || 0;
  const destinationY = Number(headOffset.y) || 0;

  // Match runtime face replacement while retaining the one-pixel overlap that
  // prevents subpixel seams around the expression border.
  const cutoutWidth = Math.max(0, cellWidth - EXPRESSION_OVERLAP * 2);
  const cutoutHeight = Math.max(0, cellHeight - EXPRESSION_OVERLAP * 2);
  if (cutoutWidth > 0 && cutoutHeight > 0) {
    context.clearRect(
      destinationX + EXPRESSION_OVERLAP,
      destinationY + EXPRESSION_OVERLAP,
      cutoutWidth,
      cutoutHeight
    );
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cellWidth,
    cellHeight,
    destinationX,
    destinationY,
    cellWidth,
    cellHeight
  );
}

function drawMagnifier(application, sourceCanvas, magnifierCanvas) {
  const context = magnifierCanvas?.getContext?.("2d");
  if (!context) return;

  context.clearRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
  context.imageSmoothingEnabled = false;
  const styles = getComputedStyle(magnifierCanvas);
  context.fillStyle = styles.backgroundColor;
  context.fillRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
  if (!sourceCanvas?.width || !sourceCanvas?.height) return;

  const point = application.finalPreviewPoint || {
    x: sourceCanvas.width / 2,
    y: sourceCanvas.height / 2
  };
  const zoom = Math.min(12, Math.max(2, Number(application.finalPreviewZoom) || 4));
  const sourceWidth = Math.min(sourceCanvas.width, magnifierCanvas.width / zoom);
  const sourceHeight = Math.min(sourceCanvas.height, magnifierCanvas.height / zoom);
  const sourceX = Math.max(0, Math.min(sourceCanvas.width - sourceWidth, point.x - sourceWidth / 2));
  const sourceY = Math.max(0, Math.min(sourceCanvas.height - sourceHeight, point.y - sourceHeight / 2));

  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    magnifierCanvas.width,
    magnifierCanvas.height
  );

  context.strokeStyle = styles.color;
  context.lineWidth = 2;
  context.strokeRect(1, 1, magnifierCanvas.width - 2, magnifierCanvas.height - 2);
  context.fillStyle = styles.backgroundColor;
  context.fillRect(8, 8, 54, 22);
  context.fillStyle = styles.color;
  context.font = styles.font || "12px sans-serif";
  context.fillText(`${zoom}x`, 18, 23);
}

function redrawFinalPreview(application) {
  const canvasElement = application.element?.querySelector?.(".final-sprite-preview-canvas");
  const magnifierCanvas = application.element?.querySelector?.(".final-magnifier-canvas");
  if (!canvasElement) return;
  drawFinalPreview(application, canvasElement);
  drawMagnifier(application, canvasElement, magnifierCanvas);
}

function syncCoordinateOffsetInput(application, axis, value) {
  const coordinateInput = application.element?.querySelector?.(`[name='headOffset.${axis}']`);
  if (coordinateInput) coordinateInput.value = value;
}

function setHeadOffset(application, axis, value) {
  if (!application.formData?.headOffset) return;
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  application.formData.headOffset[axis] = Math.round(number);
  syncCoordinateOffsetInput(application, axis, application.formData.headOffset[axis]);
  redrawFinalPreview(application);
}

function createNudgeButton(application, axis, delta) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "final-head-offset-nudge";
  button.dataset.axis = axis;
  button.dataset.delta = String(delta);
  button.textContent = delta < 0 ? "−" : "+";
  button.title = `${delta < 0 ? "Decrease" : "Increase"} ${axis.toUpperCase()} offset by 1 pixel`;
  button.addEventListener("click", event => {
    event.preventDefault();
    const current = Number(application.formData?.headOffset?.[axis]) || 0;
    const next = current + delta;
    setHeadOffset(application, axis, next);
    const input = application.element?.querySelector?.(`.final-head-offset-input[data-axis='${axis}']`);
    if (input) input.value = next;
  });
  return button;
}

function createOffsetRow(application, axis) {
  const row = document.createElement("div");
  row.className = "final-head-offset-row";

  const label = document.createElement("span");
  label.className = "final-head-offset-axis";
  label.textContent = axis.toUpperCase();

  const decrement = createNudgeButton(application, axis, -1);

  const input = document.createElement("input");
  input.type = "number";
  input.step = "1";
  input.className = "final-head-offset-input";
  input.dataset.axis = axis;
  input.value = Number(application.formData?.headOffset?.[axis]) || 0;
  input.setAttribute("aria-label", `Head offset ${axis}`);
  input.addEventListener("input", event => setHeadOffset(application, axis, event.currentTarget.value));

  const increment = createNudgeButton(application, axis, 1);
  row.append(label, decrement, input, increment);
  return row;
}

function installOffsetControls(application) {
  const panel = application.element?.querySelector?.(".final-magnifier-panel");
  if (!panel || panel.querySelector(".final-head-offset-controls")) return;

  const controls = document.createElement("div");
  controls.className = "final-head-offset-controls";

  const title = document.createElement("strong");
  title.className = "final-head-offset-title";
  title.textContent = game.i18n.localize("PORTRAIT_SPRITES.Creator.HeadOffset");

  controls.append(
    title,
    createOffsetRow(application, "x"),
    createOffsetRow(application, "y")
  );
  panel.appendChild(controls);
}

function takeOverPreviewTimer(application) {
  if (application.finalPreviewInterval) {
    clearInterval(application.finalPreviewInterval);
    application.finalPreviewInterval = null;
  }

  if (application.finalPreviewShowsExpression === undefined) {
    application.finalPreviewShowsExpression = false;
  }
  if (!Number.isInteger(application.finalPreviewRandomIndex)) {
    application.finalPreviewRandomIndex = getRandomExpressionIndex(application);
  }

  redrawFinalPreview(application);
  application.finalPreviewInterval = setInterval(() => {
    application.finalPreviewShowsExpression = !application.finalPreviewShowsExpression;
    if (application.finalPreviewShowsExpression) {
      application.finalPreviewRandomIndex = getRandomExpressionIndex(application);
    }
    redrawFinalPreview(application);
  }, PREVIEW_INTERVAL_MS);
}

/**
 * Replace the creator's sequential final-preview cycle with a comparison view:
 * original body -> random expression -> original body -> random expression.
 * Also add live one-pixel head-offset controls below the sticky magnifier.
 */
export function installFinalPreviewControls(PortraitSpriteCreator) {
  if (PortraitSpriteCreator.prototype.finalPreviewControlsInstalled) return;

  Object.defineProperty(PortraitSpriteCreator.prototype, "finalPreviewControlsInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalOnRender = PortraitSpriteCreator.prototype._onRender;
  PortraitSpriteCreator.prototype._onRender = function(...args) {
    const result = originalOnRender.apply(this, args);
    installOffsetControls(this);
    takeOverPreviewTimer(this);
    return result;
  };
}
