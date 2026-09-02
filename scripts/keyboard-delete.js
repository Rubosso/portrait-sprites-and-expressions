import { getSceneSprites, setSceneSprites } from "./scene-flags.js";

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  return Boolean(target.closest("[contenteditable=''], [contenteditable='true']"));
}

function isPortraitLayerActive(layer) {
  return Boolean(
    layer
    && canvas.scene
    && canvas.activeLayer === layer
    && layer.active
    && layer.interactionActive
  );
}

/**
 * Delete selected portrait sprite instances with the keyboard Delete key.
 *
 * This only removes the selected instances from the active Scene. Reusable
 * library entries are intentionally untouched. The key is consumed only while
 * the portrait layer is Foundry's active canvas layer, so native Delete behavior
 * remains available to tokens, tiles, walls, lights, and other canvas layers.
 */
export function installKeyboardDelete() {
  if (window.portraitSpriteKeyboardDeleteInstalled) return;
  window.portraitSpriteKeyboardDeleteInstalled = true;

  window.addEventListener("keydown", async event => {
    if (event.key !== "Delete" || event.repeat || event.defaultPrevented) return;
    if (!game.user?.isGM || isEditableTarget(event.target)) return;

    const layer = canvas.portraitSprites;
    if (!isPortraitLayerActive(layer)) return;

    const selected = layer.getSelectedSprites?.()
      ?? Array.from(layer.sprites?.values?.() ?? []).filter(sprite => sprite.selected);
    if (!selected.length) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const selectedIds = new Set(selected.map(sprite => sprite.id));
    const remaining = getSceneSprites().filter(sprite => !selectedIds.has(sprite.id));
    const saved = await setSceneSprites(remaining);
    if (!saved) return;

    for (const id of selectedIds) layer.removeSprite(id);
  }, true);
}
