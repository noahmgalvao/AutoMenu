// A Range reports the browser's existing line boxes, including the effects of
// font loading, justification, white-space and bidirectional text.
export type PrintTextLine = { text: string; left: number; center: number };

export function measurePrintTextLines(element: HTMLElement, css: CSSStyleDeclaration): PrintTextLine[] {
  const node = element.firstChild;
  if (element.childNodes.length !== 1 || !(node instanceof Text) || !node.data.trim()) return [];
  const range = document.createRange();
  range.selectNodeContents(node);
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
  if (!rects.length) return [];

  const bounds = element.getBoundingClientRect();
  const left = bounds.left + (parseFloat(css.borderLeftWidth) || 0);
  const top = bounds.top + (parseFloat(css.borderTopWidth) || 0);
  const collapseSpace = ['normal', 'nowrap', 'pre-line'].includes(css.whiteSpace);
  const line = (text: string, box: DOMRect): PrintTextLine => ({
    text: collapseSpace ? text.replace(/[\t\n\r\f ]+/g, ' ').replace(/^ | $/g, '') : text.replace(/[\r\n]+$/, ''),
    left: box.left - left,
    center: box.top + box.height / 2 - top,
  });

  if (rects.every(rect => Math.abs(rect.top - rects[0].top) < .5)) {
    return [line(node.data, range.getBoundingClientRect())];
  }

  const lines: PrintTextLine[] = [];
  let start = 0;
  let offset = 0;
  let lineTop: number | undefined;
  for (const character of node.data) {
    const end = offset + character.length;
    range.setStart(node, offset);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && lineTop !== undefined && Math.abs(rect.top - lineTop) >= .5) {
      range.setStart(node, start);
      range.setEnd(node, offset);
      lines.push(line(node.data.slice(start, offset), range.getBoundingClientRect()));
      start = offset;
    }
    if (rect.width > 0) lineTop = rect.top;
    offset = end;
  }
  range.setStart(node, start);
  range.setEnd(node, offset);
  lines.push(line(node.data.slice(start), range.getBoundingClientRect()));
  return lines.filter(item => item.text);
}

export function applyPrintTextLines(element: HTMLElement, lines: PrintTextLine[]) {
  if (!lines.length) return;
  if (element.style.position === 'static') element.style.position = 'relative';
  if (element.style.display === 'inline') {
    element.style.display = 'inline-block';
  }
  const fragment = document.createDocumentFragment();
  for (const { text, left, center } of lines) {
    const span = document.createElement('span');
    // With zero line height the inline font box is centered on the line's vertical position.
    span.style.cssText = `position:absolute;left:${left}px;top:${center}px;width:max-content;line-height:0;white-space:pre;text-align:left`;
    span.textContent = text;
    fragment.append(span);
  }
  element.replaceChildren(fragment);
}
