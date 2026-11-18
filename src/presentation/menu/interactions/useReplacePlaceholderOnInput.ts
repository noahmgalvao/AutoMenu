import { useEffect, type RefObject } from 'react';
import { isDefaultCategoryName, isDefaultProductDescription, isDefaultProductName } from '../../../domain/menu/pristineItems';

const placeholderChecks = {
    'category-name': isDefaultCategoryName,
    'product-name': isDefaultProductName,
    'product-description': isDefaultProductDescription,
};

export function useReplacePlaceholderOnInput(rootRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const started = new WeakSet<HTMLElement>();

        const replacePlaceholder = (event: Event) => {
            const field = event.target;
            if (!(field instanceof HTMLElement) || started.has(field)) return;
            const kind = field.dataset.placeholderField as keyof typeof placeholderChecks | undefined;
            if (!kind) return;
            started.add(field);

            if (field instanceof HTMLInputElement) {
                if (placeholderChecks[kind](field.value)) field.select();
                return;
            }
            if (!field.isContentEditable || !placeholderChecks[kind](field.innerText)) return;
            const range = field.ownerDocument.createRange();
            range.selectNodeContents(field);
            const selection = field.ownerDocument.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        };
        const beforeInput = (event: InputEvent) => {
            if (event.inputType.startsWith('insert') && !['insertLineBreak', 'insertParagraph'].includes(event.inputType)) {
                replacePlaceholder(event);
            }
        };
        const reset = (event: FocusEvent) => {
            if (event.target instanceof HTMLElement) started.delete(event.target);
        };

        root.addEventListener('beforeinput', beforeInput, true);
        root.addEventListener('compositionstart', replacePlaceholder, true);
        root.addEventListener('focusout', reset);
        return () => {
            root.removeEventListener('beforeinput', beforeInput, true);
            root.removeEventListener('compositionstart', replacePlaceholder, true);
            root.removeEventListener('focusout', reset);
        };
    }, [rootRef]);
}
