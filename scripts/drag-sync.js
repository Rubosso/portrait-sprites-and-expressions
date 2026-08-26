import { MODULE_ID } from "./constants.js";

const DRAG_SYNC_HZ = 12;
const DRAG_SYNC_INTERVAL_MS = 1000 / DRAG_SYNC_HZ;
const SOCKET_NAME = `module.${MODULE_ID}`;

let captureBroadcastQueued = false;

function getDragPositions(primarySprite) {
  const state = primarySprite.parent?.groupDragState;
  if (!state || state.primary !== primarySprite) return [];

  return Array.from(state.positions.keys()).map(sprite => ({
    id: sprite.id,
    x: sprite.position.x,
    y: sprite.position.y
  }));
}

function getActiveDragPrimary() {
  const primary = canvas.portraitSprites?.groupDragState?.primary;
  return primary?.isDragging ? primary : null;
}

function broadcastDragPositions(primarySprite, { force = false } = {}) {
  if (!game.user?.isGM || !canvas.scene) return;

  const positions = getDragPositions(primarySprite);
  if (!positions.length) return;

  const now = performance.now();
  const lastSent = Number(primarySprite._portraitDragSyncLastSent) || 0;
  if (!force && now - lastSent < DRAG_SYNC_INTERVAL_MS) return;
  primarySprite._portraitDragSyncLastSent = now;

  game.socket.emit(SOCKET_NAME, {
    type: "portrait-drag-preview",
    senderId: game.user.id,
    sceneId: canvas.scene.id,
    positions
  });
}

function queueCapturedDragBroadcast() {
  if (captureBroadcastQueued || !getActiveDragPrimary()) return;
  captureBroadcastQueued = true;

  // The capture listener runs before PIXI's target handlers. Defer until the
  // current browser event has finished so the sprite has already applied the
  // newest drag position before we read and broadcast it.
  queueMicrotask(() => {
    captureBroadcastQueued = false;
    const primary = getActiveDragPrimary();
    if (primary) broadcastDragPositions(primary);
  });
}

function receiveDragPreview(data) {
  if (data?.type !== "portrait-drag-preview") return;
  if (!canvas.scene || data.sceneId !== canvas.scene.id) return;
  if (data.senderId === game.user?.id) return;

  // Portrait manipulation is GM-only. Ignore previews that do not identify an
  // active GM so normal player clients cannot accidentally drive this layer.
  const sender = game.users?.get?.(data.senderId);
  if (!sender?.isGM) return;

  const layer = canvas.portraitSprites;
  if (!layer) return;

  for (const position of data.positions ?? []) {
    const sprite = layer.sprites?.get?.(position?.id);
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!sprite || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    sprite.position.set(x, y);
  }
}

/**
 * Broadcast transient drag positions over the module socket instead of writing
 * Scene flags on every pointer move. The regular drag-end path remains the
 * authoritative persistent save and existing updateScene live-sync reconciles
 * the exact final state afterward.
 */
export function installDragSync(PortraitSprite) {
  if (PortraitSprite.prototype.dragSyncInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "dragSyncInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalStartDrag = PortraitSprite.prototype.startDrag;
  const originalDragMove = PortraitSprite.prototype.dragMove;
  const originalDragEnd = PortraitSprite.prototype.dragEnd;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSprite.prototype.startDrag = function(...args) {
    this._portraitDragSyncLastSent = 0;
    const result = originalStartDrag.apply(this, args);
    broadcastDragPositions(this, { force: true });
    return result;
  };

  PortraitSprite.prototype.dragMove = function(...args) {
    const result = originalDragMove.apply(this, args);
    broadcastDragPositions(this);
    return result;
  };

  PortraitSprite.prototype.dragEnd = async function(...args) {
    // Send the exact release point immediately, before the persistent Scene
    // update completes, so remote clients do not visually lag behind the GM.
    broadcastDragPositions(this, { force: true });
    return originalDragEnd.apply(this, args);
  };

  PortraitSprite.prototype.destroy = function(options) {
    this._portraitDragSyncLastSent = 0;
    return originalDestroy.call(this, options);
  };

  // Foundry/PIXI can consume movement events while a portrait owns the drag.
  // Listen during DOM capture as an independent driver so transient sync keeps
  // running even when ordinary bubbling mousemove listeners (such as pointer
  // modules) stop receiving movement during the drag.
  if (!window._portraitDragSyncCaptureInstalled) {
    window._portraitDragSyncCaptureInstalled = true;
    window.addEventListener("pointermove", queueCapturedDragBroadcast, true);
    window.addEventListener("mousemove", queueCapturedDragBroadcast, true);
  }

  game.socket.on(SOCKET_NAME, receiveDragPreview);
}

export { DRAG_SYNC_HZ };
