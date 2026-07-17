export class PortraitSpriteCreator extends Application {
  constructor(options = {}) {
    super(options);
    this.formData = this.#getDefaultData();
    this.activeTab = "coordinates";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "portrait-sprite-creator",
      title: game.i18n.localize("PORTRAIT_SPRITES.Creator.Title"),
      template: "modules/portrait-sprites-and-expressions/templates/creator.html",
      classes: ["portrait-sprite-creator"],
      width: 860,
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
      expressionPreviews: this.#getExpressionPreviews(expressionCount),
      previewLayoutClass: this.#getPreviewLayoutClass(),
      imageDimensions: this.#getImageDimensionsText()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("input, select").on("change", async event => {
      const { name, value, type } = event.currentTarget;
      if (!name) return;
      const parsedValue = type === "number" ? Number(value) : value;
      foundry.utils.setProperty(this.formData, name, parsedValue);
      if (name === "spritesheet") {
        await this.#loadImageMetadata(value, { configure: true });
      }
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
        callback: async path => {
          this.formData.spritesheet = path;
          await this.#loadImageMetadata(path, { configure: true });
          this.render();
        }
      });
      picker.browse();
    });

    html.find("[data-action='create-sprite']").on("click", async event => {
      event.preventDefault();
      await this.#createSprite();
    });

    html.find(".creator-tab").on("click", event => {
      event.preventDefault();
      const tab = event.currentTarget.dataset.tab;
      this.activeTab = tab;
      this.#activateTab(html, tab);
    });

    this.#activateTab(html, this.activeTab);
    this.#renderPreview(html);
    this.#renderExpressionPreviews(html);
  }

  #activateTab(html, tab) {
    html.find(".creator-tab").toggleClass("active", false);
    html.find(`.creator-tab[data-tab='${tab}']`).toggleClass("active", true);
    html.find(".creator-tab-panel").toggleClass("active", false);
    html.find(`.creator-tab-panel[data-tab-panel='${tab}']`).toggleClass("active", true);
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
        rows: 4
      },
      headOffset: {
        x: 0,
        y: 0
      },
      expressionNames: [],
      imageWidth: 0,
      imageHeight: 0,
      configuredSpritesheet: ""
    };
  }

  #getImageDimensionsText() {
    if (!this.formData.imageWidth || !this.formData.imageHeight) {
      return game.i18n.localize("PORTRAIT_SPRITES.Creator.ImageDimensionsUnknown");
    }
    return game.i18n.format("PORTRAIT_SPRITES.Creator.ImageDimensions", {
      width: this.formData.imageWidth,
      height: this.formData.imageHeight
    });
  }

  #loadImageMetadata(src, { configure = false } = {}) {
    if (!src) return Promise.resolve(null);

    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        this.formData.imageWidth = width;
        this.formData.imageHeight = height;
        if (configure && this.formData.configuredSpritesheet !== src) {
          this.#autoConfigureFrames(width, height);
          this.formData.configuredSpritesheet = src;
        }
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  #autoConfigureFrames(imageWidth, imageHeight) {
    const columns = Math.max(1, this.formData.headGrid.columns || 4);
    const rows = Math.max(1, this.formData.headGrid.rows || 4);
    const tallLayout = imageHeight >= imageWidth;

    if (tallLayout) {
      const bodyHeight = Math.max(1, Math.round(imageHeight * 0.6));
      const gridHeight = Math.max(1, imageHeight - bodyHeight);
      this.formData.bodyFrame = {
        x: 0,
        y: 0,
        width: imageWidth,
        height: bodyHeight
      };
      this.formData.headGrid = {
        ...this.formData.headGrid,
        startX: 0,
        startY: bodyHeight,
        cellWidth: Math.max(1, Math.floor(imageWidth / columns)),
        cellHeight: Math.max(1, Math.floor(gridHeight / rows)),
        columns,
        rows
      };
      return;
    }

    const bodyWidth = Math.max(1, Math.round(imageWidth * 0.45));
    const gridWidth = Math.max(1, imageWidth - bodyWidth);
    this.formData.bodyFrame = {
      x: 0,
      y: 0,
      width: bodyWidth,
      height: imageHeight
    };
    this.formData.headGrid = {
      ...this.formData.headGrid,
      startX: bodyWidth,
      startY: 0,
      cellWidth: Math.max(1, Math.floor(gridWidth / columns)),
      cellHeight: Math.max(1, Math.floor(imageHeight / rows)),
      columns,
      rows
    };
  }

  #getExpressionCount() {
    return Math.max(0, this.formData.headGrid.columns * this.formData.headGrid.rows);
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

  #getExpressionPreviews(count) {
    const names = this.#getExpressionNames(count);
    return names.map((name, index) => ({
      name,
      displayIndex: index + 1
    }));
  }

  #getPreviewLayoutClass() {
    const width = Math.max(1, this.formData.bodyFrame.width + this.formData.bodyFrame.x, this.formData.headGrid.startX + (this.formData.headGrid.columns * this.formData.headGrid.cellWidth));
    const height = Math.max(1, this.formData.bodyFrame.height + this.formData.bodyFrame.y, this.formData.headGrid.startY + (this.formData.headGrid.rows * this.formData.headGrid.cellHeight));
    return width > height * 1.25 ? "preview-layout-wide" : "preview-layout-tall";
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

  #renderPreview(html) {
    const canvasElement = html.find(".sprite-preview-canvas")[0];
    if (!canvasElement) return;
    const context = canvasElement.getContext("2d");
    if (!context) return;

    const fallbackWidth = Math.max(1, this.formData.bodyFrame.width + this.formData.bodyFrame.x);
    const fallbackHeight = Math.max(1, this.formData.bodyFrame.height + this.formData.bodyFrame.y);
    canvasElement.width = fallbackWidth;
    canvasElement.height = fallbackHeight;

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
      canvasElement.width = image.naturalWidth || image.width;
      canvasElement.height = image.naturalHeight || image.height;
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      context.drawImage(image, 0, 0);
      this.formData.imageWidth = canvasElement.width;
      this.formData.imageHeight = canvasElement.height;
      html.find(".image-dimensions").text(this.#getImageDimensionsText());
      this.#drawOverlays(context);
    };
    image.src = this.formData.spritesheet;
  }

  #renderExpressionPreviews(html) {
    if (!this.formData.spritesheet) return;

    const image = new Image();
    image.onload = () => {
      html.find(".expression-preview-canvas").each((_, canvasElement) => {
        const index = Number(canvasElement.dataset.expressionIndex);
        const context = canvasElement.getContext("2d");
        if (!context || Number.isNaN(index)) return;

        const column = index % this.formData.headGrid.columns;
        const row = Math.floor(index / this.formData.headGrid.columns);
        const sourceX = this.formData.headGrid.startX + column * this.formData.headGrid.cellWidth;
        const sourceY = this.formData.headGrid.startY + row * this.formData.headGrid.cellHeight;

        context.clearRect(0, 0, canvasElement.width, canvasElement.height);
        context.fillStyle = "#020617";
        context.fillRect(0, 0, canvasElement.width, canvasElement.height);
        context.drawImage(
          image,
          sourceX,
          sourceY,
          this.formData.headGrid.cellWidth,
          this.formData.headGrid.cellHeight,
          0,
          0,
          canvasElement.width,
          canvasElement.height
        );
        context.strokeStyle = "rgba(34, 211, 238, 0.98)";
        context.lineWidth = 4;
        context.strokeRect(2, 2, canvasElement.width - 4, canvasElement.height - 4);
      });
    };
    image.src = this.formData.spritesheet;
  }


  #drawOverlays(context) {
    context.save();

    context.strokeStyle = "rgba(248, 113, 113, 0.98)";
    context.lineWidth = 5;
    context.strokeRect(
      this.formData.bodyFrame.x,
      this.formData.bodyFrame.y,
      this.formData.bodyFrame.width,
      this.formData.bodyFrame.height
    );

    context.strokeStyle = "rgba(244, 114, 182, 0.98)";
    context.lineWidth = 5;
    context.strokeRect(
      this.formData.headGrid.startX,
      this.formData.headGrid.startY,
      this.formData.headGrid.columns * this.formData.headGrid.cellWidth,
      this.formData.headGrid.rows * this.formData.headGrid.cellHeight
    );

    context.lineWidth = 4;
    const count = this.#getExpressionCount();
    for (let i = 0; i < count; i += 1) {
      const column = i % this.formData.headGrid.columns;
      const row = Math.floor(i / this.formData.headGrid.columns);
      const x = this.formData.headGrid.startX + column * this.formData.headGrid.cellWidth;
      const y = this.formData.headGrid.startY + row * this.formData.headGrid.cellHeight;
      context.strokeStyle = "rgba(34, 211, 238, 0.98)";
      context.strokeRect(x, y, this.formData.headGrid.cellWidth, this.formData.headGrid.cellHeight);
    }

    context.restore();
  }

  #getExpressionColor(index) {
    const hue = (index * 47) % 360;
    return `hsla(${hue}, 90%, 62%, 0.95)`;
  }
}
