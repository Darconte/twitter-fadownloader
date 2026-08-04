(() => {
  'use strict';

  const FLOAT_CLASS = 'xms-float-icon';
  const ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

  function snapHome(icon) {
    icon.style.transition = 'left 0.28s ease, top 0.28s ease, right 0.28s ease';
    icon.style.left = '';
    icon.style.top = '';
    icon.style.right = '';
    icon.classList.remove('xms-moved');

    window.setTimeout(() => {
      icon.style.transition = '';
    }, 320);
  }

  /**
   * @param {{ onDrop: (clientX: number, clientY: number) => Promise<void>, enabled?: boolean }} options
   */
  window.XMS_createFloatingDragIcon = function createFloatingDragIcon(options) {
    let icon = document.querySelector(`.${FLOAT_CLASS}`);
    let destroyObserver = null;

    function removeIcon() {
      destroyObserver?.();
      destroyObserver = null;
      icon?.remove();
      icon = null;
    }

    function ensureIcon() {
      if (!options.enabled) {
        removeIcon();
        return;
      }

      if (icon) return;

      icon = document.createElement('div');
      icon.className = FLOAT_CLASS;
      icon.setAttribute('role', 'button');
      icon.setAttribute('aria-label', 'Drag onto an image to download');
      icon.title = 'Drag onto an image to download';
      icon.innerHTML = ICON_SVG;

      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;
      let moved = false;

      icon.addEventListener('pointerdown', (event) => {
        dragging = true;
        moved = false;
        icon.setPointerCapture(event.pointerId);
        const rect = icon.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        icon.classList.add('xms-dragging');
        event.preventDefault();
      });

      icon.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        moved = true;
        icon.classList.add('xms-moved');
        icon.style.right = 'auto';
        icon.style.left = `${event.clientX - offsetX}px`;
        icon.style.top = `${event.clientY - offsetY}px`;
      });

      icon.addEventListener('pointerup', async (event) => {
        if (!dragging) return;
        dragging = false;
        icon.classList.remove('xms-dragging');
        icon.releasePointerCapture(event.pointerId);

        if (moved) {
          icon.classList.add('xms-loading');
          try {
            await options.onDrop(event.clientX, event.clientY);
            icon.classList.add('xms-ok');
            window.setTimeout(() => icon.classList.remove('xms-ok'), 1500);
          } catch (error) {
            console.warn('[X Media Saver]', error);
            icon.classList.add('xms-err');
            window.setTimeout(() => icon.classList.remove('xms-err'), 1500);
          } finally {
            icon.classList.remove('xms-loading');
          }
        }

        snapHome(icon);
      });

      icon.addEventListener('pointercancel', () => {
        dragging = false;
        icon.classList.remove('xms-dragging');
        snapHome(icon);
      });

      document.body.appendChild(icon);
    }

    ensureIcon();

    return {
      refresh() {
        ensureIcon();
      },
      destroy() {
        removeIcon();
      }
    };
  };
})();
