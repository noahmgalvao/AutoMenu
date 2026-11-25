import type { ImageFormat } from '../../domain/publishing/exportProfiles';

export function extendPageBleed(source: HTMLCanvasElement, width: number, height: number, readPixels: boolean) {
  if (source.width === width && source.height === height) return source;
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d', { willReadFrequently: readPixels });
  if (!ctx) throw new Error('O navegador não conseguiu reservar memória para a sangria.');
  const left = Math.floor((width - source.width) / 2);
  const top = Math.floor((height - source.height) / 2);
  const right = width - source.width - left;
  const bottom = height - source.height - top;

  // Reflect the edge artwork in the bleed without resizing anything inside trim.
  for (const [x, w, flipX] of [[0, left, true], [left, source.width, false], [left + source.width, right, true]] as const) {
    for (const [y, h, flipY] of [[0, top, true], [top, source.height, false], [top + source.height, bottom, true]] as const) {
      if (!w || !h) continue;
      const sw = Math.min(w, source.width);
      const sh = Math.min(h, source.height);
      ctx.save();
      ctx.translate(x + (flipX ? w : 0), y + (flipY ? h : 0));
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(source, x > left ? source.width - sw : 0, y > top ? source.height - sh : 0, sw, sh, 0, 0, w, h);
      ctx.restore();
    }
  }
  if (!ctx.getImageData(left, top, 1, 1).data[3]) {
    output.width = output.height = 1;
    throw new Error('O navegador não conseguiu desenhar a sangria nesta resolução.');
  }
  return output;
}

async function encodeTiff(canvas: HTMLCanvasElement, dpi: number) {
  const { width, height } = canvas;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('O navegador não conseguiu preparar o TIFF.');
  const rowsPerStrip = Math.min(height, Math.max(1, Math.floor(64_000 / (width * 3))));
  const strips = Math.ceil(height / rowsPerStrip);
  const tags = 13;
  const bitsOffset = 8 + 2 + tags * 12 + 4;
  const xResolution = bitsOffset + 6;
  const yResolution = xResolution + 8;
  const offsets = yResolution + 8;
  const counts = offsets + (strips > 1 ? strips * 4 : 0);
  const start = counts + (strips > 1 ? strips * 4 : 0);
  const header = new ArrayBuffer(start);
  const view = new DataView(header);
  const short = (offset: number, value: number) => view.setUint16(offset, value, true);
  const long = (offset: number, value: number) => view.setUint32(offset, value, true);
  short(0, 0x4949);
  short(2, 42);
  long(4, 8);
  short(8, tags);
  const entries = [
    [256, 4, 1, width], [257, 4, 1, height], [258, 3, 3, bitsOffset],
    [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, strips, strips === 1 ? start : offsets],
    [277, 3, 1, 3], [278, 4, 1, rowsPerStrip],
    [279, 4, strips, strips === 1 ? width * height * 3 : counts],
    [282, 5, 1, xResolution], [283, 5, 1, yResolution], [284, 3, 1, 1], [296, 3, 1, 2],
  ];
  entries.forEach(([tag, type, count, value], i) => {
    const position = 10 + i * 12;
    short(position, tag);
    short(position + 2, type);
    long(position + 4, count);
    long(position + 8, value);
  });
  for (let channel = 0; channel < 3; channel++) short(bitsOffset + channel * 2, 8);
  for (const offset of [xResolution, yResolution]) {
    long(offset, dpi);
    long(offset + 4, 1);
  }

  const data = new Uint8Array(width * height * 3);
  for (let i = 0, written = 0; i < strips; i++) {
    const y = i * rowsPerStrip;
    const rgba = context.getImageData(0, y, width, Math.min(height - y, rowsPerStrip)).data;
    const length = rgba.length / 4 * 3;
    if (strips > 1) {
      long(offsets + i * 4, start + written);
      long(counts + i * 4, length);
    }
    for (let from = 0; from < rgba.length; from += 4) {
      data[written++] = rgba[from];
      data[written++] = rgba[from + 1];
      data[written++] = rgba[from + 2];
    }
    if ((i + 1) % 128 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new Blob([header, data], { type: 'image/tiff' });
}

async function pngDensity(blob: Blob, dpi: number) {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, Math.round(dpi / 0.0254));
  view.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  let crc = -1;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, ~crc);
  // Insert after IHDR and replace a browser-supplied density chunk if present.
  let position = 33;
  while (position + 12 <= blob.size) {
    const header = new DataView(await blob.slice(position, position + 8).arrayBuffer());
    const type = header.getUint32(4);
    if (type === 0x70485973) {
      return new Blob([blob.slice(0, position), chunk, blob.slice(position + header.getUint32(0) + 12)], { type: blob.type });
    }
    if (type === 0x49444154) break;
    position += header.getUint32(0) + 12;
  }
  return new Blob([blob.slice(0, 33), chunk, blob.slice(33)], { type: blob.type });
}

async function jpegDensity(blob: Blob, dpi: number) {
  const head = new Uint8Array(await blob.slice(0, 20).arrayBuffer());
  const jfif = head[2] === 255 && head[3] === 224 && head[6] === 74 && head[7] === 70 && head[8] === 73 && head[9] === 70;
  const header = jfif ? head : Uint8Array.of(255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0);
  header[13] = 1;
  const view = new DataView(header.buffer);
  view.setUint16(14, dpi);
  view.setUint16(16, dpi);
  return new Blob([header, blob.slice(jfif ? 20 : 2)], { type: blob.type });
}

export async function encodeMenuImage(canvas: HTMLCanvasElement, format: ImageFormat, dpi: number, quality: number) {
  if (format === 'TIFF') return encodeTiff(canvas, dpi);
  const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    result => result?.type === mime ? resolve(result) : reject(new Error('O navegador não conseguiu codificar a página nesta resolução.')),
    mime, quality / 100,
  ));
  return format === 'PNG' ? pngDensity(blob, dpi) : jpegDensity(blob, dpi);
}
