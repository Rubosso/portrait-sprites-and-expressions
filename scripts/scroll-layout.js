const VIEWPORT_MARGIN = 64;
const CREATOR_PREFERRED_HEIGHT = 700;
const PICKER_PREFERRED_HEIGHT = 620;

function getContentElement(root) {
  return root?.querySelector?.('[data-application-part="content"]')
    ?? root?.querySelector?.('.window-content')
    ?? null;
}

function clampApplicationHeight(application, preferredHeight) {
  const root = application.element;
  if (!root) return;

  const viewportHeight = Math.max(420, window.innerHeight - VIEWPORT_MARGIN);
  const rectangle = root.getBoundingClientRect();
  const currentHeight = rectangle.height || preferredHeight;
  const requestedHeight = currentHeight >= 420 ? currentHeight : preferredHeight;
  const targetHeight = Math.min(requestedHeight, viewportHeight);

  if (Math.abs(currentHeight - targetHeight) > 1) {
    application.setPosition?.({ height: targetHeight });
  }

  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.maxHeight = `${viewportHeight}px`;
  root.style.overflow = 'hidden';
}

function installWheelScrolling(element) {
  if (!element || element.dataset.portraitWheelScroll === 'true') return;
  element.dataset.portraitWheelScroll = 'true';
  element.addEventListener('wheel', event => {
    if (element.scrollHeight <= element.clientHeight + 1) return;
    const previous = element.scrollTop;
    const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.max(0, Math.min(maximum, previous + event.deltaY));
    if (element.scrollTop !== previous) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true, passive: false });
}

function scheduleLayout(application, configure) {
  window.cancelAnimationFrame(application._portraitLayoutFrame);
  application._portraitLayoutFrame = window.requestAnimationFrame(() => {
    configure(application);
    window.requestAnimationFrame(() => configure(application));
  });
}

function observeLayout(application, configure) {
  const root = application.element;
  if (!root || application._portraitObservedRoot === root) return;

  application._portraitLayoutObserver?.disconnect?.();
  application._portraitObservedRoot = root;
  application._portraitLayoutObserver = new ResizeObserver(() => scheduleLayout(application, configure));
  application._portraitLayoutObserver.observe(root);
}

function configureCreatorLayout(application) {
  const root = application.element;
  if (!root) return;
  clampApplicationHeight(application, CREATOR_PREFERRED_HEIGHT);

  const content = getContentElement(root);
  const form = root.querySelector('.sprite-creator-form');
  const tabContent = root.querySelector('.creator-tab-content');
  const panels = [...root.querySelectorAll('.creator-tab-panel')];
  if (!content || !form || !tabContent) return;

  Object.assign(content.style, {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
    minHeight: '0',
    height: 'auto',
    overflow: 'hidden'
  });

  Object.assign(form.style, {
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr) auto',
    flex: '1 1 auto',
    height: '100%',
    maxHeight: '100%',
    minHeight: '0',
    overflow: 'hidden'
  });

  Object.assign(tabContent.style, {
    minHeight: '0',
    height: '100%',
    overflow: 'hidden'
  });

  for (const panel of panels) {
    const active = panel.classList.contains('active');
    Object.assign(panel.style, {
      boxSizing: 'border-box',
      height: '100%',
      maxHeight: '100%',
      minHeight: '0',
      overflowX: 'hidden',
      overflowY: active ? 'scroll' : 'hidden',
      overscrollBehavior: 'contain',
      scrollbarGutter: 'stable'
    });
    installWheelScrolling(panel);
  }
}

function drawNoExpressionPreview(canvasElement) {
  const context = canvasElement.getContext('2d');
  if (!context) return;
  const { width, height } = canvasElement;
  context.clearRect(0, 0, width, height);
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.72)';
  context.lineWidth = Math.max(3, width * 0.035);
  context.beginPath();
  context.arc(width / 2, height / 2, Math.min(width, height) * 0.25, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(width * 0.32, height * 0.68);
  context.lineTo(width * 0.68, height * 0.32);
  context.stroke();
  context.restore();
}

