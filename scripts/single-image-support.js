import { NO_EXPRESSION } from "./no-expression.js";
import { updateSceneSprite } from "./scene-flags.js";
import { rememberSpriteTemplate } from "./sprite-library.js";

const IMAGE_READY_POLL_MS = 50;
const IMAGE_READY_MAX_POLLS = 200;
const MENU_WIDTH = 190;
const MENU_ROW_HEIGHT = 38;
const MENU_PADDING = 6;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function drawSelectionFrame(sprite, bounds) {
  if (!sprite.selectionFrame || !bounds) return;
  sprite.selectionFrame.clear();
  sprite.selectionFrame.lineStyle(2, 0xffc107, 1);
  sprite.selectionFrame.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
  sprite.selectionFrame.visible = Boolean(sprite.selected);
}

function setBodyOnlyHitArea(sprite) {
  const bounds = new PIXI.Rectangle(
    0,
    0,
    Math.max(1, finiteNumber(sprite.bodyFrame?.width, 1)),
    Math.max(1, finiteNumber(sprite.bodyFrame?.height, 1))
  );

  if ("transformContentBounds" in sprite || sprite.refreshTransformEventHitArea) {
    sprite.transformContentBounds = new PIXI.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
    sprite.refreshTransformEventHitArea?.();
    sprite.updateTransformHandles?.();
  } else {
    sprite.hitArea = bounds;
  }
  drawSelectionFrame(sprite, bounds);
}

function destroyHeadSprite(sprite) {
  const head = sprite.headSprite;
  if (!head) return;
  const texture = head.texture;
  head.parent?.removeChild?.(head);
  head.destroy?.({ children: true });
  texture?.destroy?.(false);
  sprite.headSprite = null;
}

function createHeadSprite(sprite) {
  if (sprite.headSprite || !sprite.baseTexture || !(sprite.headFrames?.length > 0)) return;

  const index = Number.isInteger(sprite.currentExpression)
    && sprite.currentExpression >= 0
    && sprite.currentExpression < sprite.headFrames.length
    ? sprite.currentExpression
    : 0;
  const frame = sprite.headFrames[index];
  if (!frame) return;

  const texture = new PIXI.Texture(
    sprite.baseTexture,
    new PIXI.Rectangle(frame.x, frame.y, frame.width, frame.height)
  );
  const head = new PIXI.Sprite(texture);
  head.position.set(finiteNumber(sprite.headOffset?.x), finiteNumber(sprite.headOffset?.y));
  head.eventMode = "none";
  sprite.headSprite = head;

  const selectionIndex = sprite.selectionFrame?.parent === sprite
    ? sprite.getChildIndex(sprite.selectionFrame)
    : sprite.children.length;
  sprite.addChildAt(head, Math.max(0, selectionIndex));
  sprite.updateExpression?.();
}

/**
 * Make the base portrait renderer tolerate headFrames: [] before the existing
 * expression, face-replacement, transform, flip, and visibility wrappers are
 * installed. The normal draw path is still used so all existing interactions are
 * attached; a temporary one-pixel head is removed before the wrapper returns.
 */
