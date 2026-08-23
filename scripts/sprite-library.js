/**
 * Reusable world-level portrait sprite library.
 *
 * Existing sprite configurations are discovered from every Scene and folded into
 * a hidden world setting, so sprites created before this feature are immediately
 * reusable. Scene-specific state such as position, rotation, scale, and current
 * expression is deliberately excluded from library entries.
 */
import { FLAGS, MODULE_ID, TEMPLATES } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export const SPRITE_LIBRARY_SETTING = "spriteLibrary";
const EXPRESSION_OVERLAP = 1;

function inferSpriteName(spritesheet) {
  const path = String(spritesheet ?? "");
  const filename = decodeURIComponent(path.split("/").pop() || "Portrait Sprite");
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Portrait Sprite";
}

function reusableConfig(config = {}) {
  return {
    name: String(config.name || inferSpriteName(config.spritesheet)),
    spritesheet: String(config.spritesheet || ""),
    bodyFrame: foundry.utils.deepClone(config.bodyFrame ?? {}),
    headFrames: foundry.utils.deepClone(config.headFrames ?? []),
    headOffset: foundry.utils.deepClone(config.headOffset ?? {})
  };
}

function configSignature(config) {
  const entry = reusableConfig(config);
  return JSON.stringify({
    spritesheet: entry.spritesheet,
    bodyFrame: entry.bodyFrame,
    headFrames: entry.headFrames,
    headOffset: entry.headOffset
  });
}

function readLibraryState() {
  const stored = game.settings.get(MODULE_ID, SPRITE_LIBRARY_SETTING);
  const entries = Array.isArray(stored?.entries) ? stored.entries : [];
  const ignoredSignatures = Array.isArray(stored?.ignoredSignatures) ? stored.ignoredSignatures : [];
  return {
    entries: foundry.utils.deepClone(entries),
    ignoredSignatures: foundry.utils.deepClone(ignoredSignatures)
  };
}

function readLibrary() {
  return readLibraryState().entries;
}

async function writeLibrary(entries, { ignoredSignatures } = {}) {
  if (!game.user?.isGM) return false;
  const current = readLibraryState();
  await game.settings.set(MODULE_ID, SPRITE_LIBRARY_SETTING, {
    entries,
    ignoredSignatures: ignoredSignatures ?? current.ignoredSignatures
  });
  return true;
}

function findMatchingEntry(entries, config) {
  const libraryId = String(config?.libraryId ?? "");
  if (libraryId) {
    const byId = entries.find(entry => entry.id === libraryId);
    if (byId) return byId;
  }

  const spritesheet = String(config?.spritesheet ?? "");
  if (spritesheet) {
    const sameSheet = entries.find(entry => entry.spritesheet === spritesheet);
    if (sameSheet) return sameSheet;
  }

  const signature = configSignature(config);
  return entries.find(entry => configSignature(entry) === signature) ?? null;
}

/**
 * Save or refresh one reusable configuration in the world library.
 * @returns {Promise<Object|null>} The stored library entry.
 */
export async function rememberSpriteTemplate(config) {
  if (!game.user?.isGM || !config?.spritesheet) return null;

  const state = readLibraryState();
  const entries = state.entries;
  const reusable = reusableConfig(config);
  const signature = configSignature(config);
  const ignoredSignatures = state.ignoredSignatures.filter(ignored => ignored !== signature);
  const existing = findMatchingEntry(entries, config);

  if (existing) {
    Object.assign(existing, reusable);
    await writeLibrary(entries, { ignoredSignatures });
    return foundry.utils.deepClone(existing);
  }

  const entry = {
    id: String(config.libraryId || foundry.utils.randomID()),
    ...reusable
  };
  entries.push(entry);
  await writeLibrary(entries, { ignoredSignatures });
  return foundry.utils.deepClone(entry);
}

/**
 * Remove one reusable configuration without touching any Scene instances.
 * Its signature is remembered so the automatic Scene migration does not
 * immediately recreate a library entry the GM deliberately deleted.
 */
export async function deleteSpriteTemplate(id) {
  if (!game.user?.isGM) return null;

  const state = readLibraryState();
  const index = state.entries.findIndex(entry => entry.id === id);
  if (index < 0) return null;

  const [deleted] = state.entries.splice(index, 1);
  const ignoredSignatures = new Set(state.ignoredSignatures);
  ignoredSignatures.add(configSignature(deleted));

  await writeLibrary(state.entries, {
    ignoredSignatures: Array.from(ignoredSignatures)
  });
  return foundry.utils.deepClone(deleted);
}

/**
 * Import configurations from every Scene into the reusable library. This is the
 * migration path for portraits that existed before the library feature.
 */
export async function syncSpriteLibraryFromScenes() {
  if (!game.user?.isGM) return [];

  const state = readLibraryState();
  const entries = state.entries;
  const ignoredSignatures = new Set(state.ignoredSignatures);
  let changed = false;

  for (const scene of game.scenes?.contents ?? []) {
    const sprites = scene.getFlag(MODULE_ID, FLAGS.sprites) || [];
    for (const sprite of sprites) {
      if (!sprite?.spritesheet) continue;
      const reusable = reusableConfig(sprite);
      const existing = findMatchingEntry(entries, sprite);
      if (existing) {
        const before = JSON.stringify(existing);
        Object.assign(existing, reusable);
        if (before !== JSON.stringify(existing)) changed = true;
        continue;
      }

      if (ignoredSignatures.has(configSignature(sprite))) continue;

      entries.push({
        id: String(sprite.libraryId || foundry.utils.randomID()),
        ...reusable
      });
      changed = true;
    }
  }

  if (changed) {
    await writeLibrary(entries, {
      ignoredSignatures: Array.from(ignoredSignatures)
    });
  }
  return entries;
}

