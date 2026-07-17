# Architecture

This module keeps runtime code small and organized by separating responsibilities across focused files.

## Runtime entry points

- `scripts/init.js` is the Foundry lifecycle entry point. It registers settings, canvas layers, scene controls, and exposes the public API.
- `scripts/api.js` owns the `window.PortraitSprites` API surface and coordinates scene flag updates with the live canvas layer.
- `scripts/layer.js` owns canvas rendering, sprite interaction, dragging, expression switching, and the expression HUD.
- `scripts/creator.js` owns the sprite creator application and spritesheet preview workflow.

## Shared infrastructure

- `scripts/constants.js` centralizes module ids, template paths, default frame values, and logging so those values do not drift across files.
- `scripts/scene-flags.js` centralizes Scene flag reads and writes so future schema changes can be handled in one place.

## Best practices for future changes

1. Keep Foundry hook registration in `scripts/init.js`; move feature logic into dedicated modules.
2. Put shared literals such as module ids, flag keys, paths, and defaults in `scripts/constants.js`.
3. Use `scripts/scene-flags.js` for module Scene flag access instead of calling `scene.getFlag` or `scene.setFlag` directly in feature code.
4. Keep the public API in `scripts/api.js` stable and avoid exposing internal classes unless there is a clear integration need.
5. Add localization strings to `lang/en.json` rather than hard-coding user-facing text.
6. Prefer small helper functions over duplicating frame, expression, and persistence logic.
