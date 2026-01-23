# Portrait Sprites & Expressions

A Foundry VTT v13 module for using spritesheets as portrait-style scene sprites with swappable facial expressions.

## Features

- **Custom Canvas Layer**: Adds a dedicated layer for portrait sprites that renders on the primary canvas group
- **Spritesheet Support**: Uses a single spritesheet image with PIXI.Rectangle frames for efficient memory usage
- **Shared BaseTexture**: Body and head sprites share the same BaseTexture for optimal performance
- **Multiple Expressions**: Support for multiple head frames representing different facial expressions
- **Expression HUD**: Simple HUD interface to cycle through expressions
- **Scene Storage**: All sprite data is stored in Scene flags (no custom Documents or core patches)
- **API Access**: Programmable API for adding, removing, and updating sprites

## Installation

1. In Foundry VTT, go to the Add-on Modules tab
2. Click "Install Module"
3. Paste the manifest URL: `https://github.com/Rubosso/Portrait-Sprites-Expressions/releases/latest/download/module.json`
4. Click "Install"

## Usage

### Adding a Portrait Sprite

Use the API to add portrait sprites to your scene:

```javascript
// Example: Add a portrait sprite with 3 expressions
await PortraitSprites.addSprite({
  spritesheet: "path/to/your/spritesheet.png",
  bodyFrame: { x: 0, y: 0, width: 200, height: 300 },
  headFrames: [
    { x: 0, y: 300, width: 200, height: 100 },    // Neutral expression
    { x: 200, y: 300, width: 200, height: 100 },  // Happy expression
    { x: 400, y: 300, width: 200, height: 100 }   // Sad expression
  ],
  headOffset: { x: 0, y: 0 },
  x: 500,  // Canvas X position
  y: 500   // Canvas Y position
});
```

### Changing Expressions

Right-click on any portrait sprite to open the Expression HUD. Use the arrow buttons to cycle through available expressions.

### Managing Sprites Programmatically

```javascript
// Get all sprites in the current scene
const sprites = PortraitSprites.getSprites();

// Update a sprite
await PortraitSprites.updateSprite(spriteId, {
  x: 600,
  y: 600,
  currentExpression: 1
});

// Remove a sprite
await PortraitSprites.removeSprite(spriteId);
```

## Technical Details

### Architecture

- **Custom Canvas Layer**: `PortraitSpritesLayer` extends `CanvasLayer`
- **Sprite Class**: `PortraitSprite` extends `PIXI.Container`
- **Body Sprite**: `PIXI.Sprite` with a texture using a rectangle from the base spritesheet
- **Head Sprite**: `PIXI.Sprite` with a texture using rectangles for each expression frame
- **Expression Switching**: Updates the head sprite's texture frame and calls `updateUvs()` for efficient rendering
- **Data Storage**: All sprite configurations stored in `canvas.scene.flags["portrait-sprites-expressions"].sprites`

### Spritesheet Format

The module expects a single PNG spritesheet with:
- Body frames positioned at specified coordinates
- Head frames for different expressions positioned at specified coordinates
- All frames use pixel coordinates (x, y, width, height)

### Scene Flags Structure

```javascript
{
  "portrait-sprites-expressions": {
    "sprites": [
      {
        "id": "uniqueId123",
        "spritesheet": "path/to/spritesheet.png",
        "bodyFrame": { "x": 0, "y": 0, "width": 200, "height": 300 },
        "headFrames": [
          { "x": 0, "y": 300, "width": 200, "height": 100 },
          { "x": 200, "y": 300, "width": 200, "height": 100 }
        ],
        "headOffset": { "x": 0, "y": 0 },
        "x": 500,
        "y": 500,
        "currentExpression": 0
      }
    ]
  }
}
```

## Compatibility

- **Foundry VTT**: v13 or higher
- **System**: Universal (system-agnostic)

## License

MIT License - See [LICENSE](LICENSE) file for details

## Credits

Created by Ruben André Guardado Serrano
