(() => {
  'use strict';

  const settings = {
    enabled: true,
    faFloatingIcon: true,
    faImageFolder: 'FurAffinity',
    faFilenameTemplate: '{artist}_{id}'
  };

  let floatingControl = null;

  function isSubmissionViewPage() {
    return /\/view\/\d+/i.test(location.pathname);
  }

  function parseSubmissionIdFromHref(href) {
    if (!href) return null;
    const match = href.match(/\/view\/(\d+)/i);
    return match ? match[1] : null;
  }

  function parseSubmissionIdFromElement(element) {
    const viewLink = element.closest('a[href*="/view/"]');
    if (viewLink) return parseSubmissionIdFromHref(viewLink.href);

    const figure = element.closest('figure');
    if (figure) {
      const link = figure.querySelector('a[href*="/view/"]');
      if (link) return parseSubmissionIdFromHref(link.href);
    }

    return null;
  }

  function extFromUrl(url) {
    const match = url.match(/\.(\w+)(?:\?|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  function normalizeFaUrl(href) {
    if (!href) return null;
    if (href.startsWith('//')) return `https:${href}`;
    return href;
  }

  function getDownloadLinkFromViewPage() {
    const downloadLink = document.querySelector('#download-link');
    if (downloadLink) {
      const href = normalizeFaUrl(downloadLink.getAttribute('href'));
      if (href?.includes('d.furaffinity.net')) return href;
    }

    const anchors = document.querySelectorAll(
      'a[href*="d.furaffinity.net"], a[href^="//d."]'
    );
    for (const anchor of anchors) {
      const href = normalizeFaUrl(anchor.getAttribute('href'));
      if (!href) continue;
      if (/\.(css|js)(\?|$)/i.test(href)) continue;
      if (/\/(art|download|music|stories)\//i.test(href)) return href;
    }

    return null;
  }

  function getMetaFromViewPage() {
    const id = parseSubmissionIdFromHref(location.pathname) || 'media';

    let artist = 'unknown';
    const artistLink = document.querySelector(
      '.submission-id-submission a[href*="/user/"], .submission-title-sub-container a[href*="/user/"]'
    );
    if (artistLink) {
      const match = artistLink.getAttribute('href')?.match(/\/user\/([^/]+)/i);
      if (match) artist = match[1];
    }

    let title = 'submission';
    const titleEl = document.querySelector('h2.p.m.b, .submission-title h2');
    if (titleEl?.textContent) title = titleEl.textContent.trim();

    return { id, artist, title };
  }

  function findFaTargetAtPoint(x, y) {
    const elements = document.elementsFromPoint(x, y);

    for (const element of elements) {
      if (element.closest('.xms-float-icon')) continue;

      const submissionId = parseSubmissionIdFromElement(element);
      if (submissionId) {
        return { kind: 'submission', submissionId };
      }

      if (isSubmissionViewPage()) {
        if (
          element.id === 'submissionImg' ||
          element.closest('#submissionPage') ||
          element.closest('.submission-area')
        ) {
          return { kind: 'page' };
        }
      }
    }

    return null;
  }

  async function resolveAndDownload(target) {
    let fileUrl = null;
    let meta = { id: 'media', artist: 'unknown', title: 'submission' };

    if (target.kind === 'submission') {
      const response = await browser.runtime.sendMessage({
        type: 'resolveFaSubmission',
        submissionId: target.submissionId
      });
      fileUrl = response?.url || null;
      meta = response?.meta || {
        id: target.submissionId,
        artist: 'unknown',
        title: 'submission'
      };
    } else if (target.kind === 'page' && isSubmissionViewPage()) {
      meta = getMetaFromViewPage();
      fileUrl = getDownloadLinkFromViewPage();

      if (!fileUrl) {
        const response = await browser.runtime.sendMessage({
          type: 'resolveFaSubmission',
          submissionId: meta.id
        });
        fileUrl = response?.url || null;
        if (response?.meta) meta = response.meta;
      }
    }

    if (!fileUrl) {
      throw new Error('Could not find Fur Affinity download link');
    }

    const result = await browser.runtime.sendMessage({
      type: 'downloadFa',
      payload: {
        url: fileUrl,
        vars: {
          artist: meta.artist,
          id: meta.id,
          title: meta.title,
          ext: extFromUrl(fileUrl)
        },
        folder: settings.faImageFolder,
        template: settings.faFilenameTemplate
      }
    });

    if (!result?.ok) throw new Error(result?.error || 'Download failed');
  }

  function applySettings() {
    if (!settings.enabled || !settings.faFloatingIcon) {
      floatingControl?.destroy();
      floatingControl = null;
      return;
    }

    if (!floatingControl) {
      floatingControl = window.XMS_createFloatingDragIcon({
        enabled: true,
        onDrop: async (x, y) => {
          const target = findFaTargetAtPoint(x, y);
          if (!target) {
            throw new Error('Drop on a gallery thumbnail or submission image');
          }
          await resolveAndDownload(target);
        }
      });
    } else {
      floatingControl.refresh();
    }
  }

  async function loadSettings() {
    try {
      const stored = await browser.runtime.sendMessage({ type: 'getSettings' });
      if (stored) Object.assign(settings, stored);
    } catch {
      /* defaults */
    }
    applySettings();
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const key of Object.keys(changes)) {
      settings[key] = changes[key].newValue;
    }
    applySettings();
  });

  function start() {
    loadSettings();
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
