(() => {
  'use strict';

  if (typeof XMSGifenc === 'undefined') {
    console.warn('[X Media Saver] GIF encoder not loaded');
    return;
  }

  const { GIFEncoder, quantize, applyPalette } = XMSGifenc;

  function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        reject(new Error('Video seek failed'));
      };
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
    });
  }

  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error', onError);
      };

      const onReady = () => {
        cleanup();
        resolve(video);
      };

      const onError = () => {
        cleanup();
        reject(new Error('Failed to load video for GIF conversion'));
      };

      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('error', onError);
      video.src = url;
    });
  }

  async function convertMp4ToGif(mp4Url) {
    const video = await loadVideo(mp4Url);
    const duration = Math.min(video.duration || 3, 8);
    const fps = 12;
    const frameCount = Math.max(2, Math.min(Math.ceil(duration * fps), 96));
    const step = duration / frameCount;

    const maxWidth = 480;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      await seekVideo(video, i * step);
      ctx.drawImage(video, 0, 0, width, height);
      frames.push(ctx.getImageData(0, 0, width, height));
    }

    video.removeAttribute('src');
    video.load();

    const delayMs = Math.round(1000 / fps);
    const gif = GIFEncoder();
    let sharedPalette = null;

    for (let i = 0; i < frames.length; i++) {
      const rgba = frames[i].data;
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);

      if (i === 0) {
        sharedPalette = palette;
        gif.writeFrame(index, width, height, {
          palette: sharedPalette,
          delay: delayMs,
          repeat: 0,
          dispose: 2
        });
      } else {
        gif.writeFrame(index, width, height, {
          palette: sharedPalette,
          delay: delayMs,
          dispose: 2
        });
      }
    }

    gif.finish();
    return new Blob([gif.bytesView()], { type: 'image/gif' });
  }

  window.XMS_convertMp4ToGif = convertMp4ToGif;
})();
