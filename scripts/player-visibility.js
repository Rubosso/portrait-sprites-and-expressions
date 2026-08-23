/**
 * Per-scene player visibility for portrait sprites.
 *
 * GMs always render every portrait so hidden sprites remain editable. Non-GM
 * clients suppress only instances marked hiddenFromPlayers. The flag lives on
 * the Scene sprite entry, so hiding one instance does not affect the reusable
 * library template or copies on other Scenes.
 */
const VISIBILITY_FADE_MS = 300;

function canManagePortraitSprites() {
  return Boolean(game.user?.isGM);
}

function cancelVisibilityFade(sprite) {
  const fade = sprite?._portraitVisibilityFade;
  if (!fade) return;
  if (fade.frame !== null) cancelAnimationFrame(fade.frame);
  sprite._portraitVisibilityFade = null;
}

function applyVisibilityImmediately(sprite) {
  if (!sprite) return;
  cancelVisibilityFade(sprite);

  if (canManagePortraitSprites()) {
    sprite.visible = true;
    sprite.alpha = 1;
    return;
  }

  const hidden = Boolean(sprite.hiddenFromPlayers);
  sprite.visible = !hidden;
  sprite.alpha = hidden ? 0 : 1;
}

function fadePlayerVisibility(sprite) {
  if (!sprite) return;
  if (canManagePortraitSprites()) {
    applyVisibilityImmediately(sprite);
    return;
  }

  const hidden = Boolean(sprite.hiddenFromPlayers);
  cancelVisibilityFade(sprite);

  // Keep the sprite renderable while fading out. A hidden sprite starts from
  // alpha 0 when fading back in, so the transition is symmetrical.
  sprite.visible = true;
  const startAlpha = Number.isFinite(sprite.alpha) ? sprite.alpha : (hidden ? 1 : 0);
  const targetAlpha = hidden ? 0 : 1;

  if (Math.abs(startAlpha - targetAlpha) < 0.001) {
    sprite.alpha = targetAlpha;
    sprite.visible = !hidden;
    return;
  }

  const startedAt = performance.now();
  const fade = {
    frame: null,
    targetHidden: hidden
  };
  sprite._portraitVisibilityFade = fade;

  const step = now => {
    if (sprite._portraitVisibilityFade !== fade || sprite.destroyed) return;

    const progress = Math.min(1, Math.max(0, (now - startedAt) / VISIBILITY_FADE_MS));
    sprite.alpha = startAlpha + (targetAlpha - startAlpha) * progress;

    if (progress >= 1) {
      sprite.alpha = targetAlpha;
      sprite.visible = !hidden;
      sprite._portraitVisibilityFade = null;
      return;
    }

    fade.frame = requestAnimationFrame(step);
  };

  fade.frame = requestAnimationFrame(step);
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
  const originalDestroy = PortraitSprite.prototype.destroy;

  PortraitSpritesLayer.prototype.createSprite = async function(data) {
    const sprite = await originalCreateSprite.call(this, data);
    sprite.hiddenFromPlayers = Boolean(data?.hiddenFromPlayers);

    // Scene load should respect the stored state immediately rather than
    // briefly flashing a hidden portrait before fading it away.
    applyVisibilityImmediately(sprite);
    return sprite;
  };

  PortraitSprite.prototype.update = async function(updates = {}) {
    const previousHidden = Boolean(this.hiddenFromPlayers);
    const hasVisibilityUpdate = updates.hiddenFromPlayers !== undefined;

    if (hasVisibilityUpdate) {
      this.hiddenFromPlayers = Boolean(updates.hiddenFromPlayers);
    }

    const result = await originalUpdate.call(this, updates);

    if (hasVisibilityUpdate && previousHidden !== this.hiddenFromPlayers) {
      fadePlayerVisibility(this);
    } else if (!this._portraitVisibilityFade) {
      applyVisibilityImmediately(this);
    }

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

  PortraitSprite.prototype.destroy = function(options) {
    cancelVisibilityFade(this);
    return originalDestroy.call(this, options);
  };
}
