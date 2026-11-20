import type { MouseEvent } from 'react';

export function preventBrowserContextMenu(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (target instanceof Element && !target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
}
