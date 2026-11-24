import { useEffect, type RefObject } from 'react';
import { isDefaultCategoryName, isDefaultFreeText, isDefaultProductDescription, isDefaultProductName } from '../../../domain/menu/pristineItems';

const placeholderChecks = {
    'free-text': isDefaultFreeText,
    'category-name': isDefaultCategoryName,
    'product-name': isDefaultProductName,
    'product-description': isDefaultProductDescription,
};

function isPlaceholder(field: HTMLElement) {
    const kind = field.dataset.placeholderField as keyof typeof placeholderChecks | undefined;
    const value = field instanceof HTMLInputElement ? field.value : field.innerText;
    return Boolean(kind && placeholderChecks[kind]?.(value ?? ''));
}

export function placeCaretAtEditStart(field: HTMLElement, replace = isPlaceholder(field)) {
    if (field instanceof HTMLInputElement) {
        if (replace) field.select();
        else field.setSelectionRange(field.value.length, field.value.length);
        return;
    }
    if (!field.isContentEditable) return;
    const range = field.ownerDocument.createRange();
    range.selectNodeContents(field);
    if (!replace) range.collapse(false);
    const selection = field.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

export function useReplacePlaceholderOnInput(rootRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const started = new WeakSet<HTMLElement>();
        let pointerFocus: HTMLElement | null = null;

        const getField = (target: EventTarget | null) => {
            const field = target instanceof Element ? target.closest<HTMLElement>('[data-placeholder-field]') : null;
            return field instanceof HTMLInputElement || field?.isContentEditable ? field : null;
        };
        const onPointerDown = (event: PointerEvent) => {
            const field = getField(event.target);
            pointerFocus = event.button === 0 && field !== root.ownerDocument.activeElement ? field : null;
        };
        const onClick = (event: MouseEvent) => {
            const field = pointerFocus;
            pointerFocus = null;
            if (field && field === getField(event.target) && root.ownerDocument.activeElement === field) {
                placeCaretAtEditStart(field);
            }
        };
        const onFocus = (event: FocusEvent) => {
            const field = getField(event.target);
            if (field) placeCaretAtEditStart(field);
        };
        const replacePlaceholder = (event: Event) => {
            const field = getField(event.target);
            if (!field || started.has(field)) return;
            started.add(field);
            if (isPlaceholder(field)) placeCaretAtEditStart(field, true);
        };
        const beforeInput = (event: InputEvent) => {
            if (event.inputType.startsWith('insert') && !['insertLineBreak', 'insertParagraph'].includes(event.inputType)) {
                replacePlaceholder(event);
            }
        };
        const reset = (event: FocusEvent) => {
            if (event.target instanceof HTMLElement) started.delete(event.target);
        };

        root.addEventListener('pointerdown', onPointerDown, true);
        root.addEventListener('click', onClick, true);
        root.addEventListener('focusin', onFocus);
        root.addEventListener('beforeinput', beforeInput, true);
        root.addEventListener('compositionstart', replacePlaceholder, true);
        root.addEventListener('focusout', reset);
        return () => {
            root.removeEventListener('pointerdown', onPointerDown, true);
            root.removeEventListener('click', onClick, true);
            root.removeEventListener('focusin', onFocus);
            root.removeEventListener('beforeinput', beforeInput, true);
            root.removeEventListener('compositionstart', replacePlaceholder, true);
            root.removeEventListener('focusout', reset);
        };
    }, [rootRef]);
}
