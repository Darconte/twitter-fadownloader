'use strict';

const DEFAULT_SETTINGS = {
  enabled: true,
  saveAs: false,
  imageFolder: 'X-Media/images',
  videoFolder: 'X-Media/videos',
  gifFolder: 'X-Media/gifs',
  filenameTemplate: '{author}_{tweetId}_{index}',
  buttonPosition: 'left',
  preferOriginalQuality: true,
  faFloatingIcon: true,
  faImageFolder: 'FurAffinity',
  faFilenameTemplate: '{artist}_{id}'
};

const FA_REFERER = 'https://www.furaffinity.net/';

async function getSettings() {
  const stored = await browser.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function pickBestMp4(variants) {
  let best = null;
  for (const variant of variants || []) {
    const url = variant.url || variant.src;
    if (!url) continue;
    const isMp4 =
      variant.content_type === 'video/mp4' || /\.mp4(\?|$)/i.test(url);
    if (!isMp4) continue;
    const bitrate = variant.bitrate || 0;
    if (!best || bitrate > best.bitrate) {
      best = { url, bitrate };
    }
  }
  return best ? best.url : null;
}

async function resolveTweetVideo(tweetId) {
  const url =
    'https://cdn.syndication.twimg.com/tweet-result?id=' +
    encodeURIComponent(tweetId) +
    '&token=' +
    syndicationToken(tweetId);

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  const mediaDetails = data.mediaDetails || [];

  for (const item of mediaDetails) {
    if (item.video_info) {
      const best = pickBestMp4(item.video_info.variants);
      if (best) {
        return {
          url: best,
          mediaType: item.type === 'animated_gif' ? 'gif' : 'video'
        };
      }
    }
  }

  if (data.video && Array.isArray(data.video.variants)) {
    const best = pickBestMp4(data.video.variants);
    if (best) {
      return { url: best, mediaType: 'video' };
    }
  }

  return null;
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 200);
}

function buildFilename(template, vars) {
  let name = template;
  for (const [key, value] of Object.entries(vars)) {
    name = name.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? '');
  }
  return sanitizeFilename(name);
}

function getFolderForType(settings, mediaType) {
  if (mediaType === 'gif') return settings.gifFolder;
  if (mediaType === 'video') return settings.videoFolder;
  return settings.imageFolder;
}

async function fetchMediaBlob(url, referer) {
  const headers = referer ? { Referer: referer } : {};
  const response = await fetch(url, {
    headers,
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`);
  }
  const blob = await response.blob();
  return { blob, contentType: response.headers.get('content-type') || blob.type };
}

function normalizeFaFileUrl(href) {
  if (!href) return null;

  let url = href.trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (!/^https:\/\/d\.furaffinity\.net\//i.test(url)) return null;
  if (/\.(css|js|json|xml|woff2?|ttf|map)(\?|$)/i.test(url)) return null;
  if (!/\/(art|download|music|stories)\//i.test(url)) return null;

  return url;
}

function parseFaMetaFromHtml(html, submissionId) {
  let artist = 'unknown';
  const artistMatch = html.match(
    /class="submission-id-submission"[\s\S]*?href="\/user\/([^/"']+)/i
  );
  if (artistMatch) artist = artistMatch[1];

  let title = 'submission';
  const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (titleMatch) title = titleMatch[1].trim();

  return { id: submissionId, artist, title };
}

function parseFaSubmissionHtml(html, submissionId) {
  const meta = parseFaMetaFromHtml(html, submissionId);

  const downloadLinkMatch =
    html.match(/id="download-link"[^>]*href="([^"]+)"/i) ||
    html.match(/href="([^"]+)"[^>]*id="download-link"/i);
  if (downloadLinkMatch) {
    const url = normalizeFaFileUrl(downloadLinkMatch[1]);
    if (url) return { url, meta };
  }

  const candidates = [];
  const hrefPattern = /href="((?:https:)?\/\/d\.furaffinity\.net[^"]+)"/gi;
  let match;
  while ((match = hrefPattern.exec(html))) {
    const url = normalizeFaFileUrl(match[1]);
    if (url) candidates.push(url);
  }

  const artUrl = candidates.find((url) => /\/art\//i.test(url));
  if (artUrl) return { url: artUrl, meta };

  if (candidates.length) return { url: candidates[0], meta };

  return null;
}

async function resolveFaSubmission(submissionId) {
  const pageUrl = `https://www.furaffinity.net/view/${submissionId}/`;
  const response = await fetch(pageUrl, {
    credentials: 'include',
    headers: { Referer: FA_REFERER }
  });
  if (!response.ok) return null;
  const html = await response.text();
  return parseFaSubmissionHtml(html, submissionId);
}

async function downloadFaMedia({ url, vars, folder, template }) {
  const settings = await getSettings();
  const ext = vars.ext || 'jpg';
  const baseName = buildFilename(template || settings.faFilenameTemplate, vars);
  const filename = folder
    ? `${folder}/${baseName}.${ext}`.replace(/\/+/g, '/')
    : `${baseName}.${ext}`;

  const { blob, contentType } = await fetchMediaBlob(url, FA_REFERER);

  if (
    contentType?.includes('text/css') ||
    contentType?.includes('text/html') ||
    /\.css(\?|$)/i.test(url)
  ) {
    throw new Error('Resolved Fur Affinity URL was not an image file');
  }

  const blobUrl = URL.createObjectURL(blob);

  try {
    const downloadId = await browser.downloads.download({
      url: blobUrl,
      filename,
      saveAs: settings.saveAs
    });
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    return { ok: true, downloadId, filename };
  } catch (error) {
    URL.revokeObjectURL(blobUrl);
    console.error('[X Media Saver] FA download failed:', error);
    return { ok: false, error: error.message };
  }
}

async function downloadMedia({ url, mediaType, vars }) {
  const settings = await getSettings();
  const folder = getFolderForType(settings, mediaType);
  const ext = vars.ext || 'bin';
  const baseName = buildFilename(settings.filenameTemplate, vars);
  const filename = folder
    ? `${folder}/${baseName}.${ext}`.replace(/\/+/g, '/')
    : `${baseName}.${ext}`;

  try {
    const downloadId = await browser.downloads.download({
      url,
      filename,
      saveAs: settings.saveAs
    });
    return { ok: true, downloadId, filename };
  } catch (error) {
    console.error('[X Media Saver] Download failed:', error);
    return { ok: false, error: error.message };
  }
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'download') {
    downloadMedia(message.payload).then(sendResponse);
    return true;
  }

  if (message?.type === 'resolveVideo') {
    resolveTweetVideo(message.tweetId)
      .then((result) => sendResponse(result || { url: null }))
      .catch(() => sendResponse({ url: null }));
    return true;
  }

  if (message?.type === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message?.type === 'fetchBlob') {
    fetchMediaBlob(message.url, message.referer || null)
      .then(async ({ blob, contentType }) => {
        const buffer = await blob.arrayBuffer();
        sendResponse({
          ok: true,
          buffer,
          contentType
        });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'resolveFaSubmission') {
    resolveFaSubmission(message.submissionId)
      .then((result) => sendResponse(result || { url: null }))
      .catch(() => sendResponse({ url: null }));
    return true;
  }

  if (message?.type === 'downloadFa') {
    downloadFaMedia(message.payload).then(sendResponse);
    return true;
  }
});
