/**
 * Per-scene player visibility for portrait sprites.
 *
 * GMs always render every portrait so hidden sprites remain editable. Non-GM
 * clients suppress only instances marked hiddenFromPlayers. The flag lives on
 * the Scene sprite entry, so hiding one instance does not affect the reusable
 * library template or copies on other Scenes.
 */
function canManagePortraitSprites() {
  return Boolean(game.user?.isGM);
}

function applyVisibility(sprite) {
  if (!sprite) return;
  sprite.visible = canManagePortraitSprites() || !Boolean(sprite.hiddenFromPlayers);
}

/**
 * Install per-instance player visibility onto the portrait layer and sprites.
 * @param {typeof import("./layer.js").PortraitSpritesLayer} PortraitSpritesLayer
 * @param {typeof import("./layer.js").PortraitSprite} PortraitSprite
 */
export function installPlayerVisibility(PortraitSpritesLayer, PortraitSprite) {
  if (PortraitSprite.prototype.playerVisibilityInstalled) return;

  Object.defineProperty(PortraitSprite.prototype, "playerVisibilityInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalCreateSprite = PortraitSpritesLayer.prototype.createSprite;
  const originalUpdate = PortraitSprite.prototype.update;

  PortraitSpritesLayer.prototype.createSprite = async function(data) {
    const sprite = await originalCreateSprite.call(this, data);
    sprite.hiddenFromPlayers = Boolean(data?.hiddenFromPlayers);
    applyVisibility(sprite);
    return sprite;
  };

  PortraitSprite.prototype.update = async function(updates = {}) {
    if (updates.hiddenFromPlayers !== undefined) {
      this.hiddenFromPlayers = Boolean(updates.hiddenFromPlayers);
    }

    const result = await originalUpdate.call(this, updates);
    applyVisibility(this);
    return result;
  };

  PortraitSprite.prototype.setHiddenFromPlayers = async function(hidden) {
    if (!canManagePortraitSprites()) return null;
    const value = Boolean(hidden);
    const result = await window.PortraitSprites?.updateSprite?.(this.id, {
      hiddenFromPlayers: value
    });
    return result ?? value;
  };
}
