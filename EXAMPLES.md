# Examples

This file contains examples of how to use the Portrait Sprites & Expressions module.

## Basic Example

```javascript
// Add a simple portrait sprite with one expression
await PortraitSprites.addSprite({
  spritesheet: "modules/portrait-sprites-expressions/examples/character.png",
  bodyFrame: { x: 0, y: 0, width: 100, height: 150 },
  headFrames: [
    { x: 0, y: 150, width: 100, height: 50 }
  ],
  headOffset: { x: 0, y: 0 },
  x: 400,
  y: 400
});
```

## Multi-Expression Example

```javascript
// Add a portrait with multiple expressions
await PortraitSprites.addSprite({
  spritesheet: "path/to/character-spritesheet.png",
  bodyFrame: { x: 0, y: 0, width: 200, height: 300 },
  headFrames: [
    { x: 0, y: 300, width: 200, height: 100 },    // Expression 0: Neutral
    { x: 200, y: 300, width: 200, height: 100 },  // Expression 1: Happy
    { x: 400, y: 300, width: 200, height: 100 },  // Expression 2: Sad
    { x: 600, y: 300, width: 200, height: 100 },  // Expression 3: Angry
    { x: 800, y: 300, width: 200, height: 100 }   // Expression 4: Surprised
  ],
  headOffset: { x: 0, y: 0 },
  x: 500,
  y: 500
});
```

## Animated Conversation Example

```javascript
// Create a macro to animate a conversation with expression changes
async function animateConversation() {
  // Add a character
  const sprite = await PortraitSprites.addSprite({
    spritesheet: "path/to/character.png",
    bodyFrame: { x: 0, y: 0, width: 200, height: 300 },
    headFrames: [
      { x: 0, y: 300, width: 200, height: 100 },    // Neutral
      { x: 200, y: 300, width: 200, height: 100 },  // Happy
      { x: 400, y: 300, width: 200, height: 100 }   // Sad
    ],
    x: 500,
    y: 500
  });
  
  // Change expressions during dialogue
  await PortraitSprites.updateSprite(sprite.id, { currentExpression: 0 });
  await ChatMessage.create({ content: "Hello there!" });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await PortraitSprites.updateSprite(sprite.id, { currentExpression: 1 });
  await ChatMessage.create({ content: "I'm so happy to see you!" });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await PortraitSprites.updateSprite(sprite.id, { currentExpression: 2 });
  await ChatMessage.create({ content: "But I have bad news..." });
}

// Run the conversation
animateConversation();
```

## Spritesheet Layout Guide

For best results, organize your spritesheet like this:

```
+-------------------+-------------------+-------------------+
|                   |                   |                   |
|   Body Frame 1    |   Body Frame 2    |   Body Frame 3    |
|   (200x300)       |   (200x300)       |   (200x300)       |
|                   |                   |                   |
+-------------------+-------------------+-------------------+
| Head: Neutral     | Head: Happy       | Head: Sad         |
| (200x100)         | (200x100)         | (200x100)         |
+-------------------+-------------------+-------------------+
```

## Managing Sprites

```javascript
// List all sprites in the scene
const sprites = PortraitSprites.getSprites();
console.log(`Found ${sprites.length} sprites in scene`);

// Move a sprite
await PortraitSprites.updateSprite(spriteId, {
  x: 700,
  y: 800
});

// Change expression programmatically
await PortraitSprites.updateSprite(spriteId, {
  currentExpression: 2
});

// Remove a sprite
await PortraitSprites.removeSprite(spriteId);

// Remove all sprites from the scene
const allSprites = PortraitSprites.getSprites();
for (const sprite of allSprites) {
  await PortraitSprites.removeSprite(sprite.id);
}
```

## Integration with Scenes

```javascript
// Add different sprites to different scenes
const scene1 = game.scenes.getName("Town Square");
const scene2 = game.scenes.getName("Tavern");

// Activate and add to first scene
await scene1.view();
await PortraitSprites.addSprite({
  spritesheet: "path/to/guard.png",
  bodyFrame: { x: 0, y: 0, width: 150, height: 250 },
  headFrames: [{ x: 0, y: 250, width: 150, height: 75 }],
  x: 300,
  y: 300
});

// Switch to second scene and add different sprite
await scene2.view();
await PortraitSprites.addSprite({
  spritesheet: "path/to/bartender.png",
  bodyFrame: { x: 0, y: 0, width: 180, height: 280 },
  headFrames: [{ x: 0, y: 280, width: 180, height: 85 }],
  x: 600,
  y: 400
});
```
