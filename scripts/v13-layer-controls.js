/**
 * Integrate the portrait layer with Foundry v13's native InteractionLayer and
 * SceneControls lifecycle. Foundry owns layer event modes; this module only
 * enables or disables the portrait sprite children when the layer changes.
 */
export function installV13LayerControls(PortraitSpritesLayer, PortraitSprite, PortraitSpriteCreator) {
  if (PortraitSpritesLayer.prototype.v13LayerControlsInstalled) return;

  Object.defineProperty(PortraitSpritesLayer.prototype, "v13LayerControlsInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const interactionLayerPrototype = Object.getPrototypeOf(PortraitSpritesLayer.prototype);
  const originalDraw = PortraitSpritesLayer.prototype._draw;

  /**
   * Foundry v13 discovers controls from InteractionLayer subclasses through
   * static prepareSceneControls(). The control's onChange activates the layer;
   * InteractionLayer.activate() then deactivates every other interaction layer.
   */
  PortraitSpritesLayer.prepareSceneControls = function() {
    return {
      name: "portraitSprites",
      order: 90,
      title: "PORTRAIT_SPRITES.Layer",
      icon: "fas fa-user-circle",
      activeTool: "select",
      onChange: (_event, active) => {
        if (active) canvas.portraitSprites?.activate?.({ tool: "select" });
      },
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.CommonSelect",
          icon: "fas fa-mouse-pointer"
        },
        portraitSpriteCreator: {
          name: "portraitSpriteCreator",
          order: 2,
          title: "PORTRAIT_SPRITES.Creator.Tool",
          icon: "fas fa-plus-circle",
          button: true,
          onChange: (_event, active) => {
            if (active === false) return;
            new PortraitSpriteCreator().render(true);
          }
        }
      }
    };
  };

  /**
   * The original layer draw did not invoke InteractionLayer._draw, so it kept a
   * permanent synthetic hit area and constructor-assigned event mode. Run the
   * native draw first, then draw portrait sprites and synchronize child state.
   */
  PortraitSpritesLayer.prototype._draw = async function(options) {
    await interactionLayerPrototype?._draw?.call(this, options);
    const result = await originalDraw.call(this, options);

    this.hitArea = canvas.dimensions.rect;
    this.zIndex = this.getZIndex?.() ?? this.zIndex;
    this.eventMode = this.active ? "static" : "passive";
    this.interactiveChildren = Boolean(this.active);
    this.setInteractionActive(Boolean(this.active));
    return result ?? this;
  };

  /**
   * Do not assign eventMode or the legacy PIXI interactive property here.
   * InteractionLayer.activate/deactivate exclusively own the layer's event mode.
   */
  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    const enabled = Boolean(active);
    this.interactionActive = enabled;
    for (const sprite of this.sprites?.values?.() ?? []) {
      sprite.setInteractive(enabled);
    }
  };

  /**
   * Keep interaction state local to each portrait sprite. Avoid the legacy
   * interactive setter, which can rewrite PIXI eventMode after it is assigned.
   */
  PortraitSprite.prototype.setInteractive = function(active) {
    const enabled = Boolean(active);
    this.eventMode = enabled ? "static" : "none";
    this.cursor = enabled ? "pointer" : null;
    this.buttonMode = enabled;
    if (this.bodySprite) this.bodySprite.eventMode = "none";
    if (this.headSprite) this.headSprite.eventMode = "none";
  };
}
