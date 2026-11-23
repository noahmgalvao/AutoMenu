import QRCode from 'qrcode';

export const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand('copy')) throw new Error('Não foi possível copiar o link.');
  } finally {
    input.remove();
  }
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

const qrCodeBlobCache = new Map<string, Promise<Blob>>();

export const createQrCodeBlob = (value: string) => {
  const cached = qrCodeBlobCache.get(value);
  if (cached) return cached;
  const task = QRCode.toDataURL(value, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  }).then(async (dataUrl) => (await fetch(dataUrl)).blob());
  qrCodeBlobCache.set(value, task);
  void task.catch(() => {
    if (qrCodeBlobCache.get(value) === task) qrCodeBlobCache.delete(value);
  });
  return task;
};

export async function shareFiles(title: string, files: File[]): Promise<boolean> {
  if (!navigator.share || (navigator.canShare && !navigator.canShare({ files }))) return false;
  try {
    await navigator.share({ title, files });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    throw error;
  }
}

export async function downloadJpgFiles(files: File[], title: string) {
  if (files.length === 1) {
    downloadBlob(files[0], files[0].name);
    return;
  }
  const { zipSync } = await import('fflate');
  const entries = await Promise.all(files.map(async file => [file.name, new Uint8Array(await file.arrayBuffer())] as const));
  // JPEGs are already compressed.
  const archive = zipSync(Object.fromEntries(entries), { level: 0 });
  downloadBlob(new Blob([archive], { type: 'application/zip' }), `${title}.zip`);
}
