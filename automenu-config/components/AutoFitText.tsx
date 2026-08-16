import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ElementStyle } from '../types';
import { measureWordFitElement, type WordFitScope } from '../utils/textFit';

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
  showOverflowFeedback?: boolean;
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
  showOverflowFeedback = false,
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
    const result = measureWordFitElement(element, {
      text: textOverride,
      baseFontSize,
    });
    element.dataset.wordOverflow = String(!result.fits);
    setFit((current) => (
      current.fontSize === result.fontSize && current.fits === result.fits ? current : result
    ));
  }, [baseFontSize]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    evaluate(text);
    const observer = new ResizeObserver(() => evaluate());
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    const fontReady = document.fonts?.ready.then(() => evaluate());
    void fontReady;
    return () => observer.disconnect();
  }, [allowSameWordBreak, availableWidthInset, containerSelector, evaluate, minimumFontSize, text, widthMode, style?.fontFamily, style?.fontWeight, style?.fontStyle, style?.letterSpacing, style?.textTransform]);

  const showLimitState = showOverflowFeedback && !fit.fits;
  const componentProps = {
    ...rest,
    ref: (node: HTMLElement | null) => { elementRef.current = node; },
    'data-word-fit': 'true',
    'data-word-fit-scope': fitScope,
    'data-word-fit-base-size': baseFontSize,
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
    className: `${allowSameWordBreak ? '' : 'automenu-word-safe'} ${showLimitState ? 'automenu-text-limit-exceeded' : ''} ${className}`,
    style: { ...style, fontSize: `${fit.fontSize}px` },
    onInput: (event: React.InputEvent<HTMLElement>) => {
      evaluate(event.currentTarget.innerText);
      onInput?.(event);
    },
  };

  return (
    <>
      {React.createElement(as, componentProps, children ?? text)}
      {showLimitState && (
        <span data-character-limit-feedback="true" className="automenu-character-limit-message">
          Limite de caracteres excedido
        </span>
      )}
    </>
  );
};