function drawHeadPreview(canvasElement, image, sprite, expressionIndex) {
  if (expressionIndex === -1) {
    drawNoExpressionPreview(canvasElement);
    return;
  }

  const context = canvasElement.getContext('2d');
  const frame = sprite.headFrames?.[expressionIndex];
  if (!context || !frame || !image) return;

  const padding = 8;
  const scale = Math.min(
    (canvasElement.width - padding * 2) / Math.max(1, frame.width),
    (canvasElement.height - padding * 2) / Math.max(1, frame.height)
  );
  const drawWidth = frame.width * scale;
  const drawHeight = frame.height * scale;
  const drawX = (canvasElement.width - drawWidth) / 2;
  const drawY = (canvasElement.height - drawHeight) / 2;

  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function configurePickerLayout(application) {
  const root = application.element;
  if (!root) return;
  clampApplicationHeight(application, PICKER_PREFERRED_HEIGHT);

  const content = getContentElement(root);
  const picker = root.querySelector('.expression-picker-content');
  const grid = root.querySelector('.expression-choice-grid');
  if (!content || !picker || !grid) return;

  Object.assign(content.style, {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
    minHeight: '0',
    height: 'auto',
    overflow: 'hidden'
  });

  Object.assign(picker.style, {
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    flex: '1 1 auto',
    height: '100%',
    minHeight: '0',
    overflow: 'hidden'
  });

  Object.assign(grid.style, {
    alignContent: 'start',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
    minHeight: '0',
    height: '100%',
    overflowX: 'hidden',
    overflowY: 'scroll',
    overscrollBehavior: 'contain',
    scrollbarGutter: 'stable'
  });
  installWheelScrolling(grid);
}

function renderHeadOnlyPreviews(application) {
  const root = application.element;
  if (!root) return;
  loadImage(application.sprite?.spritesheet).then(image => {
    if (!application.element?.isConnected) return;
    window.requestAnimationFrame(() => {
      application.element.querySelectorAll('.expression-choice-preview').forEach(canvasElement => {
        const index = Number(canvasElement.dataset.expressionIndex);
        if (!Number.isInteger(index)) return;
        drawHeadPreview(canvasElement, image, application.sprite, index);
      });
    });
  });
}

export function installScrollableApplicationLayouts(PortraitSpriteCreator, PortraitExpressionPicker) {
  if (!PortraitSpriteCreator.prototype.portraitScrollingInstalled) {
    Object.defineProperty(PortraitSpriteCreator.prototype, 'portraitScrollingInstalled', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });

    const originalCreatorRender = PortraitSpriteCreator.prototype._onRender;
    PortraitSpriteCreator.prototype._onRender = function(...args) {
      const result = originalCreatorRender.apply(this, args);
      scheduleLayout(this, configureCreatorLayout);
      observeLayout(this, configureCreatorLayout);
      this.element.querySelector('.creator-tabs')?.addEventListener('click', () => {
        scheduleLayout(this, configureCreatorLayout);
      }, { capture: true });
      return result;
    };
  }

  if (!PortraitExpressionPicker.prototype.portraitScrollingInstalled) {
    Object.defineProperty(PortraitExpressionPicker.prototype, 'portraitScrollingInstalled', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });

    const originalPickerRender = PortraitExpressionPicker.prototype._onRender;
    PortraitExpressionPicker.prototype._onRender = function(...args) {
      const result = originalPickerRender.apply(this, args);
      scheduleLayout(this, configurePickerLayout);
      observeLayout(this, configurePickerLayout);
      renderHeadOnlyPreviews(this);

      this.element.querySelectorAll('.expression-choice[data-expression-index]').forEach(card => {
        card.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          card.click();
        });
      });
      return result;
    };
  }
}
