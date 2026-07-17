const ACTION_BUTTON_SIZE = 34;
const ACTION_BUTTON_X_OFFSET = 34;
const ACTION_BUTTON_Y_OFFSET = 24;
const MENU_WIDTH = 190;
const MENU_ROW_HEIGHT = 38;
const MENU_PADDING = 6;
const MENU_GAP = 12;
const MENU_X_OFFSET = ACTION_BUTTON_X_OFFSET + (ACTION_BUTTON_SIZE / 2) + MENU_GAP;
const MENU_Y_OFFSET = 0;
const MENU_HEIGHT = MENU_PADDING * 2 + MENU_ROW_HEIGHT * 3;

function getNativeEvent(event) {
  return event?.nativeEvent
    ?? event?.data?.originalEvent
    ?? event?.originalEvent
    ?? event;
}

function getPointerButton(event) {
  return event?.button ?? event?.data?.button ?? getNativeEvent(event)?.button ?? 0;
}

function stopEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

function getContentBounds(sprite) {
  return sprite.transformContentBounds ?? sprite.hitArea;
}

function getInverseScale(sprite) {
  return {
    x: 1 / Math.max(0.01, Math.abs(sprite.spriteScaleX ?? sprite.scale?.x ?? 1)),
    y: 1 / Math.max(0.01, Math.abs(sprite.spriteScaleY ?? sprite.scale?.y ?? 1))
  };
}

function createText(text, style) {
  const resolvedStyle = PIXI.TextStyle ? new PIXI.TextStyle(style) : style;
  return new PIXI.Text(String(text), resolvedStyle);
}

function drawActionButton() {
  const button = new PIXI.Container();
  button.eventMode = "static";
  button.interactive = true;
  button.cursor = "pointer";
  button.hitArea = new PIXI.Circle(0, 0, ACTION_BUTTON_SIZE / 2);

  const background = new PIXI.Graphics();
  background.beginFill(0x1f2937, 0.98);
  background.lineStyle(2.5, 0xffc107, 1);
  background.drawCircle(0, 0, ACTION_BUTTON_SIZE / 2);
  background.endFill();
  background.eventMode = "none";
  button.addChild(background);

  const dots = new PIXI.Graphics();
  dots.beginFill(0xffffff, 1);
  for (const x of [-7, 0, 7]) dots.drawCircle(x, 0, 2.2);
  dots.endFill();
  dots.eventMode = "none";
  button.addChild(dots);

  return button;
}

function drawMenuRow(background, hovered = false) {
  background.clear();
  background.beginFill(hovered ? 0x374151 : 0x242a33, hovered ? 1 : 0.98);
  background.drawRoundedRect(0, 0, MENU_WIDTH - MENU_PADDING * 2, MENU_ROW_HEIGHT - 2, 5);
  background.endFill();
}

function createMenuRow(labelText, onActivate) {
  const row = new PIXI.Container();
  row.eventMode = "static";
  row.interactive = true;
  row.cursor = "pointer";
  row.hitArea = new PIXI.Rectangle(0, 0, MENU_WIDTH - MENU_PADDING * 2, MENU_ROW_HEIGHT - 2);

  const background = new PIXI.Graphics();
  drawMenuRow(background, false);
  background.eventMode = "none";
  row.addChild(background);

  const label = createText(labelText, {
    fill: 0xf9fafb,
    fontFamily: "Arial, sans-serif",
    fontSize: 15,
    fontWeight: "600"
  });
  label.anchor?.set?.(0, 0.5);
  label.position.set(12, (MENU_ROW_HEIGHT - 2) / 2);
  label.eventMode = "none";
  row.addChild(label);

  row.on("pointerover", () => drawMenuRow(background, true));
  row.on("pointerout", () => drawMenuRow(background, false));
  row.on("pointerdown", async event => {
    if (getPointerButton(event) !== 0) return;
    stopEvent(event);
    const nativeEvent = getNativeEvent(event);
    if (nativeEvent !== event) stopEvent(nativeEvent);
    await onActivate();
  });

  return row;
}

