import { NO_EXPRESSION } from "./no-expression.js";
import { updateSceneSprite } from "./scene-flags.js";
import { PortraitSpriteEditor } from "./sprite-menus.js";

function inferRowMajorGrid(headFrames) {
  const frames = Array.isArray(headFrames) ? headFrames : [];
  const first = frames[0] ?? { x: 0, y: 0, width: 256, height: 256 };

  let columns = 1;
  while (columns < frames.length && frames[columns]?.y === first.y) columns += 1;

  return {
    startX: first.x,
    startY: first.y,
    cellWidth: first.width,
    cellHeight: first.height,
    columns: Math.max(1, columns),
    rows: Math.max(1, Math.ceil(Math.max(1, frames.length) / Math.max(1, columns)))
  };
}

function buildHeadFrames(formData) {
  const columns = Math.max(1, Number(formData.headGrid?.columns) || 1);
  const rows = Math.max(1, Number(formData.headGrid?.rows) || 1);
  const capacity = columns * rows;
  const requested = Number(formData.expressionCount);
  const count = Math.min(
    capacity,
    Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : capacity)
  );
  const names = Array.isArray(formData.expressionNames) ? formData.expressionNames : [];
  const frames = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    frames.push({
      x: Number(formData.headGrid.startX) + column * Number(formData.headGrid.cellWidth),
      y: Number(formData.headGrid.startY) + row * Number(formData.headGrid.cellHeight),
      width: Math.max(1, Number(formData.headGrid.cellWidth)),
      height: Math.max(1, Number(formData.headGrid.cellHeight)),
      name: names[index] || game.i18n.format("PORTRAIT_SPRITES.Creator.DefaultExpressionName", {
        index: index + 1
      })
    });
  }

  return frames;
}

/**
 * The original editor inferred a grid only when every cell was filled. A partial
 * final row therefore collapsed into one very wide row. This editor preserves
 * the creator's row-major grid and stores the exact number of used expressions.
 */
export class CountAwarePortraitSpriteEditor extends PortraitSpriteEditor {
  constructor(sprite, options = {}) {
    super(sprite, options);

    const headFrames = Array.isArray(sprite.headFrames) ? sprite.headFrames : [];
    this.formData = {
      ...this.formData,
      headGrid: inferRowMajorGrid(headFrames),
      expressionCount: Math.max(1, headFrames.length),
      expressionNames: headFrames.map((frame, index) => (
        frame.name || game.i18n.format("PORTRAIT_SPRITES.Creator.DefaultExpressionName", {
          index: index + 1
        })
      ))
    };
  }

  async saveSpriteEdits() {
    if (!this.formData.spritesheet) {
      ui.notifications.warn(game.i18n.localize("PORTRAIT_SPRITES.Creator.Errors.MissingSpritesheet"));
      return;
    }

    const headFrames = buildHeadFrames(this.formData);
    const currentExpression = this.sprite.currentExpression === NO_EXPRESSION
      ? NO_EXPRESSION
      : Math.min(Math.max(0, this.sprite.currentExpression), headFrames.length - 1);
    const updates = {
      spritesheet: this.formData.spritesheet,
      bodyFrame: { ...this.formData.bodyFrame },
      headFrames,
      headOffset: { ...this.formData.headOffset },
      currentExpression
    };

    const spriteData = await updateSceneSprite(this.sprite.id, entry => ({ ...entry, ...updates }));
    const layer = canvas.portraitSprites;
    if (layer && spriteData) {
      const wasSelected = this.sprite.selected;
      layer.removeSprite(this.sprite.id);
      const replacement = await layer.createSprite(spriteData);
      if (wasSelected) layer.selectSprite?.(replacement);
    }

    ui.notifications.info(game.i18n.localize("PORTRAIT_SPRITES.Creator.Messages.Updated"));
    await this.close();
  }
}