export function getSpriteLibraryEntries() {
  return readLibrary().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function getCanvasViewCentre() {
  const screen = canvas.app?.renderer?.screen;
  const centre = new PIXI.Point(
    screen ? screen.width / 2 : window.innerWidth / 2,
    screen ? screen.height / 2 : window.innerHeight / 2
  );
  return canvas.stage.toLocal(centre);
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function getCompositeBounds(entry, frame) {
  const body = entry.bodyFrame;
  if (!frame) return { x: 0, y: 0, width: body.width, height: body.height };
  const minX = Math.min(0, Number(entry.headOffset?.x) || 0);
  const minY = Math.min(0, Number(entry.headOffset?.y) || 0);
  const maxX = Math.max(body.width, (Number(entry.headOffset?.x) || 0) + frame.width);
  const maxY = Math.max(body.height, (Number(entry.headOffset?.y) || 0) + frame.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function drawLibraryPreview(canvasElement, image, entry) {
  const context = canvasElement.getContext("2d");
  if (!context || !image || !entry?.bodyFrame) return;

  const body = entry.bodyFrame;
  const frame = entry.headFrames?.[0] ?? null;
  const bounds = getCompositeBounds(entry, frame);
  const padding = 8;
  const scale = Math.min(
    (canvasElement.width - padding * 2) / Math.max(1, bounds.width),
    (canvasElement.height - padding * 2) / Math.max(1, bounds.height)
  );
  const offsetX = (canvasElement.width - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (canvasElement.height - bounds.height * scale) / 2 - bounds.y * scale;

  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    body.x,
    body.y,
    body.width,
    body.height,
    offsetX,
    offsetY,
    body.width * scale,
    body.height * scale
  );

  if (!frame) return;
  const headX = offsetX + (Number(entry.headOffset?.x) || 0) * scale;
  const headY = offsetY + (Number(entry.headOffset?.y) || 0) * scale;

  // Match runtime face replacement while retaining a one-pixel ring of body
  // beneath the expression to prevent visible edge seams.
  const overlap = EXPRESSION_OVERLAP * scale;
  const cutoutWidth = Math.max(0, frame.width * scale - overlap * 2);
  const cutoutHeight = Math.max(0, frame.height * scale - overlap * 2);
  if (cutoutWidth > 0 && cutoutHeight > 0) {
    context.clearRect(
      headX + overlap,
      headY + overlap,
      cutoutWidth,
      cutoutHeight
    );
  }
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    headX,
    headY,
    frame.width * scale,
    frame.height * scale
  );
}

export class PortraitSpriteLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.entries = [];
  }

  static DEFAULT_OPTIONS = {
    id: "portrait-sprite-library",
    classes: ["portrait-sprite-library"],
    position: { width: 900, height: 700 },
    window: {
      title: "PORTRAIT_SPRITES.Library.Title",
      frame: true,
      resizable: true
    }
  };

  static PARTS = {
    content: { template: TEMPLATES.spriteLibrary }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await syncSpriteLibraryFromScenes();
    this.entries = getSpriteLibraryEntries();
    return {
      ...context,
      entries: this.entries.map((entry, index) => ({
        ...entry,
        index,
        expressionCount: entry.headFrames?.length ?? 0,
        searchText: `${entry.name} ${entry.spritesheet}`.toLocaleLowerCase()
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const search = this.element.querySelector("[data-action='search-library']");
    search?.addEventListener("input", event => {
      const query = String(event.currentTarget.value || "").trim().toLocaleLowerCase();
      for (const card of this.element.querySelectorAll(".sprite-library-card")) {
        const haystack = String(card.dataset.searchText || "").toLocaleLowerCase();
        card.hidden = Boolean(query && !haystack.includes(query));
      }
    });

    this.element.querySelectorAll("[data-action='add-library-sprite']").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        if (!game.user?.isGM) return;

        const index = Number(event.currentTarget.dataset.libraryIndex);
        const entry = this.entries[index];
        if (!entry) return;

        const centre = getCanvasViewCentre();
        const spriteData = await PortraitSprites.addSprite({
          libraryId: entry.id,
          name: entry.name,
          spritesheet: entry.spritesheet,
          bodyFrame: foundry.utils.deepClone(entry.bodyFrame),
          headFrames: foundry.utils.deepClone(entry.headFrames),
          headOffset: foundry.utils.deepClone(entry.headOffset),
          x: centre.x,
          y: centre.y
        });

        if (spriteData) {
          ui.notifications.info(game.i18n.format("PORTRAIT_SPRITES.Library.Added", { name: entry.name }));
        }
      });
    });

    this.element.querySelectorAll("[data-action='delete-library-sprite']").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        if (!game.user?.isGM) return;

        const index = Number(event.currentTarget.dataset.libraryIndex);
        const entry = this.entries[index];
        if (!entry) return;

        const confirmed = window.confirm(
          game.i18n.format("PORTRAIT_SPRITES.Library.DeleteConfirm", { name: entry.name })
        );
        if (!confirmed) return;

        const deleted = await deleteSpriteTemplate(entry.id);
        if (!deleted) return;

        ui.notifications.info(game.i18n.format("PORTRAIT_SPRITES.Library.Deleted", {
          name: deleted.name
        }));
        this.render(false);
      });
    });

    for (const canvasElement of this.element.querySelectorAll(".sprite-library-preview")) {
      const index = Number(canvasElement.dataset.libraryIndex);
      const entry = this.entries[index];
      if (!entry) continue;
      loadImage(entry.spritesheet).then(image => {
        if (!image || !canvasElement.isConnected) return;
        drawLibraryPreview(canvasElement, image, entry);
      });
    }
  }
}
