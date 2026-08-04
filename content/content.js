(() => {
  'use strict';

  const BTN_CLASS = 'xms-download-btn';

  const settings = {
    preferOriginalQuality: true
  };

  const byMedia = new Map();
  const byTweet = new Map();

  document.addEventListener('xms:media', (event) => {
    try {
      const entries = JSON.parse(event.detail);
      for (const entry of entries) {
        if (entry.mediaId) byMedia.set(entry.mediaId, entry);
        if (entry.tweetId && !byTweet.has(entry.tweetId)) {
          byTweet.set(entry.tweetId, entry);
        }
      }
    } catch {
      /* ignore */
    }
  });

  document.dispatchEvent(new CustomEvent('xms:ready'));

  function getTweetMeta(article) {
    let author = 'unknown';
    let tweetId = null;

    const statusLink = article.querySelector('a[href*="/status/"]');
    if (statusLink) {
      const match = statusLink.getAttribute('href').match(/^\/([^/?#]+)\/status\/(\d+)/);
      if (match) {
        author = match[1];
        tweetId = match[2];
      }
    }

    if (!tweetId) {
      const pathMatch = location.pathname.match(/^\/([^/?#]+)\/status\/(\d+)/);
      if (pathMatch) {
        author = pathMatch[1];
        tweetId = pathMatch[2];
      }
    }

    return { author, tweetId };
  }

  function toOriginalImageUrl(url) {
    if (!url || !url.includes('pbs.twimg.com')) return url;

    try {
      const parsed = new URL(url);
      parsed.searchParams.set('name', 'orig');
      if (!parsed.searchParams.has('format')) {
        const formatMatch = url.match(/format=(\w+)/);
        parsed.searchParams.set('format', formatMatch ? formatMatch[1] : 'jpg');
      }
      return parsed.toString();
    } catch {
      return url.replace(/name=(small|medium|large)/, 'name=orig');
    }
  }

  function guessExtFromUrl(url, fallback) {
    try {
      const parsed = new URL(url);
      const format = parsed.searchParams.get('format');
      if (format) return format.toLowerCase();
    } catch {
      /* ignore */
    }
    const pathMatch = url.match(/\.(\w+)(?:\?|$)/);
    return pathMatch ? pathMatch[1].toLowerCase() : fallback;
  }

  function getImagesFromTweet(article) {
    const images = [];
    const seen = new Set();

    const selectors = [
      '[data-testid="tweetPhoto"] img',
      '[data-testid="card.layoutLarge.media"] img',
      'img[src*="pbs.twimg.com/media/"]'
    ];

    for (const selector of selectors) {
      for (const img of article.querySelectorAll(selector)) {
        const src = img.currentSrc || img.src;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        images.push({
          url: settings.preferOriginalQuality ? toOriginalImageUrl(src) : src,
          mediaType: 'image',
          ext: guessExtFromUrl(src, 'jpg')
        });
      }
    }

    return images;
  }

  function getVideoFromTweet(article) {
    const player = article.querySelector('[data-testid="videoPlayer"]');
    if (!player) return null;

    const video = player.querySelector('video');
    const poster = video?.getAttribute('poster') || '';
    const posterMatch = poster.match(
      /(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\/(\d+)/
    );
    const mediaId = posterMatch ? posterMatch[1] : null;

    const sourceEl = video?.querySelector('source');
    const directSrc =
      video?.currentSrc ||
      video?.src ||
      sourceEl?.src ||
      '';

    if (directSrc.startsWith('https://video.twimg.com/')) {
      const isGif = directSrc.includes('/tweet_video/');
      return {
        url: directSrc,
        mediaType: isGif ? 'gif' : 'video',
        ext: isGif ? 'gif' : 'mp4',
        mediaId
      };
    }

    const cached = mediaId ? byMedia.get(mediaId) : null;

    if (cached) {
      const isGif = cached.mediaType === 'gif';
      return {
        url: cached.url,
        mediaType: isGif ? 'gif' : 'video',
        ext: isGif ? 'gif' : 'mp4',
        mediaId
      };
    }

    return { mediaType: 'video', ext: 'mp4', mediaId, url: null };
  }

  async function resolveVideoUrl(tweetId, video) {
    let url = video.url;

    if (!url && tweetId) {
      const cached = byTweet.get(tweetId);
      if (cached?.url) {
        url = cached.url;
        if (cached.mediaType === 'gif') {
          video.mediaType = 'gif';
          video.ext = 'gif';
        }
      } else {
        const response = await browser.runtime.sendMessage({
          type: 'resolveVideo',
          tweetId
        });
        url = response?.url || null;
        if (response?.mediaType === 'gif') {
          video.mediaType = 'gif';
          video.ext = 'gif';
        }
      }
    }

    return url;
  }

  async function collectMediaFromTweet(article) {
    const { author, tweetId } = getTweetMeta(article);
    const items = [];

    for (const image of getImagesFromTweet(article)) {
      items.push({
        ...image,
        author,
        tweetId
      });
    }

    const video = getVideoFromTweet(article);
    if (video) {
      const url = await resolveVideoUrl(tweetId, video);
      if (url) {
        items.push({
          url,
          mediaType: video.mediaType,
          ext: video.ext,
          author,
          tweetId,
          mediaId: video.mediaId
        });
      }
    }

    return items;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function mp4UrlToGifDataUrl(mp4Url) {
    if (typeof window.XMS_convertMp4ToGif !== 'function') {
      throw new Error('GIF converter not loaded');
    }
    const fetched = await browser.runtime.sendMessage({
      type: 'fetchBlob',
      url: mp4Url
    });

    if (!fetched?.ok || !fetched.buffer) {
      throw new Error(fetched?.error || 'Could not fetch GIF video');
    }

    const blob = new Blob([fetched.buffer], {
      type: fetched.contentType || 'video/mp4'
    });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const gifBlob = await window.XMS_convertMp4ToGif(blobUrl);
      return blobToDataUrl(gifBlob);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  function isTwitterGif(item) {
    return (
      item.mediaType === 'gif' ||
      (item.url && item.url.includes('/tweet_video/'))
    );
  }

  async function downloadItems(items) {
    const results = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let url = item.url;
      let ext = item.ext;

      if (isTwitterGif(item)) {
        url = await mp4UrlToGifDataUrl(url);
        ext = 'gif';
      }

      const response = await browser.runtime.sendMessage({
        type: 'download',
        payload: {
          url,
          mediaType: item.mediaType,
          vars: {
            author: item.author || 'unknown',
            tweetId: item.tweetId || 'media',
            index: String(index + 1),
            ext
          }
        }
      });
      results.push(response);
    }

    return results.every((result) => result?.ok);
  }

  function flashButton(button, className) {
    button.classList.add(className);
    setTimeout(() => button.classList.remove(className), 1500);
  }

  async function handleDownloadClick(event, button) {
    event.preventDefault();
    event.stopPropagation();
    if (button.classList.contains('xms-loading')) return;

    const article =
      button.closest('article[data-testid="tweet"]') ||
      button.closest('article');
    if (!article) return;

    button.classList.add('xms-loading');
    try {
      const items = await collectMediaFromTweet(article);
      if (!items.length) throw new Error('No media found');

      const ok = await downloadItems(items);
      if (!ok) throw new Error('Download failed');

      flashButton(button, 'xms-ok');
    } catch (error) {
      console.warn('[X Media Saver]', error);
      flashButton(button, 'xms-err');
    } finally {
      button.classList.remove('xms-loading');
    }
  }

  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest(`.${BTN_CLASS}`);
      if (!button) return;
      handleDownloadClick(event, button);
    },
    true
  );

  async function loadSettings() {
    try {
      const stored = await browser.runtime.sendMessage({ type: 'getSettings' });
      if (stored && 'preferOriginalQuality' in stored) {
        settings.preferOriginalQuality = stored.preferOriginalQuality;
      }
    } catch {
      /* defaults */
    }
  }

  loadSettings();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'preferOriginalQuality' in changes) {
      settings.preferOriginalQuality = changes.preferOriginalQuality.newValue;
    }
  });
})();
