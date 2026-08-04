(() => {
  'use strict';

  // --- STABLE GIF ENCODER ---
  function createGIF(width, height, frames, delayMs) {
    const delay = Math.round(delayMs / 10);
    const buffer = [];

    function writeByte(b) { buffer.push(b & 0xff); }
    function writeShort(s) { writeByte(s); writeByte(s >> 8); }
    function writeString(str) { for (let i = 0; i < str.length; i++) writeByte(str.charCodeAt(i)); }

    writeString("GIF89a");
    writeShort(width);
    writeShort(height);
    writeByte(0x70); // 256 colors
    writeByte(0);
    writeByte(0);

    // NETSCAPE Loop Extension
    writeByte(0x21); writeByte(0xff); writeByte(11);
    writeString("NETSCAPE2.0");
    writeByte(3); writeByte(1); writeShort(0); writeByte(0);

    for (let f = 0; f < frames.length; f++) {
      const rgba = frames[f];
      const { palette, indexed } = buildStablePalette(rgba, width * height);

      // Graphic Control Extension
      writeByte(0x21); writeByte(0xf9); writeByte(4);
      writeByte(0x04);
      writeShort(delay);
      writeByte(0);
      writeByte(0);

      // Image Descriptor
      writeByte(0x2c);
      writeShort(0); writeShort(0);
      writeShort(width); writeShort(height);
      writeByte(0x87);

      // Local Color Table
      for (let i = 0; i < 256; i++) {
        if (i < palette.length) {
          writeByte(palette[i][0]);
          writeByte(palette[i][1]);
          writeByte(palette[i][2]);
        } else {
          writeByte(0); writeByte(0); writeByte(0);
        }
      }

      encodeLZW(indexed, 8, writeByte);
    }

    writeByte(0x3b);
    return new Uint8Array(buffer);
  }

  function buildStablePalette(rgba, pixelCount) {
    const indexed = new Uint8Array(pixelCount);
    const palette = [];
    const colorMap = new Map();

    for (let i = 0; i < pixelCount; i++) {
      const a = rgba[i * 4 + 3];
      // Blend alpha over white
      const r = a < 128 ? 255 : rgba[i * 4];
      const g = a < 128 ? 255 : rgba[i * 4 + 1];
      const b = a < 128 ? 255 : rgba[i * 4 + 2];

      // Quantize to 6-bit per channel for crisp line art & distinct browns/grays
      const qr = r & 0xfc;
      const qg = g & 0xfc;
      const qb = b & 0xfc;

      const key = (qr << 16) | (qg << 8) | qb;

      let idx = colorMap.get(key);
      if (idx === undefined) {
        if (palette.length < 256) {
          idx = palette.length;
          palette.push([r, g, b]);
          colorMap.set(key, idx);
        } else {
          // Palette full: map to nearest existing entry
          let minDist = Infinity;
          idx = 0;
          for (let p = 0; p < palette.length; p++) {
            const dist = (r - palette[p][0]) ** 2 + (g - palette[p][1]) ** 2 + (b - palette[p][2]) ** 2;
            if (dist < minDist) {
              minDist = dist;
              idx = p;
            }
          }
        }
      }
      indexed[i] = idx;
    }

    while (palette.length < 2) palette.push([0, 0, 0]);
    return { palette, indexed };
  }

  function encodeLZW(pixels, minCodeSize, writeByte) {
    writeByte(minCodeSize);

    const clearCode = 1 << minCodeSize;
    const eofCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = clearCode + 2;

    const table = new Map();
    let bitBuf = 0;
    let bitCount = 0;
    let outBuf = [];

    function writeBits(code) {
      for (let b = 0; b < codeSize; b++) {
        bitBuf |= ((code >> b) & 1) << bitCount;
        bitCount++;
        if (bitCount === 8) {
          outBuf.push(bitBuf);
          bitBuf = 0;
          bitCount = 0;
          if (outBuf.length === 254) {
            writeByte(outBuf.length);
            for (let i = 0; i < outBuf.length; i++) writeByte(outBuf[i]);
            outBuf = [];
          }
        }
      }
    }

    writeBits(clearCode);

    let prefix = pixels[0];
    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (prefix << 16) | k;

      if (table.has(key)) {
        prefix = table.get(key);
      } else {
        writeBits(prefix);
        if (nextCode < 4096) {
          table.set(key, nextCode++);
          if (nextCode === (1 << codeSize) + 1 && codeSize < 12) {
            codeSize++;
          }
        } else {
          writeBits(clearCode);
          table.clear();
          codeSize = minCodeSize + 1;
          nextCode = clearCode + 2;
        }
        prefix = k;
      }
    }

    writeBits(prefix);
    writeBits(eofCode);

    if (bitCount > 0) outBuf.push(bitBuf);
    if (outBuf.length > 0) {
      writeByte(outBuf.length);
      for (let i = 0; i < outBuf.length; i++) writeByte(outBuf[i]);
    }
    writeByte(0);
  }

  // --- VIDEO SEEK & CONVERSION ---
  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;

      const onReady = () => {
        cleanup();
        resolve(video);
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load MP4 video'));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error', onError);
      };

      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('error', onError);
      video.src = url;
    });
  }

  function seekVideo(video, time) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
    });
  }

  async function convertMp4ToGif(mp4Url) {
    const video = await loadVideo(mp4Url);
    const duration = Math.min(video.duration || 3, 5);
    const fps = 10;
    const frameCount = Math.max(2, Math.floor(duration * fps));
    const step = duration / frameCount;

    const width = video.videoWidth || 480;
    const height = video.videoHeight || 360;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const rawFrames = [];

    for (let i = 0; i < frameCount; i++) {
      await seekVideo(video, i * step);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(video, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      rawFrames.push(imgData.data);
    }

    video.removeAttribute('src');
    video.load();

    const gifBytes = createGIF(width, height, rawFrames, Math.round(1000 / fps));
    return new Blob([gifBytes], { type: 'image/gif' });
  }

  window.XMS_convertMp4ToGif = convertMp4ToGif;
})();