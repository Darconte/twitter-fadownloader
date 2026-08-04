/* content/furaffinity.js */
(() => {
  'use strict';

  function extractMediaUrlFromDoc(doc) {
    // Strategy 1: Download button
    const downloadBtn = Array.from(doc.querySelectorAll('a')).find((a) => {
      const text = a.textContent ? a.textContent.toLowerCase() : '';
      const href = a.getAttribute('href') || '';
      return (text.includes('download') || href.includes('/art/')) && href.includes('d.furaffinity.net');
    });
    if (downloadBtn && downloadBtn.href) return downloadBtn.href;

    // Strategy 2: Main image element
    const mainImg = doc.querySelector('#submissionImg') || doc.querySelector('.submission-area img');
    if (mainImg && mainImg.src) {
      return mainImg.src.replace('/t.furaffinity.net/', '/d.furaffinity.net/');
    }

    // Strategy 3: Direct CDN link
    const cdnLink = doc.querySelector('a[href*="d.furaffinity.net/art/"]');
    if (cdnLink && cdnLink.href) return cdnLink.href;

    return null;
  }

  function extractMetadataFromDoc(doc, mediaUrl, pageUrl) {
    let author = 'furaffinity';
    let submissionId = 'submission';

    const authorElem = doc.querySelector('.submission-title + a, .artist-name, a[href*="/user/"]');
    if (authorElem && authorElem.textContent) {
      author = authorElem.textContent.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    }

    if (pageUrl) {
      const match = pageUrl.match(/\/view\/(\d+)/);
      if (match) submissionId = match[1];
    }

    let ext = 'png';
    if (mediaUrl) {
      const cleanUrl = mediaUrl.split('?')[0];
      const parts = cleanUrl.split('.');
      if (parts.length > 1) ext = parts.pop().toLowerCase();
    }

    return {
      author: author || 'furaffinity',
      tweetId: submissionId,
      index: '0',
      ext: ext
    };
  }

  function triggerDownload(mediaUrl, vars) {
    const finalUrl = mediaUrl.startsWith('//') ? `https:${mediaUrl}` : mediaUrl;
    browser.runtime.sendMessage({
      type: 'download',
      payload: {
        url: finalUrl,
        vars: vars
      }
    });
  }

  async function resolveAndDownload(targetEl, event) {
    let galleryLink = null;

    // Inspect drag event data for links if targetEl is generic
    if (event && event.dataTransfer) {
      const htmlData = event.dataTransfer.getData('text/html');
      if (htmlData) {
        const parser = new DOMParser();
        const parsed = parser.parseFromString(htmlData, 'text/html');
        galleryLink = parsed.querySelector('a[href*="/view/"]');
      }
    }

    if (!galleryLink && targetEl) {
      if (targetEl.closest) {
        galleryLink = targetEl.closest('a[href*="/view/"]');
      }
      if (!galleryLink && targetEl.querySelector) {
        galleryLink = targetEl.querySelector('a[href*="/view/"]');
      }
    }

    // 1. Handle Gallery Preview Drop (fetches view page in background)
    if (galleryLink && galleryLink.href) {
      try {
        const res = await fetch(galleryLink.href);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const mediaUrl = extractMediaUrlFromDoc(doc);
        if (mediaUrl) {
          const vars = extractMetadataFromDoc(doc, mediaUrl, galleryLink.href);
          triggerDownload(mediaUrl, vars);
          return;
        }
      } catch (err) {
        console.error('[X Media Saver] Error fetching gallery submission:', err);
      }
    }

    // 2. Handle Single Submission Page
    const mediaUrl = extractMediaUrlFromDoc(document);
    if (mediaUrl) {
      const vars = extractMetadataFromDoc(document, mediaUrl, window.location.href);
      triggerDownload(mediaUrl, vars);
    } else {
      console.error('[X Media Saver] Error: Could not find Fur Affinity download link');
    }
  }

  function init() {
    if (window.XMS_floatingDrag) {
      window.XMS_floatingDrag.ensureIcon({
        onDrop: (targetEl, event) => resolveAndDownload(targetEl, event)
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();