export function installSingleImageRuntimeSupport(PortraitSprite) {
  if (PortraitSprite.prototype.singleImageRuntimeInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "singleImageRuntimeInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalDraw = PortraitSprite.prototype.draw;
  const originalUpdate = PortraitSprite.prototype.update;

  PortraitSprite.prototype.draw = async function(...args) {
    if ((this.headFrames?.length ?? 0) > 0) return originalDraw.apply(this, args);

    const savedFrames = this.headFrames;
    const savedExpression = this.currentExpression;
    const savedOffset = this.headOffset;
    const body = this.bodyFrame;
    this.headFrames = [{
      x: finiteNumber(body?.x),
      y: finiteNumber(body?.y),
      width: 1,
      height: 1,
      name: ""
    }];
    this.currentExpression = 0;
    this.headOffset = { x: 0, y: 0 };

    let result;
    try {
      result = await originalDraw.apply(this, args);
    } finally {
      destroyHeadSprite(this);
      this.headFrames = savedFrames;
      this.currentExpression = savedExpression ?? NO_EXPRESSION;
      this.headOffset = savedOffset ?? { x: 0, y: 0 };
      setBodyOnlyHitArea(this);
    }
    return result;
  };

  PortraitSprite.prototype.update = async function(updates = {}) {
    const result = await originalUpdate.call(this, updates);
    if ((this.headFrames?.length ?? 0) === 0) {
      this.currentExpression = NO_EXPRESSION;
      destroyHeadSprite(this);
      setBodyOnlyHitArea(this);
    } else if (!this.headSprite) {
      createHeadSprite(this);
    }
    return result;
  };
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

function initializeMode(application) {
  if (application._singleImageModeInitialized) return;
  application._singleImageModeInitialized = true;
  application.singleImageMode = Boolean(application.sprite && (application.sprite.headFrames?.length ?? 0) === 0);
  if (application.singleImageMode) {
    application.formData.expressionCount = 0;
    application._singleImageConfiguredSpritesheet = application.formData.spritesheet;
  }
}

function rememberExpressionConfiguration(application) {
  if (application._singleImageSavedExpressionConfig) return;
  application._singleImageSavedExpressionConfig = {
    headGrid: foundry.utils.deepClone(application.formData.headGrid),
    headOffset: foundry.utils.deepClone(application.formData.headOffset),
    expressionCount: Math.max(1, Number(application.formData.expressionCount) || 1),
    expressionNames: foundry.utils.deepClone(application.formData.expressionNames ?? [])
  };
}

function restoreExpressionConfiguration(application) {
  const saved = application._singleImageSavedExpressionConfig;
  if (saved) {
    application.formData.headGrid = foundry.utils.deepClone(saved.headGrid);
    application.formData.headOffset = foundry.utils.deepClone(saved.headOffset);
    application.formData.expressionCount = Math.max(1, Number(saved.expressionCount) || 1);
    application.formData.expressionNames = foundry.utils.deepClone(saved.expressionNames ?? []);
    application._singleImageSavedExpressionConfig = null;
    return;
  }

  const body = application.formData.bodyFrame ?? { x: 0, y: 0, width: 256, height: 256 };
  application.formData.headGrid = {
    startX: 0,
    startY: Math.max(0, finiteNumber(body.y) + finiteNumber(body.height)),
    cellWidth: 256,
    cellHeight: 256,
    columns: 1,
    rows: 1
  };
  application.formData.headOffset = { x: 0, y: 0 };
  application.formData.expressionCount = 1;
  application.formData.expressionNames = [];
}

async function configureBodyFromWholeImage(application) {
  const src = application.formData?.spritesheet;
  if (!src) return;
  const image = await loadImage(src);
  if (!image) return;

  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  application.formData.imageWidth = width;
  application.formData.imageHeight = height;
  application.formData.bodyFrame = { x: 0, y: 0, width, height };
  application.formData.expressionCount = 0;
  application._singleImageConfiguredSpritesheet = src;
}

function createToggle(application) {
  const existing = application.element?.querySelector?.("[data-action='single-image-mode']");
  if (existing) return existing;

  const sourceInput = application.element?.querySelector?.("[name='spritesheet']");
  const sourceSection = sourceInput?.closest?.(".creator-subsection");
  if (!sourceSection) return null;

  const row = document.createElement("label");
  row.className = "single-image-mode-row";
  Object.assign(row.style, {
    alignItems: "center",
    display: "flex",
    gap: "8px",
    marginTop: "10px"
  });

  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.action = "single-image-mode";
  input.checked = Boolean(application.singleImageMode);

  const text = document.createElement("span");
  text.textContent = game.i18n.localize("PORTRAIT_SPRITES.Creator.SingleImageMode");
  row.append(input, text);

  const hint = document.createElement("p");
  hint.className = "helper-text single-image-mode-hint";
  hint.textContent = game.i18n.localize("PORTRAIT_SPRITES.Creator.SingleImageModeHint");

  sourceSection.append(row, hint);

  input.addEventListener("change", async event => {
    const enabled = Boolean(event.currentTarget.checked);
    if (enabled) {
      rememberExpressionConfiguration(application);
      application.singleImageMode = true;
      application.formData.expressionCount = 0;
      if (application.activeTab === "names") application.activeTab = "coordinates";
      await configureBodyFromWholeImage(application);
    } else {
      application.singleImageMode = false;
      restoreExpressionConfiguration(application);
      application._singleImageConfiguredSpritesheet = null;
    }
    application.render(false);
  });

  return input;
}

function setSingleImageLayout(application) {
  const root = application.element;
  if (!root) return;
  const enabled = Boolean(application.singleImageMode);

  const expressionSection = root.querySelector("[name='headGrid.startX']")?.closest?.(".creator-subsection");
  if (expressionSection) expressionSection.hidden = enabled;

  const namesTab = root.querySelector(".creator-tab[data-tab='names']");
  const namesPanel = root.querySelector(".creator-tab-panel[data-tab-panel='names']");
  if (namesTab) namesTab.hidden = enabled;
  if (namesPanel) namesPanel.hidden = enabled;

  if (enabled && application.activeTab === "names") application.activeTab = "coordinates";
  for (const tab of root.querySelectorAll(".creator-tab")) {
    tab.classList.toggle("active", tab.dataset.tab === application.activeTab);
  }
  for (const panel of root.querySelectorAll(".creator-tab-panel")) {
    panel.classList.toggle("active", panel.dataset.tabPanel === application.activeTab);
  }

  const sourceCanvas = root.querySelector(".sprite-preview-canvas");
  if (sourceCanvas) sourceCanvas.style.pointerEvents = enabled ? "none" : "auto";

  const offsetControls = root.querySelector(".final-head-offset-controls");
  if (offsetControls) offsetControls.hidden = enabled;

  const finalHint = root.querySelector(".final-preview-section > .helper-text");
  if (finalHint && enabled) {
    finalHint.textContent = game.i18n.localize("PORTRAIT_SPRITES.Creator.SingleImageFinalHint");
  }
}

function drawBodyFrameOutline(context, body) {
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

function drawSingleImageSourcePreview(application) {
  const canvasElement = application.element?.querySelector?.(".sprite-preview-canvas");
  const image = application.previewImage;
  if (!canvasElement || !image) return;
  const context = canvasElement.getContext("2d");
  if (!context) return;

  canvasElement.width = Math.max(1, image.naturalWidth || image.width || 1);
  canvasElement.height = Math.max(1, image.naturalHeight || image.height || 1);
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.drawImage(image, 0, 0);
  drawBodyFrameOutline(context, application.formData.bodyFrame);
}

function drawMagnifier(sourceCanvas, magnifierCanvas, application) {
  const context = magnifierCanvas?.getContext?.("2d");
  if (!context || !sourceCanvas?.width || !sourceCanvas?.height) return;
  context.clearRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
  context.imageSmoothingEnabled = false;

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
}

function drawSingleImageFinalPreview(application) {
  const canvasElement = application.element?.querySelector?.(".final-sprite-preview-canvas");
  const magnifierCanvas = application.element?.querySelector?.(".final-magnifier-canvas");
  const image = application.previewImage;
  const body = application.formData?.bodyFrame;
  if (!canvasElement || !image || !body) return;

  const context = canvasElement.getContext("2d");
  if (!context) return;
  canvasElement.width = Math.max(1, finiteNumber(body.width, 1));
  canvasElement.height = Math.max(1, finiteNumber(body.height, 1));
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    finiteNumber(body.x),
    finiteNumber(body.y),
    Math.max(1, finiteNumber(body.width, 1)),
    Math.max(1, finiteNumber(body.height, 1)),
    0,
    0,
    canvasElement.width,
    canvasElement.height
  );
  drawMagnifier(canvasElement, magnifierCanvas, application);
}

function clearSingleImagePreviewTimers(application) {
  if (application._singleImagePreviewTimeout) {
    clearTimeout(application._singleImagePreviewTimeout);
    application._singleImagePreviewTimeout = null;
  }
}

function takeOverSingleImagePreviews(application) {
  if (application.finalPreviewInterval) {
    clearInterval(application.finalPreviewInterval);
    application.finalPreviewInterval = null;
  }
  if (application.finalPreviewTakeoverTimeout) {
    clearTimeout(application.finalPreviewTakeoverTimeout);
    application.finalPreviewTakeoverTimeout = null;
  }
  clearSingleImagePreviewTimers(application);

  application.finalPreviewShowsExpression = false;
  drawSingleImageSourcePreview(application);
  drawSingleImageFinalPreview(application);

  const previousImage = application.previewImage;
  let polls = 0;
  const check = () => {
    if (!application.element?.isConnected || !application.singleImageMode) return;
    if (application.finalPreviewInterval) {
      clearInterval(application.finalPreviewInterval);
      application.finalPreviewInterval = null;
    }
    if (application.finalPreviewTakeoverTimeout) {
      clearTimeout(application.finalPreviewTakeoverTimeout);
      application.finalPreviewTakeoverTimeout = null;
    }

    polls += 1;
    if (application.previewImage && application.previewImage !== previousImage) {
      drawSingleImageSourcePreview(application);
      drawSingleImageFinalPreview(application);
      application._singleImagePreviewTimeout = null;
      return;
    }
    if (polls >= IMAGE_READY_MAX_POLLS) {
      application._singleImagePreviewTimeout = null;
      return;
    }
    application._singleImagePreviewTimeout = setTimeout(check, IMAGE_READY_POLL_MS);
  };
  application._singleImagePreviewTimeout = setTimeout(check, IMAGE_READY_POLL_MS);
}

async function createSingleImageSprite(application) {
  if (!application.formData?.spritesheet) {
    ui.notifications.warn(game.i18n.localize("PORTRAIT_SPRITES.Creator.Errors.MissingSpritesheet"));
    return;
  }

  const spriteData = await window.PortraitSprites?.addSprite?.({
    spritesheet: application.formData.spritesheet,
    bodyFrame: foundry.utils.deepClone(application.formData.bodyFrame),
    headFrames: [],
    headOffset: { x: 0, y: 0 },
    currentExpression: NO_EXPRESSION
  });
  if (spriteData) ui.notifications.info(game.i18n.localize("PORTRAIT_SPRITES.Creator.Messages.Created"));
}

function installCreateInterceptor(application) {
  const button = application.element?.querySelector?.("[data-action='create-sprite']");
  if (!button) return;
  button.addEventListener("click", async event => {
    if (!application.singleImageMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await createSingleImageSprite(application);
  }, true);
}

async function saveSingleImageEdits(application) {
  if (!application.formData?.spritesheet) {
    ui.notifications.warn(game.i18n.localize("PORTRAIT_SPRITES.Creator.Errors.MissingSpritesheet"));
    return;
  }

  const updates = {
    spritesheet: application.formData.spritesheet,
    bodyFrame: foundry.utils.deepClone(application.formData.bodyFrame),
    headFrames: [],
    headOffset: { x: 0, y: 0 },
    currentExpression: NO_EXPRESSION
  };

  let spriteData = await updateSceneSprite(application.sprite.id, entry => ({ ...entry, ...updates }));
  if (!spriteData) return;

  const libraryEntry = await rememberSpriteTemplate(spriteData);
  if (libraryEntry) {
    spriteData = await updateSceneSprite(application.sprite.id, entry => ({
      ...entry,
      libraryId: libraryEntry.id,
      name: libraryEntry.name
    })) ?? spriteData;
  }

  const layer = canvas.portraitSprites;
  if (layer) {
    const wasSelected = application.sprite.selected;
    layer.removeSprite(application.sprite.id);
    const replacement = await layer.createSprite(spriteData);
    if (wasSelected) layer.selectSprite?.(replacement);
  }

  ui.notifications.info(game.i18n.localize("PORTRAIT_SPRITES.Creator.Messages.Updated"));
  await application.close();
}

function adjustContextMenuForExpressions(sprite, menu) {
  if (!menu?.children?.length) return menu;
  const rows = menu.children.slice(1);
  if (rows.length < 2) return menu;

  const expressionRow = rows[1];
  expressionRow.visible = (sprite.headFrames?.length ?? 0) > 0;

  let visibleIndex = 0;
  for (const row of rows) {
    if (!row.visible) continue;
    row.position.y = MENU_PADDING + visibleIndex * MENU_ROW_HEIGHT;
    visibleIndex += 1;
  }

  const height = MENU_PADDING * 2 + visibleIndex * MENU_ROW_HEIGHT;
  menu.hitArea = new PIXI.Rectangle(0, 0, MENU_WIDTH, height);
  const background = menu.children[0];
  if (background?.clear) {
    background.clear();
    background.beginFill(0x111318, 0.98);
    background.lineStyle(1.5, 0x6b7280, 1);
    background.drawRoundedRect(0, 0, MENU_WIDTH, height, 7);
    background.endFill();
  }
  return menu;
}

/**
 * Add the creator/editor UI and body-only scene behavior after the existing UI
 * wrappers have been installed. This keeps atlas creation unchanged unless the
 * GM explicitly enables Single Image mode.
 */
export function installSingleImageUiSupport(PortraitSpriteCreator, CountAwarePortraitSpriteEditor, PortraitSprite) {
  if (PortraitSpriteCreator.prototype.singleImageUiInstalled) return;

  Object.defineProperty(PortraitSpriteCreator.prototype, "singleImageUiInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalOnRender = PortraitSpriteCreator.prototype._onRender;
  const originalClose = PortraitSpriteCreator.prototype.close;
  PortraitSpriteCreator.prototype._onRender = function(...args) {
    const result = originalOnRender.apply(this, args);
    initializeMode(this);
    createToggle(this);

    if (this.singleImageMode) {
      this.formData.expressionCount = 0;
      if (this.formData.spritesheet && this._singleImageConfiguredSpritesheet !== this.formData.spritesheet) {
        configureBodyFromWholeImage(this).then(() => {
          if (this.element?.isConnected && this.singleImageMode) this.render(false);
        });
      }
      setSingleImageLayout(this);
      installCreateInterceptor(this);
      takeOverSingleImagePreviews(this);
    } else {
      clearSingleImagePreviewTimers(this);
      setSingleImageLayout(this);
      installCreateInterceptor(this);
    }
    return result;
  };

  PortraitSpriteCreator.prototype.close = async function(...args) {
    clearSingleImagePreviewTimers(this);
    return originalClose.apply(this, args);
  };

  const originalSaveSpriteEdits = CountAwarePortraitSpriteEditor.prototype.saveSpriteEdits;
  CountAwarePortraitSpriteEditor.prototype.saveSpriteEdits = async function(...args) {
    initializeMode(this);
    if (this.singleImageMode) return saveSingleImageEdits(this);
    return originalSaveSpriteEdits.apply(this, args);
  };

  const originalEnsureSpriteActionMenu = PortraitSprite.prototype.ensureSpriteActionMenu;
  if (originalEnsureSpriteActionMenu) {
    PortraitSprite.prototype.ensureSpriteActionMenu = function(...args) {
      const menu = originalEnsureSpriteActionMenu.apply(this, args);
      return adjustContextMenuForExpressions(this, menu);
    };
  }
}
