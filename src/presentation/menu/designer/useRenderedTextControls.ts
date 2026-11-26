import { useLayoutEffect, useRef, useState } from 'react';
import { measureWordFitElement } from '../canvas/textFit';

export function useRenderedTextControls(selector: string | undefined, configured: number | undefined) {
  const baseSize = useRef(configured);
  const [size, setSize] = useState(configured);
  const [priceAlignment, setPriceAlignment] = useState<string>();
  const [priceAlignmentDisabled, setPriceAlignmentDisabled] = useState(false);
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-automenu-editor-canvas]');
    if (!root || !selector) { setSize(configured); return; }
    let frame = 0;
    const refresh = () => {
      frame = 0;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(node => node.getClientRects().length);
      baseSize.current = configured ?? Math.max(...nodes.map(node => Number(node.dataset.wordFitBaseSize
        || node.closest<HTMLElement>('[data-price-base-size]')?.dataset.priceBaseSize) || 0));
      const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
      setSize(sizes.length ? Math.round(Math.min(...sizes) * 10) / 10 : configured);
      const price = nodes.find(node => node.closest('[data-template-price]'));
      setPriceAlignment(price ? price.closest<HTMLElement>('[data-product-price-slot]')?.dataset.priceAlignment || 'right' : undefined);
      setPriceAlignmentDisabled(nodes.some(node => node.closest('[data-template-price]')
        && getComputedStyle(node.closest('[data-product-text-row]')?.querySelector('[data-divider-title]') || node).textAlign === 'right'));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['style', 'data-word-fit-base-size', 'data-price-base-size'] });
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    refresh();
    return () => { observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); };
  }, [selector, configured]);

  const canSetSize = (next: number) => {
    if (size !== undefined && next > size + .05 && baseSize.current !== undefined && size < baseSize.current - .05) return false;
    if (!selector || size === undefined || next <= size) return true;
    const root = document.querySelector('[data-automenu-editor-canvas]');
    return Array.from(root?.querySelectorAll<HTMLElement>(selector) || []).every(node =>
      !node.hasAttribute('data-word-fit') || measureWordFitElement(node, { baseFontSize: next }).fontSize >= next);
  };
  return { size, canSetSize, priceAlignmentDisabled, priceAlignment };
}
