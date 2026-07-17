/**
 * Helpers for reading and writing module-owned Scene flag data.
 */

import { FLAGS, MODULE_ID } from "./constants.js";

export function getSceneSprites(scene = canvas.scene) {
  return scene?.getFlag(MODULE_ID, FLAGS.sprites) || [];
}

export async function setSceneSprites(sprites, scene = canvas.scene) {
  if (!scene) return;
  await scene.setFlag(MODULE_ID, FLAGS.sprites, sprites);
}

export async function updateSceneSprite(id, updater, scene = canvas.scene) {
  const sprites = getSceneSprites(scene);
  const index = sprites.findIndex(sprite => sprite.id === id);
  if (index < 0) return null;

  const nextSprite = updater(foundry.utils.deepClone(sprites[index]));
  sprites[index] = nextSprite;
  await setSceneSprites(sprites, scene);
  return nextSprite;
}
