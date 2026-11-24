const stripPrintEditorState = (page: HTMLElement) => {
  page.querySelectorAll('button, [data-print-control="true"], .automenu-image-resize-handle').forEach((node) => node.remove());
  page.querySelectorAll<HTMLElement>('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  page.querySelectorAll<HTMLElement>('*').forEach((node) => {
    // html2canvas reads transform matrices instead of the standalone rotate property.
    if (node.style.rotate && node.style.rotate !== 'none') {
      node.style.transform = [`rotate(${node.style.rotate})`, node.style.transform].filter(Boolean).join(' ');
      node.style.removeProperty('rotate');
    }
    node.classList.remove(
      'ring-4',
      'ring-2',
      'ring-blue-500',
      'ring-indigo-500',
      'bg-indigo-50/10',
      'bg-indigo-50/30'
    );
  });
};

export function preparePrintPageContent(page: HTMLElement, printBackgrounds: boolean) {
  page.classList.remove('ring-4', 'ring-blue-500', 'shadow-2xl');
  stripPrintEditorState(page);
  if (!printBackgrounds) {
    page.style.backgroundImage = 'none';
    page.style.backgroundColor = '#ffffff';
    page.style.backgroundBlendMode = 'normal';
    page.querySelectorAll('[data-menu-background-image="true"], [data-template-decoration]').forEach(node => node.remove());
  }
}
