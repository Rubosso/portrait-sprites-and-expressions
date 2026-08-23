/**
 * Helpers for reading and writing module-owned Scene flag data.
 */

import { FLAGS, MODULE_ID } from "./constants.js";

function canManagePortraitSprites() {
  return Boolean(game.user?.isGM);
}

export function getSceneSprites(scene = canvas.scene) {
  return scene?.getFlag(MODULE_ID, FLAGS.sprites) || [];
}

export async function setSceneSprites(sprites, scene = canvas.scene) {
  if (!scene || !canManagePortraitSprites()) return false;
  await scene.setFlag(MODULE_ID, FLAGS.sprites, sprites);
  return true;
}

export async function updateSceneSprite(id, updater, scene = canvas.scene) {
  if (!canManagePortraitSprites()) return null;

  const sprites = getSceneSprites(scene);
  const index = sprites.findIndex(sprite => sprite.id === id);
  if (index < 0) return null;

  const nextSprite = updater(foundry.utils.deepClone(sprites[index]));
  sprites[index] = nextSprite;
  const saved = await setSceneSprites(sprites, scene);
  return saved ? nextSprite : null;
}
