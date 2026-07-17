/**
 * Shared constants for Portrait Sprites & Expressions.
 */

export const MODULE_ID = "portrait-sprites-and-expressions";
export const MODULE_TITLE = "Portrait Sprites & Expressions";

export const FLAGS = {
  sprites: "sprites"
};

export const DEFAULT_BODY_FRAME = Object.freeze({ x: 0, y: 0, width: 100, height: 100 });
export const DEFAULT_HEAD_OFFSET = Object.freeze({ x: 0, y: 0 });
export const DEFAULT_HEAD_FRAME = Object.freeze({ x: 0, y: 100, width: 100, height: 50 });

export const TEMPLATES = {
  creator: `modules/${MODULE_ID}/templates/creator.html`,
  hud: `modules/${MODULE_ID}/templates/hud.html`
};

export const log = (...args) => console.log(`${MODULE_TITLE} |`, ...args);
