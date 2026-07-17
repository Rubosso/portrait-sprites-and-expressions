const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_MARGIN = 8;
const ACTION_BUTTON_SIZE = 24;
const ACTION_BUTTON_X_OFFSET = 12;
const ACTION_BUTTON_Y_OFFSET = 28;

function getNativeEvent(event) {
  return event?.nativeEvent
    ?? event?.data?.originalEvent
    ?? event?.originalEvent
    ?? event;
}

function getPointerButton(event) {
  return event?.button ?? event?.data?.button ?? getNativeEvent(event)?.button ?? 0;
}

function getPointerPosition(event) {
  const nativeEvent = getNativeEvent(event);
  return {
    x: Number(nativeEvent?.clientX ?? window.innerWidth / 2),
    y: Number(nativeEvent?.clientY ?? window.innerHeight / 2)
  };
}

function stopEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

function clampMenuPosition(menu, point) {
  const rectangle = menu.element?.getBoundingClientRect?.();
  const width = rectangle?.width || CONTEXT_MENU_WIDTH;
  const height = rectangle?.height || 112;
  const left = Math.max(
    CONTEXT_MENU_MARGIN,
    Math.min(window.innerWidth - width - CONTEXT_MENU_MARGIN, point.x)
  );
  const top = Math.max(
    CONTEXT_MENU_MARGIN,
    Math.min(window.innerHeight - height - CONTEXT_MENU_MARGIN, point.y)
  );
  menu.setPosition?.({ left, top });
}

async function renderMenuAt(menu, point) {
  await menu.render(true);
  clampMenuPosition(menu, point);
}

function getContentBounds(sprite) {
  return sprite.transformContentBounds ?? sprite.hitArea;
}

function drawActionButton() {
  const button = new PIXI.Container();
  button.eventMode = "static";
  button.interactive = true;
  button.cursor = "pointer";
  button.hitArea = new PIXI.Circle(0, 0, ACTION_BUTTON_SIZE / 2);

  const background = new PIXI.Graphics();
  background.beginFill(0x1f2937, 0.96);
  background.lineStyle(2, 0xffc107, 1);
  background.drawCircle(0, 0, ACTION_BUTTON_SIZE / 2);
  background.endFill();
  background.eventMode = "none";
  button.addChild(background);

  const dots = new PIXI.Graphics();
  dots.beginFill(0xffffff, 1);
  for (const x of [-5, 0, 5]) dots.drawCircle(x, 0, 1.7);
  dots.endFill();
  dots.eventMode = "none";
  button.addChild(dots);

  return button;
}

/**
 * Replace the right-click launcher with an explicit on-sprite action button.
 * Foundry reserves right-drag for canvas panning, so the launcher is opened
 * from a left-clickable ellipsis button shown beside the transform handles.
 */
export function installContextMenuFix(PortraitSpritesLayer, PortraitSprite, SpriteContextMenu) {
  if (PortraitSprite.prototype.contextMenuFixInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "contextMenuFixInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalLayerSetInteractionActive = PortraitSpritesLayer.prototype.setInteractionActive;
  const originalDraw = PortraitSprite.prototype.draw;
  const originalUpdateTransformHandles = PortraitSprite.prototype.updateTransformHandles;
  const originalSetSelected = PortraitSprite.prototype.setSelected;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    const result = originalLayerSetInteractionActive.call(this, active);
    this.removeAllListeners?.("rightdown");
    return result;
  };

  PortraitSprite.prototype.openSpriteActionMenu = function(event) {
    const point = getPointerPosition(event);

    if (this.transformHud instanceof SpriteContextMenu && this.transformHud.rendered) {
      this.transformHud.close();
      return;
    }

    this.transformHud?.close?.();
    const menu = new SpriteContextMenu(this, event, {
      position: {
        width: CONTEXT_MENU_WIDTH,
        height: "auto",
        left: point.x,
        top: point.y
      },
      window: {
        frame: false,
        positioned: true,
        resizable: false
      }
    });

    this.transformHud = menu;
    const originalClose = menu.close.bind(menu);
    menu.close = async (...args) => {
      const result = await originalClose(...args);
      if (this.transformHud === menu) this.transformHud = null;
      return result;
    };

    renderMenuAt(menu, point);
  };

  PortraitSprite.prototype.ensureSpriteActionButton = function() {
    if (this.spriteActionButton || !this.transformHandles) return;

    const button = drawActionButton();
    button.on("pointerdown", event => {
      if (getPointerButton(event) !== 0) return;
      stopEvent(event);
      const nativeEvent = getNativeEvent(event);
      if (nativeEvent !== event) stopEvent(nativeEvent);
      this.openSpriteActionMenu(event);
    });

    this.spriteActionButton = button;
    this.transformHandles.addChild(button);
    this.updateSpriteActionButton();
  };

  PortraitSprite.prototype.updateSpriteActionButton = function() {
    const button = this.spriteActionButton;
    const bounds = getContentBounds(this);
    if (!button || !bounds) return;

    const inverseScaleX = 1 / Math.max(0.01, Math.abs(this.spriteScaleX ?? this.scale?.x ?? 1));
    const inverseScaleY = 1 / Math.max(0.01, Math.abs(this.spriteScaleY ?? this.scale?.y ?? 1));
    button.position.set(
      bounds.x + bounds.width + ACTION_BUTTON_X_OFFSET * inverseScaleX,
      bounds.y + ACTION_BUTTON_Y_OFFSET * inverseScaleY
    );
    button.scale.set(inverseScaleX, inverseScaleY);
    button.visible = Boolean(this.selected);
  };

  PortraitSprite.prototype.draw = async function(...args) {
    await originalDraw.apply(this, args);
    this.removeAllListeners?.("rightdown");
    this.removeAllListeners?.("rightclick");
    this.ensureSpriteActionButton();
    this.updateSpriteActionButton();
  };

  PortraitSprite.prototype.updateTransformHandles = function(...args) {
    const result = originalUpdateTransformHandles?.apply(this, args);
    this.ensureSpriteActionButton();
    this.updateSpriteActionButton();
    return result;
  };

  PortraitSprite.prototype.setSelected = function(selected) {
    const result = originalSetSelected.call(this, selected);
    this.ensureSpriteActionButton();
    this.updateSpriteActionButton();
    return result;
  };

  // Right-click is intentionally left to Foundry's native canvas controls.
  PortraitSprite.prototype.showHud = function() {};

  PortraitSprite.prototype.destroy = function(options) {
    this.transformHud?.close?.();
    this.spriteActionButton = null;
    return originalDestroy.call(this, options);
  };
}
