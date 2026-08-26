import { MODULE_ID } from "./constants.js";
import { getSceneSprites, setSceneSprites } from "./scene-flags.js";

const DRAG_SYNC_HZ = 20;
const DRAG_SYNC_INTERVAL_MS = 1000 / DRAG_SYNC_HZ;
const FALLBACK_SYNC_HZ = 5;
const FALLBACK_SYNC_INTERVAL_MS = 1000 / FALLBACK_SYNC_HZ;
const SOCKET_ACK_TIMEOUT_MS = 750;
const SOCKET_NAME = `module.${MODULE_ID}`;

let captureSyncQueued = false;
let fallbackTimer = null;
let fallbackWriteInFlight = null;
let fallbackPendingPrimary = null;
let fallbackLastWriteStartedAt = 0;
const acknowledgedDragsBySender = new Map();

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

function hasOtherActiveUsers() {
  return Boolean(game.users?.contents?.some?.(user => user.active && user.id !== game.user?.id));
}

function emitSocketMessage(data) {
  try {
    game.socket?.emit?.(SOCKET_NAME, data);
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to emit live drag socket message`, error);
    return false;
  }
}

function sendDragPreview(primarySprite, { force = false } = {}) {
  if (!game.user?.isGM || !canvas.scene || !primarySprite?._portraitDragSyncId) return;

  const positions = getDragPositions(primarySprite);
  if (!positions.length) return;

  const now = performance.now();
  const lastSent = Number(primarySprite._portraitDragSyncLastSent) || 0;
  if (!force && now - lastSent < DRAG_SYNC_INTERVAL_MS) return;
  primarySprite._portraitDragSyncLastSent = now;

  emitSocketMessage({
    type: "portrait-drag-preview",
    senderId: game.user.id,
    sceneId: canvas.scene.id,
    dragId: primarySprite._portraitDragSyncId,
    positions
  });
}

function sendDragAcknowledgement(data) {
  if (!data?.senderId || !data?.dragId || !canvas.scene) return;

  const previousDragId = acknowledgedDragsBySender.get(data.senderId);
  if (previousDragId === data.dragId) return;
  acknowledgedDragsBySender.set(data.senderId, data.dragId);

  emitSocketMessage({
    type: "portrait-drag-ack",
    senderId: game.user?.id,
    targetId: data.senderId,
    sceneId: canvas.scene.id,
    dragId: data.dragId
  });
}

function receiveDragPreview(data) {
  if (!canvas.scene || data.sceneId !== canvas.scene.id) return;
  if (data.senderId === game.user?.id) return;

  // Dragging portraits is GM-only. Transient packets are visual-only, but still
  // reject packets from a connected non-GM before applying them to the layer.
  const sender = game.users?.get?.(data.senderId);
  if (!sender?.isGM) return;

  const layer = canvas.portraitSprites;
  if (!layer) return;

  let applied = false;
  for (const position of data.positions ?? []) {
    const sprite = layer.sprites?.get?.(position?.id);
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!sprite || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    sprite.position.set(x, y);
    applied = true;
  }

  // Only confirm the socket path after a remote PIXI portrait was actually
  // found and moved. Receipt alone is not enough to disable the fallback.
  if (applied) sendDragAcknowledgement(data);
}

function receiveDragAcknowledgement(data) {
  if (data?.targetId !== game.user?.id) return;
  const primary = getActiveDragPrimary();
  if (!primary || primary._portraitDragSyncId !== data.dragId) return;

  primary._portraitDragSocketAcknowledged = true;
  primary._portraitDragUseFallback = false;
  if (primary._portraitDragAckTimer) {
    clearTimeout(primary._portraitDragAckTimer);
    primary._portraitDragAckTimer = null;
  }
}

function receiveSocketMessage(data) {
  if (!data || data.sceneId !== canvas.scene?.id) return;
  if (data.type === "portrait-drag-preview") receiveDragPreview(data);
  else if (data.type === "portrait-drag-ack") receiveDragAcknowledgement(data);
}

function startSocketAcknowledgementWatch(primarySprite) {
  if (!hasOtherActiveUsers()) return;

  if (primarySprite._portraitDragAckTimer) clearTimeout(primarySprite._portraitDragAckTimer);
  primarySprite._portraitDragAckTimer = setTimeout(() => {
    primarySprite._portraitDragAckTimer = null;
    if (!primarySprite.isDragging || primarySprite._portraitDragSocketAcknowledged) return;

    primarySprite._portraitDragUseFallback = true;
    console.warn(
      `${MODULE_ID} | No live-drag socket acknowledgement received; `
      + `falling back to ${FALLBACK_SYNC_HZ} Hz Scene synchronization for this drag.`
    );
    scheduleFallbackSync(primarySprite);
  }, SOCKET_ACK_TIMEOUT_MS);
}

function clearFallbackTimer() {
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

async function writeFallbackPositions(primarySprite) {
  if (!game.user?.isGM || !canvas.scene) return;

  const positions = getDragPositions(primarySprite);
  if (!positions.length) return;

  const byId = new Map(positions.map(position => [position.id, position]));
  const sprites = getSceneSprites();
  let changed = false;

  for (const sprite of sprites) {
    const position = byId.get(sprite.id);
    if (!position) continue;
    if (sprite.x === position.x && sprite.y === position.y) continue;
    sprite.x = position.x;
    sprite.y = position.y;
    changed = true;
  }

  if (changed) await setSceneSprites(sprites);
}

function scheduleFallbackSync(primarySprite) {
  if (!primarySprite?._portraitDragUseFallback || !primarySprite.isDragging) return;
  fallbackPendingPrimary = primarySprite;

  if (fallbackWriteInFlight) return;

  const elapsed = performance.now() - fallbackLastWriteStartedAt;
  const delay = Math.max(0, FALLBACK_SYNC_INTERVAL_MS - elapsed);
  if (delay > 0) {
    if (fallbackTimer !== null) return;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      flushFallbackSync();
    }, delay);
    return;
  }

  flushFallbackSync();
}

function flushFallbackSync() {
  if (fallbackWriteInFlight) return;

  const primary = fallbackPendingPrimary;
  fallbackPendingPrimary = null;
  if (!primary?._portraitDragUseFallback || !primary.isDragging) return;

  fallbackLastWriteStartedAt = performance.now();
  fallbackWriteInFlight = writeFallbackPositions(primary)
    .catch(error => {
      console.error(`${MODULE_ID} | Failed to synchronize fallback live drag position`, error);
    })
    .finally(() => {
      fallbackWriteInFlight = null;
      const nextPrimary = fallbackPendingPrimary;
      if (nextPrimary?._portraitDragUseFallback && nextPrimary.isDragging) {
        scheduleFallbackSync(nextPrimary);
      }
    });
}

function driveLiveDrag(primarySprite) {
  if (!primarySprite?.isDragging) return;
  sendDragPreview(primarySprite);
  if (primarySprite._portraitDragUseFallback) scheduleFallbackSync(primarySprite);
}

function queueCapturedDragSync() {
  if (captureSyncQueued || !getActiveDragPrimary()) return;
  captureSyncQueued = true;

  // Capture sees movement even when Foundry/PIXI consumes the normal bubbling
  // event. Defer until the event has finished so the local drag handler has
  // already applied the newest position before we read it.
  queueMicrotask(() => {
    captureSyncQueued = false;
    const primary = getActiveDragPrimary();
    if (primary) driveLiveDrag(primary);
  });
}

async function finishOutstandingFallback(primarySprite) {
  fallbackPendingPrimary = null;
  clearFallbackTimer();
  if (fallbackWriteInFlight) await fallbackWriteInFlight;

  if (primarySprite?._portraitDragAckTimer) {
    clearTimeout(primarySprite._portraitDragAckTimer);
    primarySprite._portraitDragAckTimer = null;
  }
}

/**
 * Synchronize in-progress portrait dragging over Foundry's module socket. The
 * transient packet only moves remote PIXI containers; the existing mouse-up
 * path remains the authoritative persistent Scene save. A one-time ACK confirms
 * that another client is receiving and applying the module relay. If no ACK
 * arrives, the drag temporarily falls back to the proven Scene update path.
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
    const result = originalStartDrag.apply(this, args);
    if (!this.isDragging) return result;

    this._portraitDragSyncId = foundry.utils.randomID();
    this._portraitDragSyncLastSent = 0;
    this._portraitDragSocketAcknowledged = false;
    this._portraitDragUseFallback = false;
    sendDragPreview(this, { force: true });
    startSocketAcknowledgementWatch(this);
    return result;
  };

  PortraitSprite.prototype.dragMove = function(...args) {
    const result = originalDragMove.apply(this, args);
    driveLiveDrag(this);
    return result;
  };

  PortraitSprite.prototype.dragEnd = async function(...args) {
    // Send the exact release point immediately over the transient channel, then
    // ensure any fallback document write has settled before the authoritative
    // persistent mouse-up save runs.
    sendDragPreview(this, { force: true });
    await finishOutstandingFallback(this);
    const result = await originalDragEnd.apply(this, args);
    this._portraitDragSyncId = null;
    this._portraitDragSocketAcknowledged = false;
    this._portraitDragUseFallback = false;
    return result;
  };

  PortraitSprite.prototype.destroy = function(options) {
    if (this._portraitDragAckTimer) clearTimeout(this._portraitDragAckTimer);
    if (fallbackPendingPrimary === this) fallbackPendingPrimary = null;
    this._portraitDragSyncId = null;
    return originalDestroy.call(this, options);
  };

  if (!window._portraitDragSyncCaptureInstalled) {
    window._portraitDragSyncCaptureInstalled = true;
    window.addEventListener("pointermove", queueCapturedDragSync, true);
    window.addEventListener("mousemove", queueCapturedDragSync, true);
  }

  if (!window._portraitDragSocketListenerInstalled) {
    window._portraitDragSocketListenerInstalled = true;
    game.socket.on(SOCKET_NAME, receiveSocketMessage);
  }
}

export { DRAG_SYNC_HZ, FALLBACK_SYNC_HZ };
