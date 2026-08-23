/**
 * Keep the rendered portrait layer synchronized with Scene flag updates that
 * originate from another connected client.
 */
import { FLAGS, MODULE_ID, log } from "./constants.js";
import { getSceneSprites } from "./scene-flags.js";

const SPRITES_FLAG_PATH = `flags.${MODULE_ID}.${FLAGS.sprites}`;

function didPortraitSpritesChange(changes) {
  if (!changes || typeof changes !== "object") return false;

  // Foundry may provide either nested update data or a flattened dotted key.
  if (Object.prototype.hasOwnProperty.call(changes, SPRITES_FLAG_PATH)) return true;
  if (foundry.utils.hasProperty(changes, SPRITES_FLAG_PATH)) return true;

  const moduleFlags = changes.flags?.[MODULE_ID];
  return Boolean(moduleFlags && Object.prototype.hasOwnProperty.call(moduleFlags, FLAGS.sprites));
}

async function synchronizeLayerFromScene(scene) {
  const layer = canvas.portraitSprites;
  if (!layer || scene.id !== canvas.scene?.id) return;

  const sceneSprites = getSceneSprites(scene);
  const sceneSpriteIds = new Set(sceneSprites.map(sprite => sprite.id));

  // Remove sprites deleted by another client.
  for (const id of Array.from(layer.sprites.keys())) {
    if (!sceneSpriteIds.has(id)) layer.removeSprite(id);
  }

  // Create new sprites and apply live updates to existing ones.
  for (const spriteData of sceneSprites) {
    if (layer.sprites.has(spriteData.id)) {
      await layer.updateSprite(spriteData.id, spriteData);
    } else {
      await layer.createSprite(spriteData);
    }
  }
}

export function installLiveSceneSync() {
  Hooks.on("updateScene", async (scene, changes, _options, userId) => {
    if (scene.id !== canvas.scene?.id) return;
    if (!didPortraitSpritesChange(changes)) return;

    // The originating client already applied its own visual change before
    // persisting it. Only reconcile remote clients to avoid duplicate creation.
    if (userId && userId === game.user?.id) return;

    try {
      await synchronizeLayerFromScene(scene);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to synchronize portrait sprites`, error);
      log("Live sprite synchronization failed");
    }
  });
}