function createCanvasMenu(sprite, PortraitSpriteEditor, PortraitExpressionPicker) {
  const menu = new PIXI.Container();
  menu.eventMode = "static";
  menu.interactive = true;
  menu.interactiveChildren = true;
  menu.visible = false;

  const background = new PIXI.Graphics();
  background.beginFill(0x111318, 0.98);
  background.lineStyle(1.5, 0x6b7280, 1);
  background.drawRoundedRect(0, 0, MENU_WIDTH, MENU_HEIGHT, 7);
  background.endFill();
  background.eventMode = "none";
  menu.addChild(background);

  const actions = [
    {
      label: game.i18n.localize("PORTRAIT_SPRITES.ContextMenu.Edit"),
      activate: async () => {
        sprite.closeSpriteActionMenu();
        sprite.expressionPicker?.close?.();
        sprite.spriteEditor?.close?.();
        const editor = new PortraitSpriteEditor(sprite);
        sprite.spriteEditor = editor;
        editor.render(true);
      }
    },
    {
      label: game.i18n.localize("PORTRAIT_SPRITES.ContextMenu.Expressions"),
      activate: async () => {
        sprite.closeSpriteActionMenu();
        sprite.expressionPicker?.close?.();
        const picker = new PortraitExpressionPicker(sprite);
        sprite.expressionPicker = picker;
        picker.render(true);
      }
    },
    {
      label: game.i18n.localize("PORTRAIT_SPRITES.ContextMenu.Reset"),
      activate: async () => {
        sprite.closeSpriteActionMenu();
        await sprite.resetSize?.();
      }
    }
  ];

  actions.forEach((action, index) => {
    const row = createMenuRow(action.label, action.activate);
    row.position.set(MENU_PADDING, MENU_PADDING + index * MENU_ROW_HEIGHT);
    menu.addChild(row);
  });

  return menu;
}

/**
 * Use a native PIXI canvas launcher instead of a frameless Foundry application.
 * Foundry reserves right-drag for canvas panning, so the launcher is opened from
 * a left-clickable ellipsis button shown beside the transform handles.
 */
