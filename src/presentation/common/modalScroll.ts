const modals = new Map<HTMLElement, number>();
const scrollKeys = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

function preventBackgroundScroll(event: Event) {
  let active: HTMLElement | undefined;
  let highestPriority = -Infinity;
  for (const [modal, priority] of modals) {
    if (priority >= highestPriority) {
      active = modal;
      highestPriority = priority;
    }
  }
  if (!active || event.composedPath().includes(active)) return;
  if (event instanceof KeyboardEvent && !scrollKeys.has(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
}

export function lockModalScrolling(element: HTMLElement | null, priority = 0) {
  if (!element) return;
  if (!modals.size) {
    document.documentElement.dataset.modalScrollLocked = 'true';
    document.addEventListener('wheel', preventBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', preventBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('keydown', preventBackgroundScroll, true);
  }
  modals.set(element, priority);
  element.dataset.modalScrollBoundary = 'true';
  return () => {
    modals.delete(element);
    delete element.dataset.modalScrollBoundary;
    if (modals.size) return;
    delete document.documentElement.dataset.modalScrollLocked;
    document.removeEventListener('wheel', preventBackgroundScroll, true);
    document.removeEventListener('touchmove', preventBackgroundScroll, true);
    document.removeEventListener('keydown', preventBackgroundScroll, true);
  };
}
