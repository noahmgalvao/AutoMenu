import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ElementStyle } from '../types';
import { getElementAvailableWidth, getWordFitWidthContainer, measureWordFitElement, type WordFitScope } from '../utils/textFit';

interface AutoFitTextProps extends React.HTMLAttributes<HTMLElement> {
  as: keyof React.JSX.IntrinsicElements;
  text: string;
  baseFontSize: number;
  minimumFontSize: number;
  allowSameWordBreak: boolean;
  fitScope: WordFitScope;
  widthMode?: 'self' | 'parent' | 'flex';
  containerSelector?: string;
  availableWidthInset?: number;
  disableAutoFit?: boolean;
}

export const AutoFitText: React.FC<AutoFitTextProps> = ({
  as,
  text,
  baseFontSize,
  minimumFontSize,
  allowSameWordBreak,
  fitScope,
  widthMode = 'flex',
  containerSelector,
  availableWidthInset = 0,
  disableAutoFit = false,
  style,
  className = '',
  onInput,
  children,
  ...rest
}) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const [fit, setFit] = useState(() => ({ fontSize: baseFontSize, fits: true }));

  const evaluate = useCallback((textOverride?: string) => {
    const element = elementRef.current;
    if (!element) return;
    if (disableAutoFit) {
      element.dataset.wordOverflow = 'false';
      setFit((current) => current.fontSize === baseFontSize && current.fits
        ? current
        : { fontSize: baseFontSize, fits: true });
      return;
    }
    const result = measureWordFitElement(element, {
      text: textOverride,
      baseFontSize,
    });
    element.dataset.wordOverflow = String(!result.fits);
    setFit((current) => (
      current.fontSize === result.fontSize && current.fits === result.fits ? current : result
    ));
  }, [baseFontSize, disableAutoFit]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    evaluate();
    if (disableAutoFit) return;
    const container = getWordFitWidthContainer(element);
    let width = getElementAvailableWidth(element);
    const observer = new ResizeObserver(() => {
      const nextWidth = getElementAvailableWidth(element);
      if (Math.abs(nextWidth - width) < 0.5) return;
      width = nextWidth;
      evaluate();
    });
    observer.observe(container);
    const fontLoaded = () => evaluate();
    document.fonts?.addEventListener('loadingdone', fontLoaded);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fontLoaded);
    };
  }, [allowSameWordBreak, availableWidthInset, containerSelector, disableAutoFit, evaluate, minimumFontSize, text, widthMode, style?.fontFamily, style?.fontWeight, style?.fontStyle, style?.letterSpacing, style?.textTransform]);

  const editableTextColor = rest.contentEditable && typeof style?.color === 'string'
    ? style.color
    : undefined;
  const editableColorStyle = editableTextColor
    ? ({
        WebkitTextFillColor: editableTextColor,
        '--automenu-edit-color': editableTextColor,
      } as React.CSSProperties)
    : {};
  const componentProps = {
    ...rest,
    ref: (node: HTMLElement | null) => { elementRef.current = node; },
    'data-word-fit': 'true',
    'data-word-fit-scope': fitScope,
    'data-word-fit-base-size': baseFontSize,
    'data-word-fit-size': fit.fontSize,
    'data-word-fit-reduced': fit.fontSize < baseFontSize,
    'data-word-fit-minimum': minimumFontSize,
    'data-word-fit-allow-break': allowSameWordBreak,
    'data-word-fit-width-mode': widthMode,
    'data-word-fit-container': containerSelector,
    'data-word-fit-width-inset': availableWidthInset,
    'data-word-fit-font-family': style?.fontFamily,
    'data-word-fit-font-weight': style?.fontWeight,
    'data-word-fit-font-style': style?.fontStyle,
    'data-word-fit-letter-spacing': style?.letterSpacing,
    'data-word-fit-text-transform': style?.textTransform as ElementStyle['textTransform'],
    className: `${!fit.fits && !disableAutoFit ? 'automenu-word-wrap' : allowSameWordBreak ? '' : 'automenu-word-safe'} ${className}`,
    style: {
      ...style,
      fontSize: `${fit.fontSize}px`,
      ...editableColorStyle,
    },
    onInput: (event: React.InputEvent<HTMLElement>) => {
      evaluate(event.currentTarget.innerText);
      onInput?.(event);
    },
  };

  return React.createElement(as, componentProps, children ?? text);
};
