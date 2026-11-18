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
  input.select();
  document.execCommand('copy');
  input.remove();
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
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
