'use strict';

// Change 'ArtDownloads' to whatever custom folder name you want inside Downloads
const TARGET_FOLDER = 'ArtDownloads';

const defaultSettings = {
  preferOriginalQuality: true
};

browser.runtime.onInstalled.addListener(() => {
  browser.storage.sync.get(defaultSettings).then((stored) => {
    browser.storage.sync.set(stored);
  });
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'getSettings') {
    return browser.storage.sync.get(defaultSettings);
  }

  if (message.type === 'fetchBlob') {
    return fetch(message.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Promise.all([res.arrayBuffer(), res.headers.get('content-type')]);
      })
      .then(([buffer, contentType]) => {
        return {
          ok: true,
          contentType: contentType || 'video/mp4',
          buffer: Array.from(new Uint8Array(buffer))
        };
      })
      .catch((err) => ({
        ok: false,
        error: err.message
      }));
  }

  if (message.type === 'download') {
    const { url, buffer, vars } = message.payload;
    const rawFilename = `${vars.author}_${vars.tweetId}_${vars.index}.${vars.ext}`;
    
    // Clean filename characters and route to the target folder
    const cleanFilename = rawFilename.replace(/[/\\?%*:|"<>]/g, '_');
    const savePath = `${TARGET_FOLDER}/${cleanFilename}`;

    let downloadUrl = url;
    let createdBlobUrl = null;

    if (buffer) {
      const blob = new Blob([new Uint8Array(buffer)], { type: 'image/gif' });
      downloadUrl = URL.createObjectURL(blob);
      createdBlobUrl = downloadUrl;
    }

    return browser.downloads
      .download({
        url: downloadUrl,
        filename: savePath,
        saveAs: false
      })
      .then((downloadId) => {
        if (createdBlobUrl) {
          setTimeout(() => URL.revokeObjectURL(createdBlobUrl), 10000);
        }
        return { ok: true, downloadId };
      })
      .catch((err) => {
        if (createdBlobUrl) {
          URL.revokeObjectURL(createdBlobUrl);
        }
        console.error('[X Media Saver] Download error:', err);
        return { ok: false, error: err.message };
      });
  }
});