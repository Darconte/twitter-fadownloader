(() => {
  'use strict';

  const BTN_CLASS = 'xms-download-btn';
  // Use explicit inline styles on elements instead of inline event handlers to satisfy CSP
  const ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width: 1.25em; height: 1.25em; pointer-events: none;"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

  let enabled = true;

  function tweetHasMedia(article) {
    if (article.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.layoutLarge.media"]')) {
      return true;
    }
    const imgs = article.querySelectorAll('img[src*="pbs.twimg.com/media/"]');
    return imgs.length > 0;
  }

  function createButton(replyBtn) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BTN_CLASS;
    button.setAttribute('aria-label', 'Download media');
    button.setAttribute('role', 'button');
    button.setAttribute('data-testid', 'xms-download');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'xms-download-btn-icon';
    iconWrap.style.cssText = 'display: flex; align-items: center; justify-content: center; cursor: pointer;';
    iconWrap.innerHTML = ICON_SVG;
    button.appendChild(iconWrap);

    if (replyBtn) {
      for (const className of replyBtn.classList) {
        if (className.startsWith('css-')) button.classList.add(className);
      }
    }

    return button;
  }

  function injectTweetButtons() {
    if (!enabled) return;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    for (const article of articles) {
      if (article.querySelector(`.${BTN_CLASS}`)) continue;
      if (!tweetHasMedia(article)) continue;

      // Select action bar container cleanly
      const toolbar = article.querySelector('div[role="group"]');
      if (!toolbar) continue;

      const replyBtn = toolbar.querySelector('[data-testid="reply"]') || toolbar.children[0];
      if (!replyBtn) continue;

      const button = createButton(replyBtn);

      // Safe insertion without breaking flex alignment
      if (replyBtn.nextSibling) {
        toolbar.insertBefore(button, replyBtn.nextSibling);
      } else {
        toolbar.appendChild(button);
      }
    }
  }

  function applyEnabled(value) {
    enabled = value !== false;
    if (!enabled) {
      for (const btn of document.querySelectorAll(`.${BTN_CLASS}`)) btn.remove();
      return;
    }
    injectTweetButtons();
  }

  async function loadEnabledSetting() {
    try {
      const stored = await browser.storage.sync.get({ enabled: true });
      applyEnabled(stored.enabled);
    } catch {
      applyEnabled(true);
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'enabled' in changes) {
      applyEnabled(changes.enabled.newValue);
    }
  });

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectTweetButtons();
    });
  }

  function start() {
    loadEnabledSetting();
    injectTweetButtons();
    
    new MutationObserver(scheduleInject).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();