const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_MARGIN = 8;
const CONTEXT_MENU_EVENT_TIMEOUT = 750;

function getNativeEvent(event) {
  return event?.nativeEvent
    ?? event?.data?.originalEvent
    ?? event?.originalEvent
    ?? event;
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

function suppressUpcomingContextMenu() {
  let timeoutId;
  const handler = event => {
    stopEvent(event);
    window.clearTimeout(timeoutId);
  };

  document.addEventListener("contextmenu", handler, { capture: true, once: true });
  timeoutId = window.setTimeout(() => {
    document.removeEventListener("contextmenu", handler, true);
  }, CONTEXT_MENU_EVENT_TIMEOUT);
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

/**
 * Make the frameless sprite launcher behave as an actual positioned context
 * menu and prevent Foundry's native right-click handling from also firing.
 */
export function installContextMenuFix(PortraitSprite, SpriteContextMenu) {
  if (PortraitSprite.prototype.contextMenuFixInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "contextMenuFixInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  PortraitSprite.prototype.showHud = function(event) {
    stopEvent(event);
    const nativeEvent = getNativeEvent(event);
    if (nativeEvent !== event) stopEvent(nativeEvent);
    suppressUpcomingContextMenu();

    this.parent?.selectSprite?.(this);
    const point = getPointerPosition(event);

    if (this.transformHud instanceof SpriteContextMenu) {
      this.transformHud.updatePointer?.(event);
      renderMenuAt(this.transformHud, point);
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
}
