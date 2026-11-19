export function isHeadingTextHit(heading: HTMLElement, { clientX, clientY }: { clientX: number; clientY: number }) {
    if (!heading.textContent?.trim()) return heading.hasAttribute('data-subtitle-placeholder');
    const range = heading.ownerDocument.createRange();
    const textNodes = heading.ownerDocument.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
        range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(({ left, right, top, bottom }) => (
            right > left && clientX >= left && clientX <= right && clientY >= top && clientY <= bottom
        ))) return true;
    }
    return false;
}
