(() => {
  'use strict';

  const EVT = 'xms:media';
  const seen = new Set();
  const all = [];

  function emit(entries) {
    if (!entries.length) return;
    all.push(...entries);
    document.dispatchEvent(
      new CustomEvent(EVT, { detail: JSON.stringify(entries) })
    );
  }

  document.addEventListener('xms:ready', () => {
    if (all.length) {
      document.dispatchEvent(
        new CustomEvent(EVT, { detail: JSON.stringify(all) })
      );
    }
  });

  function bestVariant(videoInfo) {
    if (!videoInfo || !Array.isArray(videoInfo.variants)) return null;
    let best = null;
    for (const variant of videoInfo.variants) {
      if (variant?.content_type === 'video/mp4' && variant.url) {
        const bitrate = variant.bitrate || 0;
        if (!best || bitrate > best.bitrate) {
          best = { url: variant.url, bitrate, type: variant.type };
        }
      }
    }
    return best;
  }

  function collect(node, out) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) collect(item, out);
      return;
    }

    if (node.media_url_https && node.type === 'photo') {
      const mediaId = typeof node.id_str === 'string' ? node.id_str : null;
      let tweetId = null;
      if (typeof node.expanded_url === 'string') {
        const match = node.expanded_url.match(/\/status\/(\d+)/);
        if (match) tweetId = match[1];
      }
      const key = `photo|${mediaId}|${tweetId}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          mediaId,
          tweetId,
          url: node.media_url_https,
          mediaType: 'image'
        });
      }
    }

    if (node.video_info) {
      const best = bestVariant(node.video_info);
      if (best) {
        const mediaId = typeof node.id_str === 'string' ? node.id_str : null;
        let tweetId = null;
        if (typeof node.expanded_url === 'string') {
          const match = node.expanded_url.match(/\/status\/(\d+)/);
          if (match) tweetId = match[1];
        }
        const isGif = node.type === 'animated_gif' || best.type === 'animated_gif';
        const key = `${isGif ? 'gif' : 'video'}|${mediaId}|${tweetId}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            mediaId,
            tweetId,
            url: best.url,
            mediaType: isGif ? 'gif' : 'video'
          });
        }
      }
    }

    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') collect(value, out);
    }
  }

  function scanText(text) {
    if (typeof text !== 'string') return;
    if (!text.includes('media_url') && !text.includes('video_info')) return;
    try {
      const out = [];
      collect(JSON.parse(text), out);
      emit(out);
    } catch {
      /* ignore non-json */
    }
  }

  const API_RE = /\/i\/api\/|api\.(x|twitter)\.com/;

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    return origFetch.apply(this, args).then((response) => {
      try {
        const url =
          typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (API_RE.test(url)) {
          response.clone().text().then(scanText).catch(() => {});
        }
      } catch {
        /* ignore */
      }
      return response;
    });
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__xmsUrl = typeof url === 'string' ? url : String(url);
    return origOpen.apply(this, arguments);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__xmsUrl && API_RE.test(this.__xmsUrl)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            scanText(this.responseText);
          } else if (this.responseType === 'json' && this.response) {
            const out = [];
            collect(this.response, out);
            emit(out);
          }
        } catch {
          /* ignore */
        }
      });
    }
    return origSend.apply(this, arguments);
  };
})();
