const stripPrintEditorState = (page: HTMLElement) => {
  page.querySelectorAll('button, [data-print-control="true"]:not([data-page-number]), [data-canvas-selection-outline], .automenu-image-resize-handle').forEach((node) => node.remove());
  page.querySelectorAll<HTMLElement>('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  page.querySelectorAll<HTMLElement>('*').forEach((node) => {
    node.classList.remove(
      'ring-4',
      'ring-2',
      'ring-blue-500',
      'ring-indigo-500',
      'bg-indigo-50/10',
      'bg-indigo-50/30',
      'bg-indigo-500/15'
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