export function installContextMenuFix(
  PortraitSpritesLayer,
  PortraitSprite,
  PortraitSpriteEditor,
  PortraitExpressionPicker
) {
  if (PortraitSprite.prototype.contextMenuFixInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "contextMenuFixInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalLayerSetInteractionActive = PortraitSpritesLayer.prototype.setInteractionActive;
  const originalDraw = PortraitSprite.prototype.draw;
  const originalRefreshTransformEventHitArea = PortraitSprite.prototype.refreshTransformEventHitArea;
  const originalUpdateTransformHandles = PortraitSprite.prototype.updateTransformHandles;
  const originalSetSelected = PortraitSprite.prototype.setSelected;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    const result = originalLayerSetInteractionActive.call(this, active);
    this.removeAllListeners?.("rightdown");
    return result;
  };

  PortraitSprite.prototype.closeSpriteActionMenu = function() {
    if (!this.spriteActionMenu) return;
    this.spriteActionMenu.visible = false;
    this.refreshTransformEventHitArea?.();
  };

  PortraitSprite.prototype.toggleSpriteActionMenu = function() {
    this.ensureSpriteActionControls();
    if (!this.spriteActionMenu) return;
    this.spriteActionMenu.visible = !this.spriteActionMenu.visible;
    this.refreshTransformEventHitArea?.();
    this.updateSpriteActionControls();
  };

  PortraitSprite.prototype.ensureSpriteActionControls = function() {
    if (!this.transformHandles) return;

    if (!this.spriteActionButton) {
      const button = drawActionButton();
      button.on("pointerdown", event => {
        if (getPointerButton(event) !== 0) return;
        stopEvent(event);
        const nativeEvent = getNativeEvent(event);
        if (nativeEvent !== event) stopEvent(nativeEvent);
        this.toggleSpriteActionMenu();
      });
      this.spriteActionButton = button;
      this.transformHandles.addChild(button);
    }

    if (!this.spriteActionMenu) {
      this.spriteActionMenu = createCanvasMenu(this, PortraitSpriteEditor, PortraitExpressionPicker);
      this.transformHandles.addChild(this.spriteActionMenu);
    }

    this.updateSpriteActionControls();
  };

  PortraitSprite.prototype.updateSpriteActionControls = function() {
    const bounds = getContentBounds(this);
    if (!bounds) return;

    const inverse = getInverseScale(this);
    if (this.spriteActionButton) {
      this.spriteActionButton.position.set(
        bounds.x + bounds.width + ACTION_BUTTON_X_OFFSET * inverse.x,
        bounds.y + ACTION_BUTTON_Y_OFFSET * inverse.y
      );
      this.spriteActionButton.scale.set(inverse.x, inverse.y);
      this.spriteActionButton.visible = Boolean(this.selected);
    }

    if (this.spriteActionMenu) {
      this.spriteActionMenu.position.set(
        bounds.x + bounds.width + MENU_X_OFFSET * inverse.x,
        bounds.y + MENU_Y_OFFSET * inverse.y
      );
      this.spriteActionMenu.scale.set(inverse.x, inverse.y);
      if (!this.selected) this.spriteActionMenu.visible = false;
    }
  };

  PortraitSprite.prototype.refreshTransformEventHitArea = function(...args) {
    const result = originalRefreshTransformEventHitArea?.apply(this, args);
    const bounds = getContentBounds(this);
    const area = this.transformEventHitArea;
    if (!bounds || !area) return result;

    const inverse = getInverseScale(this);
    const buttonRight = bounds.x + bounds.width
      + (ACTION_BUTTON_X_OFFSET + ACTION_BUTTON_SIZE / 2 + 4) * inverse.x;
    const buttonBottom = bounds.y
      + (ACTION_BUTTON_Y_OFFSET + ACTION_BUTTON_SIZE / 2 + 4) * inverse.y;
    const menuRight = bounds.x + bounds.width + (MENU_X_OFFSET + MENU_WIDTH) * inverse.x;
    const menuBottom = bounds.y + (MENU_Y_OFFSET + MENU_HEIGHT) * inverse.y;
    const requiredRight = this.spriteActionMenu?.visible ? menuRight : buttonRight;
    const requiredBottom = this.spriteActionMenu?.visible
      ? Math.max(buttonBottom, menuBottom)
      : buttonBottom;

    area.width = Math.max(area.width, requiredRight - area.x);
    area.height = Math.max(area.height, requiredBottom - area.y);
    this.hitArea = area;
    return result;
  };

  PortraitSprite.prototype.draw = async function(...args) {
    await originalDraw.apply(this, args);
    this.removeAllListeners?.("rightdown");
    this.removeAllListeners?.("rightclick");
    this.ensureSpriteActionControls();
    this.refreshTransformEventHitArea?.();
  };

  PortraitSprite.prototype.updateTransformHandles = function(...args) {
    const result = originalUpdateTransformHandles?.apply(this, args);
    this.ensureSpriteActionControls();
    this.updateSpriteActionControls();
    return result;
  };

  PortraitSprite.prototype.setSelected = function(selected) {
    const result = originalSetSelected.call(this, selected);
    this.ensureSpriteActionControls();
    if (!selected) this.closeSpriteActionMenu();
    this.updateSpriteActionControls();
    return result;
  };

  // Right-click is intentionally left to Foundry's native canvas controls.
  PortraitSprite.prototype.showHud = function() {};

  PortraitSprite.prototype.destroy = function(options) {
    this.spriteActionMenu = null;
    this.spriteActionButton = null;
    return originalDestroy.call(this, options);
  };
}