const MIN_OPTIMIZATION_SIZE_BYTES = 220 * 1024;

const replaceImageExtension = (fileName: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagem';
  return `${baseName}.webp`;
};

export const optimizeImageForUpload = async (file: File, maxDimension = 1400): Promise<File> => {
  if (
    !file.type.startsWith('image/')
    || file.type === 'image/svg+xml'
    || file.type === 'image/gif'
    || file.size < MIN_OPTIMIZATION_SIZE_BYTES
    || typeof createImageBitmap !== 'function'
  ) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], replaceImageExtension(file.name), {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
};

export const preloadImage = (src: string) => new Promise<void>((resolve) => {
  if (!src) {
    resolve();
    return;
  }

  const image = new Image();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };
  image.onload = finish;
  image.onerror = finish;
  image.decoding = 'async';
  image.src = src;
  window.setTimeout(finish, 5000);
});
