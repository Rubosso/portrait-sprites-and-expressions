const PREVIEW_SIZE = 220;
const CARD_WIDTH = 248;
const CARD_HEIGHT = 278;
const GRID_GAP = 16;

function fixPreviewCanvasSize(canvasElement) {
  if (!canvasElement) return;

  if (canvasElement.width !== PREVIEW_SIZE || canvasElement.height !== PREVIEW_SIZE) {
    const previous = document.createElement("canvas");
    previous.width = Math.max(1, canvasElement.width);
    previous.height = Math.max(1, canvasElement.height);
    previous.getContext("2d")?.drawImage(canvasElement, 0, 0);

    canvasElement.width = PREVIEW_SIZE;
    canvasElement.height = PREVIEW_SIZE;

    const context = canvasElement.getContext("2d");
    if (context) {
      context.imageSmoothingEnabled = false;
      context.drawImage(
        previous,
        0,
        0,
        previous.width,
        previous.height,
        0,
        0,
        PREVIEW_SIZE,
        PREVIEW_SIZE
      );
    }
  }

  // Keep both CSS dimensions identical and immutable. Previously the height was
  // fixed while max-width: 100% allowed the width to shrink with the window,
  // which visibly warped the expression preview.
  canvasElement.style.setProperty("aspect-ratio", "1 / 1", "important");
  canvasElement.style.setProperty("box-sizing", "border-box", "important");
  canvasElement.style.setProperty("display", "block", "important");
  canvasElement.style.setProperty("flex", `0 0 ${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("height", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("margin", "0 auto", "important");
  canvasElement.style.setProperty("max-height", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("max-width", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("min-height", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("min-width", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("width", `${PREVIEW_SIZE}px`, "important");
}

function configureFixedExpressionPreviews(application) {
  const root = application.element;
  if (!root) return;

  const grid = root.querySelector(".expression-choice-grid");
  if (!grid) return;

  // Cards have a fixed width. Resizing the window only changes how many complete
  // cards fit on each row; it never scales a card or its preview.
  grid.style.setProperty("gap", `${GRID_GAP}px`, "important");
  grid.style.setProperty("grid-template-columns", `repeat(auto-fill, ${CARD_WIDTH}px)`, "important");
  grid.style.setProperty("justify-content", "center", "important");
  grid.style.setProperty("justify-items", "center", "important");
  grid.style.setProperty("overflow-x", "auto", "important");

  for (const card of grid.querySelectorAll(".expression-choice")) {
    card.style.setProperty("box-sizing", "border-box", "important");
    card.style.setProperty("height", `${CARD_HEIGHT}px`, "important");
    card.style.setProperty("max-height", `${CARD_HEIGHT}px`, "important");
    card.style.setProperty("max-width", `${CARD_WIDTH}px`, "important");
    card.style.setProperty("min-height", `${CARD_HEIGHT}px`, "important");
    card.style.setProperty("min-width", `${CARD_WIDTH}px`, "important");
    card.style.setProperty("padding", "12px", "important");
    card.style.setProperty("width", `${CARD_WIDTH}px`, "important");
  }

  for (const canvasElement of grid.querySelectorAll(".expression-choice-preview")) {
    fixPreviewCanvasSize(canvasElement);
  }

  for (const label of grid.querySelectorAll(".expression-choice-label")) {
    label.style.setProperty("font-size", "14px", "important");
  }

  if (application._portraitLargePreviewObservedRoot !== root) {
    application._portraitLargePreviewObserver?.disconnect?.();
    application._portraitLargePreviewObservedRoot = root;
    application._portraitLargePreviewObserver = new ResizeObserver(() => {
      configureFixedExpressionPreviews(application);
    });
    application._portraitLargePreviewObserver.observe(root);
  }
}

function scheduleFixedExpressionPreviews(application) {
  window.cancelAnimationFrame(application._portraitLargePreviewFrame);
  application._portraitLargePreviewFrame = window.requestAnimationFrame(() => {
    configureFixedExpressionPreviews(application);
    window.requestAnimationFrame(() => {
      configureFixedExpressionPreviews(application);
      window.requestAnimationFrame(() => configureFixedExpressionPreviews(application));
    });
  });
}

/**
 * Apply fixed-size expression previews after the picker has rebuilt its cards.
 * The preview remains a 220px square at every window size; only the number of
 * grid columns changes.
 */
export function installLargeExpressionPreviews(PortraitExpressionPicker) {
  if (PortraitExpressionPicker.prototype.portraitLargePreviewsInstalled) return;

  Object.defineProperty(PortraitExpressionPicker.prototype, "portraitLargePreviewsInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalOnRender = PortraitExpressionPicker.prototype._onRender;
  PortraitExpressionPicker.prototype._onRender = function(...args) {
    const result = originalOnRender.apply(this, args);
    scheduleFixedExpressionPreviews(this);
    return result;
  };

  const originalClose = PortraitExpressionPicker.prototype.close;
  PortraitExpressionPicker.prototype.close = async function(...args) {
    window.cancelAnimationFrame(this._portraitLargePreviewFrame);
    this._portraitLargePreviewObserver?.disconnect?.();
    this._portraitLargePreviewObserver = null;
    this._portraitLargePreviewObservedRoot = null;
    return originalClose.apply(this, args);
  };
}
