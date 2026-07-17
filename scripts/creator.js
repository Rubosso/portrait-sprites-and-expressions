export class PortraitSpriteCreator extends Application {
  constructor(options = {}) {
    super(options);
    this.formData = this.#getDefaultData();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "portrait-sprite-creator",
      title: game.i18n.localize("PORTRAIT_SPRITES.Creator.Title"),
      template: "modules/portrait-sprites-and-expressions/templates/creator.html",
      classes: ["portrait-sprite-creator"],
      width: 620,
      height: "auto",
      resizable: true
    });
  }

  getData() {
    const expressionCount = this.#getExpressionCount();
    return {
      ...this.formData,
      expressionCount,
      expressionNames: this.#getExpressionNames(expressionCount),
      previewScale: this.#getPreviewScale()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("input, select").on("change input", event => {
      const { name, value, type } = event.currentTarget;
      if (!name) return;
      const parsedValue = type === "number" ? Number(value) : value;
      foundry.utils.setProperty(this.formData, name, parsedValue);
      if (name.startsWith("expressionNames")) {
        const index = Number(name.split(".").pop());
        if (!Number.isNaN(index)) {
          this.formData.expressionNames[index] = value;
        }
      }
      this.render(false);
    });

    html.find("[data-action='pick-spritesheet']").on("click", event => {
      event.preventDefault();
      const picker = new FilePicker({
        type: "image",
        current: this.formData.spritesheet,
        callback: path => {
          this.formData.spritesheet = path;
          this.render();
        }
      });
      picker.browse();
    });

    html.find("[data-action='create-sprite']").on("click", async event => {
      event.preventDefault();
      await this.#createSprite();
    });

    this.#renderPreview(html);
  }

  async #createSprite() {
    if (!this.formData.spritesheet) {
      ui.notifications.warn(game.i18n.localize("PORTRAIT_SPRITES.Creator.Errors.MissingSpritesheet"));
      return;
    }

    const headFrames = this.#buildHeadFrames();
    const spriteData = await PortraitSprites.addSprite({
      spritesheet: this.formData.spritesheet,
      bodyFrame: {
        x: this.formData.bodyFrame.x,
        y: this.formData.bodyFrame.y,
        width: this.formData.bodyFrame.width,
        height: this.formData.bodyFrame.height
      },
      headFrames,
      headOffset: {
        x: this.formData.headOffset.x,
        y: this.formData.headOffset.y
      },
      x: canvas.stage.worldTransform.tx ? canvas.stage.worldTransform.tx * -1 : 0,
      y: canvas.stage.worldTransform.ty ? canvas.stage.worldTransform.ty * -1 : 0
    });

    if (spriteData) {
      ui.notifications.info(game.i18n.localize("PORTRAIT_SPRITES.Creator.Messages.Created"));
    }
  }

  #getDefaultData() {
    return {
      spritesheet: "",
      bodyFrame: {
        x: 0,
        y: 0,
        width: 320,
        height: 480
      },
      headGrid: {
        startX: 0,
        startY: 0,
        cellWidth: 128,
        cellHeight: 128,
        columns: 4,
        rows: 4,
        count: 8
      },
      headOffset: {
        x: 0,
        y: 0
      },
      expressionNames: []
    };
  }

  #getExpressionCount() {
    const maxCount = Math.max(0, this.formData.headGrid.columns * this.formData.headGrid.rows);
    return Math.min(Math.max(0, this.formData.headGrid.count), maxCount);
  }

  #getExpressionNames(count) {
    if (!Array.isArray(this.formData.expressionNames)) {
      this.formData.expressionNames = [];
    }
    if (this.formData.expressionNames.length < count) {
      for (let i = this.formData.expressionNames.length; i < count; i += 1) {
        this.formData.expressionNames[i] = game.i18n.format("PORTRAIT_SPRITES.Creator.DefaultExpressionName", {
          index: i + 1
        });
      }
    }
    return this.formData.expressionNames.slice(0, count);
  }

  #buildHeadFrames() {
    const frames = [];
    const count = this.#getExpressionCount();
    const names = this.#getExpressionNames(count);

    for (let i = 0; i < count; i += 1) {
      const column = i % this.formData.headGrid.columns;
      const row = Math.floor(i / this.formData.headGrid.columns);
      frames.push({
        x: this.formData.headGrid.startX + column * this.formData.headGrid.cellWidth,
        y: this.formData.headGrid.startY + row * this.formData.headGrid.cellHeight,
        width: this.formData.headGrid.cellWidth,
        height: this.formData.headGrid.cellHeight,
        name: names[i] || game.i18n.format("PORTRAIT_SPRITES.Creator.DefaultExpressionName", { index: i + 1 })
      });
    }
    return frames;
  }

  #getPreviewScale() {
    const width = this.formData.bodyFrame.width + this.formData.bodyFrame.x;
    const height = this.formData.bodyFrame.height + this.formData.bodyFrame.y;
    if (!width || !height) return 1;
    const maxSize = 420;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    return Number(scale.toFixed(2));
  }

  #renderPreview(html) {
    const canvasElement = html.find(".sprite-preview-canvas")[0];
    if (!canvasElement) return;
    const context = canvasElement.getContext("2d");
    if (!context) return;

    const previewScale = this.#getPreviewScale();
    const baseWidth = Math.max(1, this.formData.bodyFrame.width + this.formData.bodyFrame.x);
    const baseHeight = Math.max(1, this.formData.bodyFrame.height + this.formData.bodyFrame.y);
    canvasElement.width = baseWidth * previewScale;
    canvasElement.height = baseHeight * previewScale;

    context.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (!this.formData.spritesheet) {
      context.fillStyle = "#1f1f1f";
      context.fillRect(0, 0, canvasElement.width, canvasElement.height);
      context.fillStyle = "#9ca3af";
      context.font = "14px sans-serif";
      context.fillText(game.i18n.localize("PORTRAIT_SPRITES.Creator.PreviewPlaceholder"), 12, 24);
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.drawImage(
        image,
        0,
        0,
        canvasElement.width,
        canvasElement.height
      );
      this.#drawOverlays(context, previewScale);
    };
    image.src = this.formData.spritesheet;
  }

  #drawOverlays(context, scale) {
    context.save();
    context.scale(scale, scale);

    context.strokeStyle = "rgba(248, 113, 113, 0.9)";
    context.lineWidth = 2 / scale;
    context.strokeRect(
      this.formData.bodyFrame.x,
      this.formData.bodyFrame.y,
      this.formData.bodyFrame.width,
      this.formData.bodyFrame.height
    );

    context.strokeStyle = "rgba(34, 211, 238, 0.9)";
    context.lineWidth = 1.5 / scale;
    const count = this.#getExpressionCount();
    for (let i = 0; i < count; i += 1) {
      const column = i % this.formData.headGrid.columns;
      const row = Math.floor(i / this.formData.headGrid.columns);
      const x = this.formData.headGrid.startX + column * this.formData.headGrid.cellWidth;
      const y = this.formData.headGrid.startY + row * this.formData.headGrid.cellHeight;
      context.strokeRect(x, y, this.formData.headGrid.cellWidth, this.formData.headGrid.cellHeight);
    }

    context.restore();
  }
}
