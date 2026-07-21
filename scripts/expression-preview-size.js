const PREVIEW_SIZE = 220;
const CARD_MIN_WIDTH = 220;
const CARD_MIN_HEIGHT = 258;
const GRID_GAP = 16;

function enlargePreviewCanvas(canvasElement) {
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

  canvasElement.style.setProperty("display", "block", "important");
  canvasElement.style.setProperty("flex", "0 0 auto", "important");
  canvasElement.style.setProperty("height", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("margin", "0 auto", "important");
  canvasElement.style.setProperty("max-height", `${PREVIEW_SIZE}px`, "important");
  canvasElement.style.setProperty("max-width", "100%", "important");
  canvasElement.style.setProperty("width", `${PREVIEW_SIZE}px`, "important");
}

function configureLargeExpressionPreviews(application) {
  const root = application.element;
  if (!root) return;

  const grid = root.querySelector(".expression-choice-grid");
  if (!grid) return;

  grid.style.setProperty("gap", `${GRID_GAP}px`, "important");
  grid.style.setProperty(
    "grid-template-columns",
    `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
    "important"
  );

  for (const card of grid.querySelectorAll(".expression-choice")) {
    card.style.setProperty("min-height", `${CARD_MIN_HEIGHT}px`, "important");
    card.style.setProperty("padding", "12px", "important");
  }

  for (const canvasElement of grid.querySelectorAll(".expression-choice-preview")) {
    enlargePreviewCanvas(canvasElement);
  }

  for (const label of grid.querySelectorAll(".expression-choice-label")) {
    label.style.setProperty("font-size", "14px", "important");
  }

  if (application._portraitLargePreviewObservedRoot !== root) {
    application._portraitLargePreviewObserver?.disconnect?.();
    application._portraitLargePreviewObservedRoot = root;
    application._portraitLargePreviewObserver = new ResizeObserver(() => {
      configureLargeExpressionPreviews(application);
    });
    application._portraitLargePreviewObserver.observe(root);
  }
}

function scheduleLargeExpressionPreviews(application) {
  window.cancelAnimationFrame(application._portraitLargePreviewFrame);
  application._portraitLargePreviewFrame = window.requestAnimationFrame(() => {
    configureLargeExpressionPreviews(application);
    window.requestAnimationFrame(() => {
      configureLargeExpressionPreviews(application);
      window.requestAnimationFrame(() => configureLargeExpressionPreviews(application));
    });
  });
}

/**
 * Apply an unmistakably larger preview size after the picker has rebuilt its
 * cards. This runs after the alignment and scrolling patches so earlier layout
 * code cannot restore the old 128px canvases or 112px columns.
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
    scheduleLargeExpressionPreviews(this);
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
