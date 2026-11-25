import { zipSync } from 'fflate';

export async function zipImageFiles(files: File[]) {
  const entries = await Promise.all(files.map(async file => [file.name, new Uint8Array(await file.arrayBuffer())] as const));
  const archive = zipSync(Object.fromEntries(entries), { level: 0 });
  return new Blob([archive], { type: 'application/zip' });
}
