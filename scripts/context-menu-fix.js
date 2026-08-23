const MENU_WIDTH = 190;
const MENU_ROW_HEIGHT = 38;
const MENU_PADDING = 6;
const MENU_GAP = 10;
const MENU_HEIGHT = MENU_PADDING * 2 + MENU_ROW_HEIGHT * 3;

function getNativeEvent(event) {
  return event?.nativeEvent
    ?? event?.data?.originalEvent
    ?? event?.originalEvent
    ?? event;
}

function stopEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

function stopCanvasEvent(event) {
  stopEvent(event);
  const nativeEvent = getNativeEvent(event);
  if (nativeEvent !== event) stopEvent(nativeEvent);
}

function resetCanvasMouseWorkflow() {
  // Foundry's MouseInteractionManager keeps a global current manager while a
  // click is eligible to become a drag. Cancel without forwarding the already
  // prevented event, otherwise its defaultPrevented flag can preserve DRAG.
  try {
    canvas?.currentMouseManager?.cancel?.();
  } catch (error) {
    console.warn("Portrait Sprites | Failed to cancel the current mouse workflow", error);
  }

  try {
    canvas?.mouseInteractionManager?.reset?.({ state: false });
  } catch (error) {
    console.warn("Portrait Sprites | Failed to reset the canvas mouse manager", error);
  }
}

function getLocalPointerPosition(event, target) {
  if (typeof event?.getLocalPosition === "function") return event.getLocalPosition(target);
  return event?.data?.getLocalPosition?.(target) ?? new PIXI.Point();
}

function createText(text, style) {
  const resolvedStyle = PIXI.TextStyle ? new PIXI.TextStyle(style) : style;
  return new PIXI.Text(String(text), resolvedStyle);
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
    if ((event?.button ?? event?.data?.button ?? 0) !== 0) return;
    stopCanvasEvent(event);
    resetCanvasMouseWorkflow();
    await onActivate();
  });

  return row;
}

function createCanvasMenu(sprite, PortraitSpriteEditor, PortraitExpressionPicker) {
  const menu = new PIXI.Container();
  menu.eventMode = "static";
  menu.interactiveChildren = true;
  menu.visible = false;
  menu.hitArea = new PIXI.Rectangle(0, 0, MENU_WIDTH, MENU_HEIGHT);

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

function clampMenuPosition(point) {
  const bounds = canvas?.dimensions?.rect;
  if (!bounds) return new PIXI.Point(point.x + MENU_GAP, point.y + MENU_GAP);

  return new PIXI.Point(
    Math.max(bounds.x, Math.min(point.x + MENU_GAP, bounds.x + bounds.width - MENU_WIDTH)),
    Math.max(bounds.y, Math.min(point.y + MENU_GAP, bounds.y + bounds.height - MENU_HEIGHT))
  );
}

/**
 * Open the native PIXI action menu from a completed right-click. Consume the
 * preceding right-button press and release on the sprite so Foundry's canvas
 * pan manager never enters a drag-ready state for that gesture.
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
  const originalSetSelected = PortraitSprite.prototype.setSelected;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    const result = originalLayerSetInteractionActive.call(this, active);

    // The base portrait layer installed its own raw rightdown handler. Sprite
    // gestures below own the complete right-button lifecycle instead.
    this.removeAllListeners?.("rightdown");
    if (!active) {
      resetCanvasMouseWorkflow();
      for (const sprite of this.sprites?.values?.() ?? []) sprite.closeSpriteActionMenu?.();
    }
    return result;
  };

  PortraitSprite.prototype.ensureSpriteActionMenu = function() {
    const layer = this.parent;
    if (!layer) return null;

    if (!this.spriteActionMenu) {
      this.spriteActionMenu = createCanvasMenu(this, PortraitSpriteEditor, PortraitExpressionPicker);
    }
    if (this.spriteActionMenu.parent !== layer) layer.addChild(this.spriteActionMenu);
    return this.spriteActionMenu;
  };

  PortraitSprite.prototype.closeSpriteActionMenu = function() {
    if (this.spriteActionMenu) this.spriteActionMenu.visible = false;
    resetCanvasMouseWorkflow();
  };

  PortraitSprite.prototype.openSpriteActionMenu = function(event) {
    const layer = this.parent;
    if (!layer?.interactionActive) return;

    resetCanvasMouseWorkflow();
    for (const sprite of layer.sprites?.values?.() ?? []) {
      if (sprite !== this) sprite.closeSpriteActionMenu?.();
    }

    if (!this.selected) {
      layer.selectSprite?.(this, {
        additive: Boolean(event?.shiftKey),
        toggle: false
      });
    }

    const menu = this.ensureSpriteActionMenu();
    if (!menu) return;

    const point = getLocalPointerPosition(event, layer);
    const position = clampMenuPosition(point);
    menu.position.set(position.x, position.y);
    layer.addChild(menu);
    menu.visible = true;
  };

  PortraitSprite.prototype.toggleSpriteActionMenu = function(event) {
    const menu = this.ensureSpriteActionMenu();
    if (!menu) return;
    if (menu.visible) this.closeSpriteActionMenu();
    else this.openSpriteActionMenu(event);
  };

  PortraitSprite.prototype.showHud = function(event) {
    this.toggleSpriteActionMenu(event);
  };

  PortraitSprite.prototype.draw = async function(...args) {
    await originalDraw.apply(this, args);

    // Foundry placeables consume the initial right-button press through their
    // MouseInteractionManager. This sprite is not a PlaceableObject, so mirror
    // that part explicitly, while still opening the menu on completed click.
    this.removeAllListeners?.("rightdown");
    this.removeAllListeners?.("rightup");
    this.removeAllListeners?.("rightupoutside");
    this.removeAllListeners?.("rightclick");

    this.on("rightdown", event => {
      if (!this.parent?.interactionActive) return;
      stopCanvasEvent(event);
      resetCanvasMouseWorkflow();
      this.spriteRightButtonDown = true;
    });

    const finishRightButton = event => {
      if (!this.spriteRightButtonDown) return;
      stopCanvasEvent(event);
      resetCanvasMouseWorkflow();
      this.spriteRightButtonDown = false;
    };

    this.on("rightup", finishRightButton);
    this.on("rightupoutside", finishRightButton);
    this.on("rightclick", event => {
      if (!this.parent?.interactionActive) return;
      stopCanvasEvent(event);
      resetCanvasMouseWorkflow();
      this.spriteRightButtonDown = false;
      this.showHud(event);
    });
  };

  PortraitSprite.prototype.setSelected = function(selected) {
    const result = originalSetSelected.call(this, selected);
    if (!selected) this.closeSpriteActionMenu();
    return result;
  };

  PortraitSprite.prototype.destroy = function(options) {
    this.spriteRightButtonDown = false;
    if (this.spriteActionMenu) {
      this.spriteActionMenu.destroy({ children: true });
      this.spriteActionMenu = null;
    }
    return originalDestroy.call(this, options);
  };
}
