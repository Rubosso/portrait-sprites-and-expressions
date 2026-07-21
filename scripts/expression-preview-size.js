const PREVIEW_SIZE = 220;
const CARD_WIDTH = 248;
const CARD_HEIGHT = 278;
const GRID_GAP = 16;
const DEFAULT_PICKER_WIDTH = 1040;
const DEFAULT_PICKER_HEIGHT = 760;
const VIEWPORT_MARGIN = 64;
const SELECTED_BORDER = "3px solid #fbbf24";
const DEFAULT_BORDER = "2px solid rgba(255, 255, 255, 0.12)";
const NO_EXPRESSION_REDRAW_DELAYS = [0, 50, 150, 400, 1000];

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function applyDefaultPickerSize(application) {
  if (application._portraitDefaultPickerSizeApplied) return;
  application._portraitDefaultPickerSizeApplied = true;

  const maximumWidth = Math.max(520, window.innerWidth - VIEWPORT_MARGIN);
  const maximumHeight = Math.max(420, window.innerHeight - VIEWPORT_MARGIN);
  application.setPosition?.({
    width: Math.min(DEFAULT_PICKER_WIDTH, maximumWidth),
    height: Math.min(DEFAULT_PICKER_HEIGHT, maximumHeight)
  });
}

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

function drawNeutralHeadPreview(canvasElement) {
  if (!canvasElement) return;
  fixPreviewCanvasSize(canvasElement);

  const context = canvasElement.getContext("2d");
  if (!context) return;

  const { width, height } = canvasElement;
  const centerX = width / 2;
  const headCenterY = height * 0.46;
  const headRadiusX = width * 0.25;
  const headRadiusY = height * 0.32;
  const lineWidth = Math.max(4, width * 0.022);

  context.clearRect(0, 0, width, height);
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";

  // A deliberately featureless head communicates that the head layer is
  // hidden without suggesting any particular facial expression.
  context.fillStyle = "rgba(203, 213, 225, 0.22)";
  context.strokeStyle = "rgba(248, 250, 252, 0.88)";
  context.lineWidth = lineWidth;

  context.beginPath();
  context.ellipse(
    centerX - headRadiusX * 1.03,
    headCenterY,
    headRadiusX * 0.13,
    headRadiusY * 0.25,
    0,
    0,
    Math.PI * 2
  );
  context.ellipse(
    centerX + headRadiusX * 1.03,
    headCenterY,
    headRadiusX * 0.13,
    headRadiusY * 0.25,
    0,
    0,
    Math.PI * 2
  );
  context.fill();
  context.stroke();

  context.beginPath();
  context.ellipse(centerX, headCenterY, headRadiusX, headRadiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(centerX - headRadiusX * 0.34, headCenterY + headRadiusY * 0.9);
  context.lineTo(centerX - headRadiusX * 0.34, height * 0.86);
  context.moveTo(centerX + headRadiusX * 0.34, headCenterY + headRadiusY * 0.9);
  context.lineTo(centerX + headRadiusX * 0.34, height * 0.86);
  context.stroke();

  context.restore();
}

function redrawNoExpressionPreview(application) {
  const canvasElement = application.element?.querySelector?.(
    '.expression-choice[data-expression-index="-1"] .expression-choice-preview'
  );
  drawNeutralHeadPreview(canvasElement);
}

function scheduleNoExpressionPreview(application) {
  for (const timer of application._portraitNoExpressionPreviewTimers ?? []) window.clearTimeout(timer);
  application._portraitNoExpressionPreviewTimers = NO_EXPRESSION_REDRAW_DELAYS.map(delay => (
    window.setTimeout(() => {
      if (!application.element?.isConnected) return;
      redrawNoExpressionPreview(application);
    }, delay)
  ));
}

function applyExpressionSearch(application) {
  const root = application.element;
  const grid = root?.querySelector?.(".expression-choice-grid");
  if (!grid) return;

  const query = normalizeSearchText(application._portraitExpressionSearchQuery);
  for (const card of grid.querySelectorAll(".expression-choice")) {
    const label = normalizeSearchText(card.querySelector(".expression-choice-label")?.textContent);
    const matches = !query || label.includes(query);
    card.dataset.searchHidden = matches ? "false" : "true";
    card.style.setProperty("display", matches ? "flex" : "none", "important");
  }
}

function createSearchBar(application, picker, grid) {
  const toolbar = document.createElement("div");
  toolbar.className = "portrait-expression-search";
  toolbar.setAttribute("role", "search");
  Object.assign(toolbar.style, {
    alignItems: "center",
    display: "flex",
    gap: "8px",
    margin: "0 0 12px",
    minWidth: "0",
    width: "100%"
  });

  const input = document.createElement("input");
  input.className = "portrait-expression-search-input";
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = game.i18n.localize("PORTRAIT_SPRITES.ExpressionPicker.SearchPlaceholder");
  input.value = application._portraitExpressionSearchQuery ?? "";
  input.setAttribute("aria-label", input.placeholder);
  Object.assign(input.style, {
    flex: "1 1 auto",
    height: "36px",
    margin: "0",
    minWidth: "0",
    padding: "6px 10px",
    width: "100%"
  });

  const clearButton = document.createElement("button");
  clearButton.className = "portrait-expression-search-clear";
  clearButton.type = "button";
  clearButton.textContent = "×";
  clearButton.title = game.i18n.localize("PORTRAIT_SPRITES.ExpressionPicker.ClearSearch");
  clearButton.setAttribute("aria-label", clearButton.title);
  Object.assign(clearButton.style, {
    flex: "0 0 36px",
    fontSize: "20px",
    height: "36px",
    lineHeight: "1",
    margin: "0",
    padding: "0",
    width: "36px"
  });

  const updateClearButton = () => {
    clearButton.disabled = !input.value;
    clearButton.style.opacity = input.value ? "1" : "0.45";
  };

  input.addEventListener("input", () => {
    application._portraitExpressionSearchQuery = input.value;
    grid.scrollTop = 0;
    updateClearButton();
    applyExpressionSearch(application);
  });
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key !== "Escape" || !input.value) return;
    event.preventDefault();
    input.value = "";
    application._portraitExpressionSearchQuery = "";
    updateClearButton();
    applyExpressionSearch(application);
  });
  clearButton.addEventListener("click", event => {
    event.preventDefault();
    input.value = "";
    application._portraitExpressionSearchQuery = "";
    grid.scrollTop = 0;
    updateClearButton();
    applyExpressionSearch(application);
    input.focus();
  });

  toolbar.append(input, clearButton);
  picker.insertBefore(toolbar, grid);
  updateClearButton();
  return toolbar;
}

