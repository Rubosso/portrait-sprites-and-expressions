import { TEMPLATES } from "./constants.js";
import { PortraitSpriteCreator } from "./creator.js";
import { NO_EXPRESSION } from "./no-expression.js";
import { updateSceneSprite } from "./scene-flags.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getPointerPosition(event) {
  const nativeEvent = event?.nativeEvent ?? event?.data?.originalEvent ?? event;
  return {
    x: Number(nativeEvent?.clientX ?? window.innerWidth / 2),
    y: Number(nativeEvent?.clientY ?? window.innerHeight / 2)
  };
}

function clampWindowPosition(application, point) {
  const rectangle = application.element?.getBoundingClientRect?.();
  if (!rectangle) return;

  const margin = 8;
  const left = Math.max(margin, Math.min(window.innerWidth - rectangle.width - margin, point.x));
  const top = Math.max(margin, Math.min(window.innerHeight - rectangle.height - margin, point.y));
  application.setPosition?.({ left, top });
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

function getCompositeBounds(sprite, expressionIndex) {
  const body = sprite.bodyFrame;
  const frame = expressionIndex === NO_EXPRESSION ? null : sprite.headFrames[expressionIndex];
  if (!frame) return { x: 0, y: 0, width: body.width, height: body.height };

  const minX = Math.min(0, sprite.headOffset.x);
  const minY = Math.min(0, sprite.headOffset.y);
  const maxX = Math.max(body.width, sprite.headOffset.x + frame.width);
  const maxY = Math.max(body.height, sprite.headOffset.y + frame.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function drawExpressionPreview(canvasElement, image, sprite, expressionIndex) {
  const context = canvasElement.getContext("2d");
  if (!context || !image) return;

  const frame = expressionIndex === NO_EXPRESSION ? null : sprite.headFrames[expressionIndex];
  const bounds = getCompositeBounds(sprite, expressionIndex);
  const padding = 10;
  const scale = Math.min(
    (canvasElement.width - padding * 2) / Math.max(1, bounds.width),
    (canvasElement.height - padding * 2) / Math.max(1, bounds.height)
  );
  const offsetX = (canvasElement.width - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (canvasElement.height - bounds.height * scale) / 2 - bounds.y * scale;

  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    sprite.bodyFrame.x,
    sprite.bodyFrame.y,
    sprite.bodyFrame.width,
    sprite.bodyFrame.height,
    offsetX,
    offsetY,
    sprite.bodyFrame.width * scale,
    sprite.bodyFrame.height * scale
  );

  if (!frame) return;
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    offsetX + sprite.headOffset.x * scale,
    offsetY + sprite.headOffset.y * scale,
    frame.width * scale,
    frame.height * scale
  );
}

function inferHeadGrid(headFrames) {
  const frames = Array.isArray(headFrames) ? headFrames : [];
  const first = frames[0] ?? { x: 0, y: 0, width: 1, height: 1 };
  const xValues = [...new Set(frames.map(frame => frame.x))].sort((a, b) => a - b);
  const yValues = [...new Set(frames.map(frame => frame.y))].sort((a, b) => a - b);
  const isRegularGrid = frames.length > 0 && xValues.length * yValues.length === frames.length;

  if (isRegularGrid) {
    return {
      startX: xValues[0],
      startY: yValues[0],
      cellWidth: first.width,
      cellHeight: first.height,
      columns: xValues.length,
      rows: yValues.length
    };
  }

  return {
    startX: first.x,
    startY: first.y,
    cellWidth: first.width,
    cellHeight: first.height,
    columns: Math.max(1, frames.length),
    rows: 1
  };
}

function buildEditorData(sprite) {
  return {
    spritesheet: sprite.spritesheet,
    bodyFrame: { ...sprite.bodyFrame },
    headGrid: inferHeadGrid(sprite.headFrames),
    headOffset: { ...sprite.headOffset },
    expressionNames: sprite.headFrames.map((frame, index) => (
      frame.name || game.i18n.format("PORTRAIT_SPRITES.Creator.DefaultExpressionName", { index: index + 1 })
    )),
    imageWidth: 0,
    imageHeight: 0,
    configuredSpritesheet: sprite.spritesheet
  };
}

function buildHeadFrames(formData) {
  const columns = Math.max(1, Number(formData.headGrid.columns) || 1);
  const rows = Math.max(1, Number(formData.headGrid.rows) || 1);
  const count = columns * rows;
  const names = Array.isArray(formData.expressionNames) ? formData.expressionNames : [];
  const frames = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    frames.push({
      x: Number(formData.headGrid.startX) + column * Number(formData.headGrid.cellWidth),
      y: Number(formData.headGrid.startY) + row * Number(formData.headGrid.cellHeight),
      width: Math.max(1, Number(formData.headGrid.cellWidth)),
      height: Math.max(1, Number(formData.headGrid.cellHeight)),
      name: names[index] || game.i18n.format("PORTRAIT_SPRITES.Creator.DefaultExpressionName", { index: index + 1 })
    });
  }

  return frames;
}

class SpriteContextMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(sprite, event, options = {}) {
    super(options);
    this.sprite = sprite;
    this.pointerPosition = getPointerPosition(event);
  }

  static DEFAULT_OPTIONS = {
    id: "portrait-sprite-context-menu",
    classes: ["portrait-sprite-context-menu"],
    position: { width: 220, height: "auto" },
    window: { frame: false, resizable: false }
  };

  static PARTS = {
    content: { template: TEMPLATES.contextMenu }
  };

  updatePointer(event) {
    this.pointerPosition = getPointerPosition(event);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    clampWindowPosition(this, this.pointerPosition);

    this.element.querySelector("[data-action='edit']")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.close();
      this.sprite.expressionPicker?.close?.();
      const editor = new PortraitSpriteEditor(this.sprite);
      this.sprite.spriteEditor = editor;
      editor.render(true);
    });

    this.element.querySelector("[data-action='expressions']")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.close();
      this.sprite.expressionPicker?.close?.();
      const picker = new PortraitExpressionPicker(this.sprite);
      this.sprite.expressionPicker = picker;
      picker.render(true);
    });

    this.element.querySelector("[data-action='reset']")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.sprite.resetSize?.();
      await this.close();
    });
  }
}

class PortraitExpressionPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(sprite, options = {}) {
    super(options);
    this.sprite = sprite;
  }

  static DEFAULT_OPTIONS = {
    id: "portrait-expression-picker",
    classes: ["portrait-expression-picker"],
    position: { width: 760, height: 620 },
    window: {
      title: "PORTRAIT_SPRITES.ExpressionPicker.Title",
      frame: true,
      resizable: true
    }
  };

  static PARTS = {
    content: { template: TEMPLATES.expressionPicker }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const noExpressionLabel = game.i18n.localize("PORTRAIT_SPRITES.HUD.NoExpression");
    return {
      ...context,
      expressions: [
        {
          index: NO_EXPRESSION,
          label: noExpressionLabel,
          isActive: this.sprite.currentExpression === NO_EXPRESSION
        },
        ...this.sprite.headFrames.map((frame, index) => ({
          index,
          label: frame.name || game.i18n.format("PORTRAIT_SPRITES.HUD.ExpressionNumber", { index: index + 1 }),
          isActive: this.sprite.currentExpression === index
        }))
      ]
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    this.element.querySelectorAll("[data-expression-index]").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const index = Number(event.currentTarget.dataset.expressionIndex);
        if (!Number.isInteger(index)) return;
        this.sprite.currentExpression = index;
        this.sprite.updateExpression();
        await this.sprite._saveToScene();
        this.render(false);
      });
    });

    loadImage(this.sprite.spritesheet).then(image => {
      if (!image || !this.element?.isConnected) return;
      this.element.querySelectorAll(".expression-choice-preview").forEach(canvasElement => {
        const index = Number(canvasElement.dataset.expressionIndex);
        if (!Number.isInteger(index)) return;
        drawExpressionPreview(canvasElement, image, this.sprite, index);
      });
    });
  }

  async close(options = {}) {
    const result = await super.close(options);
    if (this.sprite.expressionPicker === this) this.sprite.expressionPicker = null;
    return result;
  }
}

