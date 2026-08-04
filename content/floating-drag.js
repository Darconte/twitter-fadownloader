/* content/floating-drag.js */
(() => {
  'use strict';

  if (window.XMS_floatingDrag) return;

  let dragIcon = null;
  let currentOnDrop = null;

  function createIcon() {
    if (dragIcon) return dragIcon;

    dragIcon = document.createElement('div');
    dragIcon.id = 'xms-floating-drag-icon';
    dragIcon.innerHTML = '⬇️';
    Object.assign(dragIcon.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '50px',
      height: '50px',
      backgroundColor: '#1b1b1b',
      color: '#ffffff',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
      zIndex: '999999',
      cursor: 'pointer',
      userSelect: 'none',
      border: '2px solid #ff6600',
      transition: 'transform 0.2s, background-color 0.2s'
    });

    // Drag over effects
    dragIcon.addEventListener('dragover', (e) => {
      e.preventDefault();
      dragIcon.style.transform = 'scale(1.15)';
      dragIcon.style.backgroundColor = '#ff6600';
    });

    dragIcon.addEventListener('dragleave', () => {
      dragIcon.style.transform = 'scale(1)';
      dragIcon.style.backgroundColor = '#1b1b1b';
    });

    // Handle Drop
    dragIcon.addEventListener('drop', (e) => {
      e.preventDefault();
      dragIcon.style.transform = 'scale(1)';
      dragIcon.style.backgroundColor = '#1b1b1b';

      // Find the element that was being dragged, or passed under cursor
      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      
      if (typeof currentOnDrop === 'function') {
        currentOnDrop(targetEl, e);
      }
    });

    document.body.appendChild(dragIcon);
    return dragIcon;
  }

  function ensureIcon(optionsOrCb) {
    if (typeof optionsOrCb === 'function') {
      currentOnDrop = optionsOrCb;
    } else if (optionsOrCb && typeof optionsOrCb.onDrop === 'function') {
      currentOnDrop = optionsOrCb.onDrop;
    }

    if (document.body) {
      createIcon();
    } else {
      window.addEventListener('DOMContentLoaded', createIcon);
    }
  }

  window.XMS_floatingDrag = {
    ensureIcon,
    createFloatingDragIcon: ensureIcon
  };
})();