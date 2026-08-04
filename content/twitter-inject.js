(() => {
  'use strict';

  const BTN_CLASS = 'xms-download-btn';
  const ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

  let enabled = true;

  function tweetHasMedia(article) {
    if (article.querySelector('[data-testid="tweetPhoto"]')) return true;
    if (article.querySelector('[data-testid="videoPlayer"]')) return true;
    if (article.querySelector('[data-testid="videoComponent"]')) return true;
    if (article.querySelector('[data-testid="card.layoutLarge.media"]')) return true;
    if (article.querySelector('video')) return true;

    for (const img of article.querySelectorAll('img[src*="twimg.com"]')) {
      const src = img.currentSrc || img.src || '';
      if (src.includes('profile_images') || src.includes('/emoji/')) continue;
      if (src.includes('/media/') || src.includes('pbs.twimg.com')) return true;
    }

    return false;
  }

  function findReplyButton(article) {
    return (
      article.querySelector('[data-testid="reply"]') ||
      article.querySelector('button[aria-label*="Reply" i]') ||
      article.querySelector('a[aria-label*="Reply" i]')
    );
  }

  function findActionAnchor(article, reply) {
    for (const group of article.querySelectorAll('[role="group"]')) {
      if (!group.contains(reply)) continue;
      if (
        !group.querySelector('[data-testid="like"], [data-testid="unlike"]') ||
        !group.querySelector('[data-testid="retweet"], [data-testid="unretweet"]')
      ) {
        continue;
      }

      let anchor = reply;
      while (anchor.parentElement && anchor.parentElement !== group) {
        anchor = anchor.parentElement;
      }
      return { toolbar: group, anchor };
    }

    let node = reply;
    while (node.parentElement && node.parentElement !== article) {
      const parent = node.parentElement;
      const actions = parent.querySelectorAll(
        '[data-testid="reply"], [data-testid="retweet"], [data-testid="like"], [data-testid="unlike"]'
      );
      if (actions.length >= 2) {
        return { toolbar: parent, anchor: node };
      }
      node = parent;
    }

    return { toolbar: reply.parentElement, anchor: reply };
  }

  function createButton(reply) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BTN_CLASS;
    button.setAttribute('aria-label', 'Download media');
    button.setAttribute('role', 'button');
    button.setAttribute('data-testid', 'xms-download');

    const iconWrap = document.createElement('div');
    iconWrap.setAttribute('dir', 'ltr');
    iconWrap.className = 'xms-download-btn-icon';
    iconWrap.innerHTML = ICON_SVG;
    button.appendChild(iconWrap);

    if (reply) {
      for (const name of reply.classList) {
        if (name.startsWith('css-')) button.classList.add(name);
      }
    }

    return button;
  }

  function injectTweetButtons() {
    if (!enabled) return;

    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (article.querySelector(`.${BTN_CLASS}`)) continue;
      if (!tweetHasMedia(article)) continue;

      const reply = findReplyButton(article);
      if (!reply) continue;

      const placement = findActionAnchor(article, reply);
      if (!placement?.toolbar || !placement.anchor) continue;

      const button = createButton(reply);
      placement.toolbar.insertBefore(button, placement.anchor);
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
    window.setInterval(injectTweetButtons, 1500);
    for (const delay of [500, 1500, 4000]) {
      window.setTimeout(injectTweetButtons, delay);
    }
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
