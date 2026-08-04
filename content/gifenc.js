/* content/gifenc.js - Self-contained GIF encoder */
var XMSGifenc = (function () {

  function createGIF(width, height, frames, delayMs) {
    // Collect all RGBA frames into GIF byte array
    const delay = Math.round(delayMs / 10);
    const buffer = [];

    function writeByte(b) { buffer.push(b & 0xff); }
    function writeShort(s) { writeByte(s); writeByte(s >> 8); }
    function writeString(str) { for (let i = 0; i < str.length; i++) writeByte(str.charCodeAt(i)); }

    // Header & Logical Screen Descriptor
    writeString("GIF89a");
    writeShort(width);
    writeShort(height);
    writeByte(0x70); // 256 colors, no global palette (local per frame)
    writeByte(0);    // Background color
    writeByte(0);    // Pixel aspect ratio

    // Loop Extension (NETSCAPE2.0)
    writeByte(0x21); writeByte(0xff); writeByte(11);
    writeString("NETSCAPE2.0");
    writeByte(3); writeByte(1); writeShort(0); writeByte(0);

    for (let f = 0; f < frames.length; f++) {
      const rgba = frames[f];
      
      // Build Palette (Simple 256-color median/box quantization)
      const { palette, indexed } = buildPaletteAndIndices(rgba, width * height);

      // Graphic Control Extension
      writeByte(0x21); writeByte(0xf9); writeByte(4);
      writeByte(0x04); // Disposal: Restore to background
      writeShort(delay);
      writeByte(0); // No transparency index
      writeByte(0);

      // Image Descriptor
      writeByte(0x2c);
      writeShort(0); writeShort(0); // X, Y
      writeShort(width); writeShort(height); // W, H
      writeByte(0x87); // Local color table, 256 colors

      // Local Color Table (256 * 3 bytes)
      for (let i = 0; i < 256; i++) {
        if (i < palette.length) {
          writeByte(palette[i][0]);
          writeByte(palette[i][1]);
          writeByte(palette[i][2]);
        } else {
          writeByte(0); writeByte(0); writeByte(0);
        }
      }

      // LZW Image Data
      encodeLZW(indexed, 8, writeByte);
    }

    writeByte(0x3b); // Trailer
    return new Uint8Array(buffer);
  }

  function buildPaletteAndIndices(rgba, pixelCount) {
    // Ensure opaque backgrounds don't turn black from alpha mismatch
    const palette = [];
    const colorMap = new Map();
    const indexed = new Uint8Array(pixelCount);

    // Step 1: Sample colors with 5-bit quantization to fit into 256 palette entries
    for (let i = 0; i < pixelCount; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      const a = rgba[i * 4 + 3];

      // Blend over white background if frame has transparency
      const finalR = a < 128 ? 255 : r;
      const finalG = a < 128 ? 255 : g;
      const finalB = a < 128 ? 255 : b;

      const key = ((finalR >> 3) << 10) | ((finalG >> 3) << 5) | (finalB >> 3);

      if (!colorMap.has(key)) {
        if (palette.length < 256) {
          colorMap.set(key, palette.length);
          palette.push([finalR, finalG, finalB]);
        } else {
          // Palette full, map to closest existing
          colorMap.set(key, 0); 
        }
      }
      indexed[i] = colorMap.get(key);
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
    
    let table = new Map();
    let curBuf = [];
    
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

    let bitBuf = 0, bitCount = 0, outBuf = [];
    
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
    writeByte(0); // Sub-block terminator
  }

  return { createGIF };
})();