/**
 * Integrate the portrait layer with Foundry v13's native InteractionLayer and
 * SceneControls lifecycle. Foundry owns layer event modes; this module only
 * enables or disables the portrait sprite children when the layer changes.
 */
export function installV13LayerControls(
  PortraitSpritesLayer,
  PortraitSprite,
  PortraitSpriteCreator,
  PortraitSpriteLibrary
) {
  if (PortraitSpritesLayer.prototype.v13LayerControlsInstalled) return;

  Object.defineProperty(PortraitSpritesLayer.prototype, "v13LayerControlsInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const interactionLayerPrototype = Object.getPrototypeOf(PortraitSpritesLayer.prototype);
  const originalDraw = PortraitSpritesLayer.prototype._draw;
  const originalActivate = PortraitSpritesLayer.prototype.activate;
  const canManagePortraitSprites = () => Boolean(game.user?.isGM);

  /**
   * Foundry v13 discovers controls from InteractionLayer subclasses through
   * static prepareSceneControls(). The control's onChange activates the layer;
   * InteractionLayer.activate() then deactivates every other interaction layer.
   * Players may see rendered portrait sprites, but only GMs may see or use the
   * portrait controls.
   */
  PortraitSpritesLayer.prepareSceneControls = function() {
    const canManage = canManagePortraitSprites();
    return {
      name: "portraitSprites",
      order: 90,
      title: "PORTRAIT_SPRITES.Layer",
      icon: "fas fa-user-circle",
      activeTool: "select",
      visible: canManage,
      onChange: (_event, active) => {
        if (active && canManagePortraitSprites()) canvas.portraitSprites?.activate?.({ tool: "select" });
      },
      tools: {
        select: {
          name: "select",
          order: 1,
          title: "CONTROLS.CommonSelect",
          icon: "fas fa-mouse-pointer",
          visible: canManage
        },
        portraitSpriteCreator: {
          name: "portraitSpriteCreator",
          order: 2,
          title: "PORTRAIT_SPRITES.Creator.Tool",
          icon: "fas fa-plus-circle",
          button: true,
          visible: canManage,
          onChange: (_event, active) => {
            if (active === false || !canManagePortraitSprites()) return;
            new PortraitSpriteCreator().render(true);
          }
        },
        portraitSpriteLibrary: {
          name: "portraitSpriteLibrary",
          order: 3,
          title: "PORTRAIT_SPRITES.Library.Tool",
          icon: "fas fa-box-open",
          button: true,
          visible: canManage,
          onChange: (_event, active) => {
            if (active === false || !canManagePortraitSprites()) return;
            new PortraitSpriteLibrary().render(true);
          }
        }
      }
    };
  };

  /**
   * Never allow a non-GM client to activate this interaction layer, even if a
   * module or console call attempts to do so directly.
   */
  PortraitSpritesLayer.prototype.activate = function(...args) {
    if (!canManagePortraitSprites()) {
      this.interactionActive = false;
      this.eventMode = "none";
      this.interactiveChildren = false;
      for (const sprite of this.sprites?.values?.() ?? []) sprite.setInteractive(false);
      return this;
    }
    return originalActivate.call(this, ...args);
  };

  /**
   * The original layer draw did not invoke InteractionLayer._draw, so it kept a
   * permanent synthetic hit area and constructor-assigned event mode. Run the
   * native draw first, then draw portrait sprites and synchronize child state.
   */
  PortraitSpritesLayer.prototype._draw = async function(options) {
    await interactionLayerPrototype?._draw?.call(this, options);
    const result = await originalDraw.call(this, options);

    const canManage = canManagePortraitSprites();
    const enabled = canManage && Boolean(this.active);
    this.hitArea = canvas.dimensions.rect;
    this.zIndex = this.getZIndex?.() ?? this.zIndex;
    this.eventMode = canManage ? (this.active ? "static" : "passive") : "none";
    this.interactiveChildren = enabled;
    this.setInteractionActive(enabled);
    return result ?? this;
  };

  /**
   * Do not assign eventMode or the legacy PIXI interactive property here.
   * InteractionLayer.activate/deactivate exclusively own the layer's event mode.
   * Non-GM clients are always forced non-interactive.
   */
  PortraitSpritesLayer.prototype.setInteractionActive = function(active) {
    const enabled = canManagePortraitSprites() && Boolean(active);
    this.interactionActive = enabled;
    if (!canManagePortraitSprites()) {
      this.eventMode = "none";
      this.interactiveChildren = false;
    }
    for (const sprite of this.sprites?.values?.() ?? []) {
      sprite.setInteractive(enabled);
    }
  };

  /**
   * Keep interaction state local to each portrait sprite. Avoid the legacy
   * interactive setter, which can rewrite PIXI eventMode after it is assigned.
   */
  PortraitSprite.prototype.setInteractive = function(active) {
    const enabled = canManagePortraitSprites() && Boolean(active);
    this.eventMode = enabled ? "static" : "none";
    this.cursor = enabled ? "pointer" : null;
    this.buttonMode = enabled;
    if (this.bodySprite) this.bodySprite.eventMode = "none";
    if (this.headSprite) this.headSprite.eventMode = "none";
  };
}