function ensureSearchBar(application, picker, grid) {
  let toolbar = picker.querySelector(":scope > .portrait-expression-search");
  if (!toolbar) toolbar = createSearchBar(application, picker, grid);

  const input = toolbar.querySelector(".portrait-expression-search-input");
  if (input && input.value !== (application._portraitExpressionSearchQuery ?? "")) {
    input.value = application._portraitExpressionSearchQuery ?? "";
  }
  return toolbar;
}

function configureFixedExpressionPreviews(application) {
  const root = application.element;
  if (!root) return;

  applyDefaultPickerSize(application);

  const picker = root.querySelector(".expression-picker-content");
  const grid = root.querySelector(".expression-choice-grid");
  if (!picker || !grid) return;

  ensureSearchBar(application, picker, grid);
  picker.style.setProperty("grid-template-rows", "auto auto minmax(0, 1fr)", "important");

  // Cards have a fixed width. Resizing the window only changes how many complete
  // cards fit on each row; it never scales a card or its preview.
  grid.style.setProperty("gap", `${GRID_GAP}px`, "important");
  grid.style.setProperty("grid-template-columns", `repeat(auto-fill, ${CARD_WIDTH}px)`, "important");
  grid.style.setProperty("justify-content", "center", "important");
  grid.style.setProperty("justify-items", "center", "important");
  grid.style.setProperty("overflow-x", "auto", "important");

  for (const card of grid.querySelectorAll(".expression-choice")) {
    const selected = card.classList.contains("is-active") || card.getAttribute("aria-selected") === "true";
    card.style.setProperty("border", selected ? SELECTED_BORDER : DEFAULT_BORDER, "important");
    card.style.setProperty(
      "box-shadow",
      selected ? "0 0 0 2px rgba(251, 191, 36, 0.28), 0 0 14px rgba(251, 191, 36, 0.2)" : "none",
      "important"
    );
    card.style.setProperty("box-sizing", "border-box", "important");
    card.style.setProperty("height", `${CARD_HEIGHT}px`, "important");
    card.style.setProperty("max-height", `${CARD_HEIGHT}px`, "important");
    card.style.setProperty("max-width", `${CARD_WIDTH}px`, "important");
    card.style.setProperty("min-height", `${CARD_HEIGHT}px`, "important");
    card.style.setProperty("min-width", `${CARD_WIDTH}px`, "important");
    card.style.setProperty("padding", selected ? "11px" : "12px", "important");
    card.style.setProperty("width", `${CARD_WIDTH}px`, "important");
  }

  for (const canvasElement of grid.querySelectorAll(".expression-choice-preview")) {
    fixPreviewCanvasSize(canvasElement);
  }

  for (const label of grid.querySelectorAll(".expression-choice-label")) {
    label.style.setProperty("font-size", "14px", "important");
  }

  redrawNoExpressionPreview(application);
  applyExpressionSearch(application);

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
  scheduleNoExpressionPreview(application);
}

/**
 * Apply fixed-size expression previews, selected-state styling, live name
 * filtering, a larger initial window, and a neutral no-expression preview after
 * the picker has rebuilt its cards.
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
    for (const timer of this._portraitNoExpressionPreviewTimers ?? []) window.clearTimeout(timer);
    this._portraitNoExpressionPreviewTimers = [];
    this._portraitLargePreviewObserver?.disconnect?.();
    this._portraitLargePreviewObserver = null;
    this._portraitLargePreviewObservedRoot = null;
    this._portraitDefaultPickerSizeApplied = false;
    return originalClose.apply(this, args);
  };
}