class PortraitSpriteEditor extends PortraitSpriteCreator {
  constructor(sprite, options = {}) {
    super({
      ...options,
      id: `portrait-sprite-editor-${sprite.id}`,
      classes: ["portrait-sprite-creator", "portrait-sprite-editor"],
      position: { width: 980, height: 760, ...(options.position ?? {}) },
      window: {
        title: "PORTRAIT_SPRITES.Creator.EditTitle",
        frame: true,
        resizable: true,
        ...(options.window ?? {})
      }
    });
    this.sprite = sprite;
    this.formData = buildEditorData(sprite);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, isEditing: true };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='save-sprite']")?.addEventListener("click", async event => {
      event.preventDefault();
      await this.saveSpriteEdits();
    });
  }

  async saveSpriteEdits() {
    if (!this.formData.spritesheet) {
      ui.notifications.warn(game.i18n.localize("PORTRAIT_SPRITES.Creator.Errors.MissingSpritesheet"));
      return;
    }

    const headFrames = buildHeadFrames(this.formData);
    const currentExpression = this.sprite.currentExpression === NO_EXPRESSION
      ? NO_EXPRESSION
      : Math.min(Math.max(0, this.sprite.currentExpression), headFrames.length - 1);
    const updates = {
      spritesheet: this.formData.spritesheet,
      bodyFrame: { ...this.formData.bodyFrame },
      headFrames,
      headOffset: { ...this.formData.headOffset },
      currentExpression
    };

    const spriteData = await updateSceneSprite(this.sprite.id, entry => ({ ...entry, ...updates }));
    const layer = canvas.portraitSprites;
    if (layer && spriteData) {
      const wasSelected = this.sprite.selected;
      layer.removeSprite(this.sprite.id);
      const replacement = await layer.createSprite(spriteData);
      if (wasSelected) layer.selectSprite?.(replacement);
    }

    ui.notifications.info(game.i18n.localize("PORTRAIT_SPRITES.Creator.Messages.Updated"));
    await this.close();
  }

  async close(options = {}) {
    const result = await super.close(options);
    if (this.sprite.spriteEditor === this) this.sprite.spriteEditor = null;
    return result;
  }
}

export function installSpriteMenus(PortraitSprite) {
  if (PortraitSprite.prototype.spriteMenusInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "spriteMenusInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalSetSelected = PortraitSprite.prototype.setSelected;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSprite.prototype.showHud = function(event) {
    this.parent?.selectSprite?.(this);

    if (this.transformHud instanceof SpriteContextMenu) {
      this.transformHud.updatePointer(event);
      this.transformHud.render(true);
      return;
    }

    this.transformHud?.close?.();
    const menu = new SpriteContextMenu(this, event);
    this.transformHud = menu;
    const originalClose = menu.close.bind(menu);
    menu.close = async (...args) => {
      const result = await originalClose(...args);
      if (this.transformHud === menu) this.transformHud = null;
      return result;
    };
    menu.render(true);
  };

  PortraitSprite.prototype.setSelected = function(selected) {
    originalSetSelected.call(this, selected);
    if (!selected) this.expressionPicker?.close?.();
  };

  PortraitSprite.prototype.destroy = function(options) {
    this.expressionPicker?.close?.();
    this.spriteEditor = null;
    return originalDestroy.call(this, options);
  };
}

export { PortraitExpressionPicker, PortraitSpriteEditor, SpriteContextMenu };
