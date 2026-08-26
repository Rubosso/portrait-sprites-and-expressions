import { getSceneSprites, setSceneSprites } from "./scene-flags.js";

const DRAG_SYNC_HZ = 5;
const DRAG_SYNC_INTERVAL_MS = 1000 / DRAG_SYNC_HZ;

let captureSyncQueued = false;
let pendingTimer = null;
let writeInFlight = null;
let pendingPrimary = null;
let lastWriteStartedAt = 0;

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

function clearPendingTimer() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

async function writeCurrentDragPositions(primarySprite) {
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

  if (!changed) return;
  await setSceneSprites(sprites);
}

function scheduleDragSync(primarySprite) {
  if (!game.user?.isGM || !primarySprite?.isDragging) return;
  pendingPrimary = primarySprite;

  if (writeInFlight) return;

  const elapsed = performance.now() - lastWriteStartedAt;
  const delay = Math.max(0, DRAG_SYNC_INTERVAL_MS - elapsed);
  if (delay > 0) {
    if (pendingTimer !== null) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      flushPendingDragSync();
    }, delay);
    return;
  }

  flushPendingDragSync();
}

function flushPendingDragSync() {
  if (writeInFlight) return;

  const primary = pendingPrimary;
  pendingPrimary = null;
  if (!primary?.isDragging) return;

  lastWriteStartedAt = performance.now();
  writeInFlight = writeCurrentDragPositions(primary)
    .catch(error => {
      console.error("Portrait Sprites | Failed to synchronize live drag position", error);
    })
    .finally(() => {
      writeInFlight = null;
      const nextPrimary = pendingPrimary;
      if (nextPrimary?.isDragging) scheduleDragSync(nextPrimary);
    });
}

function queueCapturedDragSync() {
  if (captureSyncQueued || !getActiveDragPrimary()) return;
  captureSyncQueued = true;

  // Capture sees movement even when Foundry/PIXI consumes the normal bubbling
  // mouse event. Defer until the event has finished so the local drag handler
  // has already applied the newest sprite position.
  queueMicrotask(() => {
    captureSyncQueued = false;
    const primary = getActiveDragPrimary();
    if (primary) scheduleDragSync(primary);
  });
}

async function finishOutstandingDragSync() {
  pendingPrimary = null;
  clearPendingTimer();
  if (writeInFlight) await writeInFlight;
}

/**
 * Keep remote clients approximately in step while the GM drags portraits.
 * Intermediate movement uses one coalesced Scene flag write for the whole
 * selected group at a deliberately low frequency. Writes never overlap, and
 * drag-end waits for any in-flight preview write before persisting the exact
 * release position through the normal transform code.
 */
export function installDragSync(PortraitSprite) {
  if (PortraitSprite.prototype.dragSyncInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "dragSyncInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalDragMove = PortraitSprite.prototype.dragMove;
  const originalDragEnd = PortraitSprite.prototype.dragEnd;
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSprite.prototype.dragMove = function(...args) {
    const result = originalDragMove.apply(this, args);
    scheduleDragSync(this);
    return result;
  };

  PortraitSprite.prototype.dragEnd = async function(...args) {
    // Do not allow an older preview write to finish after the authoritative
    // mouse-up save and pull remote clients back to a stale position.
    await finishOutstandingDragSync();
    return originalDragEnd.apply(this, args);
  };

  PortraitSprite.prototype.destroy = function(options) {
    if (pendingPrimary === this) pendingPrimary = null;
    return originalDestroy.call(this, options);
  };

  if (!window._portraitDragSyncCaptureInstalled) {
    window._portraitDragSyncCaptureInstalled = true;
    window.addEventListener("pointermove", queueCapturedDragSync, true);
    window.addEventListener("mousemove", queueCapturedDragSync, true);
  }
}

export { DRAG_SYNC_HZ };
