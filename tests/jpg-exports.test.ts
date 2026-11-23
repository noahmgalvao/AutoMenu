import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { resolveImagePages, toggleImagePage, type ImagePages } from '../src/domain/publishing/imagePages';
import { downloadJpgFiles, shareFiles } from '../src/infrastructure/browser/shareFiles';

test('individual JPG pages replace the all and editor selection modes', () => {
  const selected = [3, 1, 1, -1, 4, 1.5];
  const all: ImagePages = { mode: 'all' };
  const selection: ImagePages = { mode: 'selection' };
  assert.deepEqual(resolveImagePages(all, 4, selected), [0, 1, 2, 3]);
  assert.deepEqual(resolveImagePages(selection, 4, selected), [1, 3]);
  assert.deepEqual(resolveImagePages(toggleImagePage(all, 2), 4, selected), [2]);
  const first = toggleImagePage(selection, 0);
  const second = toggleImagePage(first, 2);
  assert.deepEqual(resolveImagePages(second, 4, selected), [0, 2]);
  assert.deepEqual(resolveImagePages(toggleImagePage(second, 0), 4, selected), [2]);
});

test('sharing sends the individual JPG files and downloading bundles only multiple pages', async (context) => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const shared: ShareData[] = [];
  Object.defineProperty(globalThis, 'navigator', {
    value: { canShare: (data: ShareData) => (data.files?.length ?? 0) > 0, share: (data: ShareData) => { shared.push(data); } },
    configurable: true,
  });
  context.after(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });

  const first = new File([Uint8Array.from([255, 216, 255, 217])], 'menu-pagina-1.jpg', { type: 'image/jpeg' });
  const second = new File([Uint8Array.from([255, 216, 7, 255, 217])], 'menu-pagina-3.jpg', { type: 'image/jpeg' });
  assert.equal(await shareFiles('menu', [first, second]), true);
  assert.deepEqual(shared, [{ title: 'menu', files: [first, second] }]);

  const downloads: { name: string; blob: Blob }[] = [];
  let queuedBlob: Blob;
  context.mock.method(URL, 'createObjectURL', (blob: Blob) => { queuedBlob = blob; return 'blob:download'; });
  const link = { download: '', href: '', click: () => downloads.push({ name: link.download, blob: queuedBlob }), remove: () => {} };
  Object.defineProperty(globalThis, 'window', { value: { setTimeout: () => 0 }, configurable: true });
  context.after(() => { Reflect.deleteProperty(globalThis, 'window'); });
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => link, body: { appendChild: () => {} } }, configurable: true,
  });
  context.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  await downloadJpgFiles([first], 'menu');
  await downloadJpgFiles([first, second], 'menu');

  assert.equal(downloads[0].name, first.name);
  assert.equal(downloads[0].blob, first);
  assert.equal(downloads[1].name, 'menu.zip');
  assert.equal(downloads[1].blob.type, 'application/zip');
  const archive = unzipSync(new Uint8Array(await downloads[1].blob.arrayBuffer()));
  assert.deepEqual(Object.keys(archive), [first.name, second.name]);
  assert.deepEqual(archive[second.name], new Uint8Array(await second.arrayBuffer()));
});
