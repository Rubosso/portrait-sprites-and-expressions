export class PortraitSpriteCreator extends Application {
  constructor(options = {}) {
    super(options);
    this.formData = this.#getDefaultData();
    this.activeTab = "coordinates";
    this.previewImage = null;
    this.dragState = null;
    this.finalPreviewIndex = 0;
    this.finalPreviewInterval = null;
    this.finalPreviewPoint = null;
    this.finalPreviewZoom = 4;
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
    this.#renderFinalPreview(html);
    this.#activatePreviewDragging(html);
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
        x: 371,
        y: 150,
        width: 303,
        height: 619
      },
      headGrid: {
        startX: 0,
        startY: 768,
        cellWidth: 256,
        cellHeight: 256,
        columns: 4,
        rows: 7
      },
      headOffset: {
        x: 13,
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
          this.#autoConfigureFrames(image);
          this.formData.configuredSpritesheet = src;
        }
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  #autoConfigureFrames(image) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const knownConfiguration = this.#getKnownConfiguration(imageWidth, imageHeight);
    if (knownConfiguration) {
      this.formData.bodyFrame = knownConfiguration.bodyFrame;
      this.formData.headGrid = {
        ...this.formData.headGrid,
        ...knownConfiguration.headGrid
      };
      this.formData.headOffset = knownConfiguration.headOffset;
      return;
    }

    const measured = this.#measureSpritesheet(image, imageWidth, imageHeight);
    if (measured) {
      this.formData.bodyFrame = measured.bodyFrame;
      this.formData.headGrid = {
        ...this.formData.headGrid,
        ...measured.headGrid
      };
      return;
    }

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

  #getKnownConfiguration(imageWidth, imageHeight) {
    if (imageWidth !== 1024 || imageHeight < 1792) return null;

    return {
      bodyFrame: {
        x: 371,
        y: 150,
        width: 303,
        height: 619
      },
      headGrid: {
        startX: 0,
        startY: 768,
        cellWidth: 256,
        cellHeight: 256,
        columns: 4,
        rows: 7
      },
      headOffset: {
        x: 13,
        y: 0
      }
    };
  }

  #measureSpritesheet(image, imageWidth, imageHeight) {
    const canvasElement = document.createElement("canvas");
    canvasElement.width = imageWidth;
    canvasElement.height = imageHeight;
    const context = canvasElement.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, imageWidth, imageHeight);
    const rowCounts = Array(imageHeight).fill(0);
    const columnCounts = Array(imageWidth).fill(0);

    for (let y = 0; y < imageHeight; y += 1) {
      for (let x = 0; x < imageWidth; x += 1) {
        const index = (y * imageWidth + x) * 4;
        const alpha = data[index + 3];
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const isVisible = alpha > 12 && (red > 12 || green > 12 || blue > 12);
        if (isVisible) {
          rowCounts[y] += 1;
          columnCounts[x] += 1;
        }
      }
    }

    const rowBands = this.#findContentBands(rowCounts, Math.max(6, imageWidth * 0.03), 8);
    if (rowBands.length < 2) return null;

    const bodyBand = rowBands[0];
    const expressionBands = rowBands.slice(1);
    const gridStartY = expressionBands[0].start;
    const gridEndY = expressionBands[expressionBands.length - 1].end;
    const gridColumnCounts = Array(imageWidth).fill(0);

    for (let y = gridStartY; y <= gridEndY; y += 1) {
      for (let x = 0; x < imageWidth; x += 1) {
        const index = (y * imageWidth + x) * 4;
        const alpha = data[index + 3];
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        if (alpha > 12 && (red > 12 || green > 12 || blue > 12)) {
          gridColumnCounts[x] += 1;
        }
      }
    }

    const columnBands = this.#findContentBands(gridColumnCounts, Math.max(6, (gridEndY - gridStartY + 1) * 0.03), 8);
    const columns = Math.max(1, columnBands.length || this.formData.headGrid.columns || 4);
    const rows = Math.max(1, expressionBands.length || this.formData.headGrid.rows || 4);
    const gridStartX = columnBands.length ? columnBands[0].start : 0;
    const gridEndX = columnBands.length ? columnBands[columnBands.length - 1].end : imageWidth - 1;
    const gridWidth = Math.max(1, gridEndX - gridStartX + 1);
    const gridHeight = Math.max(1, gridEndY - gridStartY + 1);

    return {
      bodyFrame: {
        x: 0,
        y: Math.max(0, bodyBand.start),
        width: imageWidth,
        height: Math.max(1, gridStartY - bodyBand.start)
      },
      headGrid: {
        startX: gridStartX,
        startY: gridStartY,
        cellWidth: Math.max(1, Math.ceil(gridWidth / columns)),
        cellHeight: Math.max(1, Math.ceil(gridHeight / rows)),
        columns,
        rows
      }
    };
  }

  #findContentBands(counts, threshold, gapTolerance) {
    const bands = [];
    let start = null;
    let lastContent = null;

    counts.forEach((count, index) => {
      if (count >= threshold) {
        if (start === null) start = index;
        lastContent = index;
        return;
      }

      if (start !== null && lastContent !== null && index - lastContent > gapTolerance) {
        bands.push({ start, end: lastContent });
        start = null;
        lastContent = null;
      }
    });

    if (start !== null && lastContent !== null) {
      bands.push({ start, end: lastContent });
    }
    return bands.filter(band => band.end - band.start > 4);
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
      this.previewImage = image;
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      context.drawImage(image, 0, 0);
      this.formData.imageWidth = canvasElement.width;
      this.formData.imageHeight = canvasElement.height;
      html.find(".image-dimensions").text(this.#getImageDimensionsText());
      this.#drawOverlays(context);
      this.#renderFinalPreview(html);
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
      });
    };
    image.src = this.formData.spritesheet;
  }


  #renderFinalPreview(html) {
    const canvasElement = html.find(".final-sprite-preview-canvas")[0];
    if (!canvasElement) return;
    if (this.finalPreviewInterval) {
      clearInterval(this.finalPreviewInterval);
      this.finalPreviewInterval = null;
    }

    const magnifierCanvas = html.find(".final-magnifier-canvas")[0];
    this.#activateFinalPreviewMagnifier(canvasElement, magnifierCanvas);

    const draw = () => {
      this.#drawFinalPreview(canvasElement);
      this.#drawFinalMagnifier(canvasElement, magnifierCanvas);
    };
    draw();
    this.finalPreviewInterval = setInterval(() => {
      this.finalPreviewIndex = (this.finalPreviewIndex + 1) % Math.max(1, this.#getExpressionCount());
      draw();
    }, 1000);
  }


  #activateFinalPreviewMagnifier(canvasElement, magnifierCanvas) {
    if (!canvasElement || !magnifierCanvas) return;

    canvasElement.addEventListener("mousemove", event => {
      this.finalPreviewPoint = this.#getCanvasPoint(canvasElement, event);
      this.#drawFinalMagnifier(canvasElement, magnifierCanvas);
    });

    canvasElement.addEventListener("mouseleave", () => {
      this.finalPreviewPoint = null;
      this.#drawFinalMagnifier(canvasElement, magnifierCanvas);
    });

    canvasElement.addEventListener("wheel", event => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      this.finalPreviewZoom = Math.min(12, Math.max(2, this.finalPreviewZoom + direction));
      this.finalPreviewPoint = this.#getCanvasPoint(canvasElement, event);
      this.#drawFinalMagnifier(canvasElement, magnifierCanvas);
    }, { passive: false });
  }

  #drawFinalMagnifier(sourceCanvas, magnifierCanvas) {
    if (!magnifierCanvas) return;
    const context = magnifierCanvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#111827";
    context.fillRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);

    if (!sourceCanvas.width || !sourceCanvas.height) return;

    const point = this.finalPreviewPoint || {
      x: sourceCanvas.width / 2,
      y: sourceCanvas.height / 2
    };
    const zoom = this.finalPreviewZoom;
    const sourceWidth = Math.min(sourceCanvas.width, magnifierCanvas.width / zoom);
    const sourceHeight = Math.min(sourceCanvas.height, magnifierCanvas.height / zoom);
    const sourceX = Math.max(0, Math.min(sourceCanvas.width - sourceWidth, point.x - sourceWidth / 2));
    const sourceY = Math.max(0, Math.min(sourceCanvas.height - sourceHeight, point.y - sourceHeight / 2));

    context.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      magnifierCanvas.width,
      magnifierCanvas.height
    );

    context.strokeStyle = "#facc15";
    context.lineWidth = 2;
    context.strokeRect(1, 1, magnifierCanvas.width - 2, magnifierCanvas.height - 2);
    context.fillStyle = "rgba(17, 24, 39, 0.8)";
    context.fillRect(8, 8, 54, 22);
    context.fillStyle = "#facc15";
    context.font = "12px sans-serif";
    context.fillText(`${zoom}x`, 18, 23);
  }


  #drawFinalPreview(canvasElement) {
    const context = canvasElement.getContext("2d");
    if (!context) return;
    canvasElement.width = Math.max(1, this.formData.bodyFrame.width);
    canvasElement.height = Math.max(1, this.formData.bodyFrame.height);
    context.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (!this.previewImage) {
      context.fillStyle = "#111827";
      context.fillRect(0, 0, canvasElement.width, canvasElement.height);
      return;
    }

    context.drawImage(
      this.previewImage,
      this.formData.bodyFrame.x,
      this.formData.bodyFrame.y,
      this.formData.bodyFrame.width,
      this.formData.bodyFrame.height,
      0,
      0,
      this.formData.bodyFrame.width,
      this.formData.bodyFrame.height
    );

    const frameIndex = this.finalPreviewIndex % Math.max(1, this.#getExpressionCount());
    const column = frameIndex % this.formData.headGrid.columns;
    const row = Math.floor(frameIndex / this.formData.headGrid.columns);
    const sourceX = this.formData.headGrid.startX + column * this.formData.headGrid.cellWidth;
    const sourceY = this.formData.headGrid.startY + row * this.formData.headGrid.cellHeight;
    context.drawImage(
      this.previewImage,
      sourceX,
      sourceY,
      this.formData.headGrid.cellWidth,
      this.formData.headGrid.cellHeight,
      this.formData.headOffset.x,
      this.formData.headOffset.y,
      this.formData.headGrid.cellWidth,
      this.formData.headGrid.cellHeight
    );
  }


  #activatePreviewDragging(html) {
    const canvasElement = html.find(".sprite-preview-canvas")[0];
    if (!canvasElement) return;

    canvasElement.addEventListener("pointerdown", event => {
      if (!this.previewImage) return;
      const point = this.#getCanvasPoint(canvasElement, event);
      const hit = this.#hitTestPreview(point);
      if (!hit) return;
      event.preventDefault();
      canvasElement.setPointerCapture(event.pointerId);
      this.dragState = {
        ...hit,
        startPoint: point,
        bodyFrame: { ...this.formData.bodyFrame },
        headGrid: { ...this.formData.headGrid },
        headOffset: { ...this.formData.headOffset }
      };
    });

    canvasElement.addEventListener("pointermove", event => {
      if (!this.dragState) return;
      event.preventDefault();
      const point = this.#getCanvasPoint(canvasElement, event);
      this.#applyPreviewDrag(point);
      this.#syncCoordinateInputs(html);
      this.#redrawPreview(canvasElement);
    });

    canvasElement.addEventListener("pointerup", event => {
      if (!this.dragState) return;
      event.preventDefault();
      this.dragState = null;
      this.render(false);
    });
  }

  #getCanvasPoint(canvasElement, event) {
    const rect = canvasElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasElement.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasElement.height
    };
  }

  #hitTestPreview(point) {
    const headHit = this.#hitTestRect(point, this.#getHeadPlacementRect(), "head");
    if (headHit) return { ...headHit, mode: "move", handle: "" };

    const gridHit = this.#hitTestRect(point, this.#getGridRect(), "grid");
    if (gridHit) return gridHit;

    return this.#hitTestRect(point, this.formData.bodyFrame, "body");
  }

  #hitTestRect(point, rect, target) {
    const tolerance = 12;
    const inside = point.x >= rect.x - tolerance && point.x <= rect.x + rect.width + tolerance && point.y >= rect.y - tolerance && point.y <= rect.y + rect.height + tolerance;
    if (!inside) return null;

    const nearLeft = Math.abs(point.x - rect.x) <= tolerance;
    const nearRight = Math.abs(point.x - (rect.x + rect.width)) <= tolerance;
    const nearTop = Math.abs(point.y - rect.y) <= tolerance;
    const nearBottom = Math.abs(point.y - (rect.y + rect.height)) <= tolerance;
    const handle = `${nearTop ? "n" : ""}${nearBottom ? "s" : ""}${nearLeft ? "w" : ""}${nearRight ? "e" : ""}`;
    return { target, mode: handle ? "resize" : "move", handle };
  }

  #applyPreviewDrag(point) {
    const dx = Math.round(point.x - this.dragState.startPoint.x);
    const dy = Math.round(point.y - this.dragState.startPoint.y);
    if (this.dragState.target === "body") {
      this.formData.bodyFrame = this.#resizeOrMoveRect(this.dragState.bodyFrame, dx, dy, this.dragState);
      return;
    }

    if (this.dragState.target === "head") {
      this.formData.headOffset = {
        x: this.dragState.headOffset.x + dx,
        y: this.dragState.headOffset.y + dy
      };
      return;
    }

    const startRect = {
      x: this.dragState.headGrid.startX,
      y: this.dragState.headGrid.startY,
      width: this.dragState.headGrid.cellWidth * this.dragState.headGrid.columns,
      height: this.dragState.headGrid.cellHeight * this.dragState.headGrid.rows
    };
    const rect = this.#resizeOrMoveRect(startRect, dx, dy, this.dragState);
    this.formData.headGrid.startX = rect.x;
    this.formData.headGrid.startY = rect.y;
    this.formData.headGrid.cellWidth = Math.max(1, Math.round(rect.width / this.formData.headGrid.columns));
    this.formData.headGrid.cellHeight = Math.max(1, Math.round(rect.height / this.formData.headGrid.rows));
  }

  #resizeOrMoveRect(rect, dx, dy, dragState) {
    const next = { ...rect };
    if (dragState.mode === "move") {
      next.x += dx;
      next.y += dy;
    } else {
      if (dragState.handle.includes("w")) {
        next.x += dx;
        next.width -= dx;
      }
      if (dragState.handle.includes("e")) next.width += dx;
      if (dragState.handle.includes("n")) {
        next.y += dy;
        next.height -= dy;
      }
      if (dragState.handle.includes("s")) next.height += dy;
    }
    next.width = Math.max(1, next.width);
    next.height = Math.max(1, next.height);
    return next;
  }

  #syncCoordinateInputs(html) {
    const values = {
      "bodyFrame.x": this.formData.bodyFrame.x,
      "bodyFrame.y": this.formData.bodyFrame.y,
      "bodyFrame.width": this.formData.bodyFrame.width,
      "bodyFrame.height": this.formData.bodyFrame.height,
      "headGrid.startX": this.formData.headGrid.startX,
      "headGrid.startY": this.formData.headGrid.startY,
      "headGrid.cellWidth": this.formData.headGrid.cellWidth,
      "headGrid.cellHeight": this.formData.headGrid.cellHeight,
      "headOffset.x": this.formData.headOffset.x,
      "headOffset.y": this.formData.headOffset.y
    };
    Object.entries(values).forEach(([name, value]) => {
      html.find(`[name='${name}']`).val(value);
    });
  }

  #redrawPreview(canvasElement) {
    if (!this.previewImage) return;
    const context = canvasElement.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvasElement.width, canvasElement.height);
    context.drawImage(this.previewImage, 0, 0);
    this.#drawOverlays(context);
  }

  #getGridRect() {
    return {
      x: this.formData.headGrid.startX,
      y: this.formData.headGrid.startY,
      width: this.formData.headGrid.columns * this.formData.headGrid.cellWidth,
      height: this.formData.headGrid.rows * this.formData.headGrid.cellHeight
    };
  }

  #getHeadPlacementRect() {
    return {
      x: this.formData.bodyFrame.x + this.formData.headOffset.x,
      y: this.formData.bodyFrame.y + this.formData.headOffset.y,
      width: this.formData.headGrid.cellWidth,
      height: this.formData.headGrid.cellHeight
    };
  }


  #drawOverlays(context) {
    context.save();

    context.strokeStyle = "rgba(248, 113, 113, 0.98)";
    context.lineWidth = 5;
    this.#strokeInsetRect(context, this.formData.bodyFrame.x, this.formData.bodyFrame.y, this.formData.bodyFrame.width, this.formData.bodyFrame.height);

    const headRect = this.#getHeadPlacementRect();
    context.strokeStyle = "rgba(250, 204, 21, 0.98)";
    context.lineWidth = 6;
    this.#strokeInsetRect(context, headRect.x, headRect.y, headRect.width, headRect.height);

    context.lineWidth = 4;
    const count = this.#getExpressionCount();
    for (let i = 0; i < count; i += 1) {
      const column = i % this.formData.headGrid.columns;
      const row = Math.floor(i / this.formData.headGrid.columns);
      const x = this.formData.headGrid.startX + column * this.formData.headGrid.cellWidth;
      const y = this.formData.headGrid.startY + row * this.formData.headGrid.cellHeight;
      context.strokeStyle = "rgba(34, 211, 238, 0.98)";
      this.#strokeInsetRect(context, x, y, this.formData.headGrid.cellWidth, this.formData.headGrid.cellHeight);
    }

    context.strokeStyle = "rgba(244, 114, 182, 0.98)";
    context.lineWidth = 7;
    this.#strokeInsetRect(context, this.formData.headGrid.startX, this.formData.headGrid.startY, this.formData.headGrid.columns * this.formData.headGrid.cellWidth, this.formData.headGrid.rows * this.formData.headGrid.cellHeight);

    context.restore();
  }

  #strokeInsetRect(context, x, y, width, height) {
    const inset = context.lineWidth / 2;
    context.strokeRect(x + inset, y + inset, Math.max(1, width - context.lineWidth), Math.max(1, height - context.lineWidth));
  }

}
