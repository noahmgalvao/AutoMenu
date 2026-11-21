import { isHeadingTextHit } from './menuHeadingHit';

export const isCanvasObjectOrControlTarget = (target: EventTarget | null, pageEl: HTMLElement, point: Pick<MouseEvent, 'clientX' | 'clientY'>) => {
    if (!(target instanceof Element) || !pageEl.contains(target)) return true;
    if (target === pageEl) return false;
    const heading = target.closest<HTMLElement>('[data-menu-heading]');
    if (heading && isHeadingTextHit(heading, point)) return true;

    return Boolean(target.closest([
        'button',
        'input',
        'textarea',
        'select',
        'option',
        'label',
        'a',
        '[contenteditable="true"]',
        '[data-drag-ignore="true"]',
        '[data-print-control="true"]',
        '[data-added-image-drag="true"]',
        '[data-drag-type]',
        '[data-page-number]',
        '.automenu-drag-item',
        '.automenu-image-resize-handle',
    ].join(',')));
};
