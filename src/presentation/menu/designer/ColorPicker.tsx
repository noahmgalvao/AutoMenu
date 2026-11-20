import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, X } from 'lucide-react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { isMiniFoodKind, MINI_FOOD_INK } from '../../../domain/menu/miniFoods';
import type { MenuStyle } from '../../../domain/menu/model';

const palette = ['#ffffff', '#0f172a', '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#2563eb', '#7c3aed', '#ec4899', '#92400e'];
const recentColorsKey = 'automenu:recent-colors';
let recentColors: string[] = [];
let colorContext: CanvasRenderingContext2D | null | undefined;
const hexByte = (value: number) => Math.round(value).toString(16).padStart(2, '0');

function toHex(color: string) {
  if (/^#[a-f\d]{6}$/i.test(color)) return color.toLowerCase();
  colorContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const context = colorContext;
  if (!context) return '#000000';
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#000000';
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return '#' + hexByte(r) + hexByte(g) + hexByte(b);
}

function getChannels(hex: string, mode: 'RGB' | 'HSL') {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  if (mode === 'RGB') return channels;
  const [r, g, b] = channels.map(value => value / 255);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const delta = high - low;
  const lightness = (high + low) / 2;
  if (!delta) return [0, 0, Math.round(lightness * 100)];
  const hue = high === r ? (g - b) / delta : high === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return [Math.round((hue * 60 + 360) % 360), Math.round(delta / (1 - Math.abs(2 * lightness - 1)) * 100), Math.round(lightness * 100)];
}

function readRecentColors() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentColorsKey) || 'null');
    if (Array.isArray(stored)) recentColors = [...new Set(stored
      .filter(color => typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color)).map(color => color.toLowerCase()))];
  } catch { /* Keep the colors from this session. */ }
  return recentColors;
}

export const MenuColorContext = React.createContext({ shapes: [] as string[], fallback: [] as string[] });

export function getMenuPalette(style: MenuStyle, freeTextColors: (string | undefined)[]) {
  const shapes = (style.addedImages || []).flatMap(({ shape }) => {
    if (!shape) return [];
    if (isMiniFoodKind(shape.kind)) return [MINI_FOOD_INK];
    return [shape.kind !== 'line' ? shape.fill : '', shape.strokeWidth > 0 ? shape.stroke : '', shape.text ? shape.textColor || '' : ''].filter(Boolean);
  });
  const fallback = [
    style.backgroundColor, style.primaryColor, style.textColor, style.cardBackgroundColor,
    ...Object.values(style.elementStyles).map(element => element?.color),
    ...Object.values(style.borders || {}).map(border => border?.sides.length ? border.color : undefined),
    ...Object.values(style.freeTextBorders || {}).map(border => border.sides.length ? border.color : undefined),
    ...Object.values(style.fills || {}), ...Object.values(style.freeTextFills || {}),
    ...freeTextColors,
  ].filter((color): color is string => Boolean(color));
  return { shapes, fallback };
}

function getRenderedColors(trigger: HTMLElement | null, colors: React.ContextType<typeof MenuColorContext>) {
  const canvas = trigger?.closest('[data-automenu-editor-canvas]') || document.querySelector('[data-automenu-editor-canvas]');
  const pages = canvas?.querySelectorAll<HTMLElement>('[data-menu-print-page]');
  if (!pages?.length) return [...colors.fallback, ...colors.shapes];
  const used = new Set<string>();
  const add = (color: string) => {
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') used.add(color);
  };
  pages.forEach(page => {
    add(getComputedStyle(page).backgroundColor);
    page.querySelectorAll<HTMLElement>(
      '[data-word-fit], [data-border-text], [data-menu-marker], [data-menu-border], [data-menu-divider-color], [data-page-number], [data-template-card], [data-template-category], [data-template-price]',
    ).forEach(element => {
      const css = getComputedStyle(element);
      if (css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0') return;
      if (element.matches('[data-word-fit], [data-border-text], [data-menu-marker], [data-page-number]') && element.textContent?.trim()) add(css.color);
      if (element.dataset.menuDividerColor && element.offsetWidth > 0) add(element.dataset.menuDividerColor);
      add(css.backgroundColor);
      if (element.matches('[data-menu-border], [data-template-card], [data-template-category], [data-template-price]')) {
        if (parseFloat(css.borderTopWidth)) add(css.borderTopColor);
        if (parseFloat(css.borderBottomWidth)) add(css.borderBottomColor);
        if (parseFloat(css.borderLeftWidth)) add(css.borderLeftColor);
        if (parseFloat(css.borderRightWidth)) add(css.borderRightColor);
      }
    });
  });
  return [...used, ...colors.shapes];
}

interface Props {
  value?: string;
  onChange: (color: string) => void;
  label?: string;
  className?: string;
  preview?: 'background' | 'cards' | 'primary' | 'text';
}

export function ColorPicker({ value = '#000000', onChange, label = 'Cor', className = '', preview }: Props) {
  const colors = React.useContext(MenuColorContext);
  const [open, setOpen] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState<'HEX' | 'RGB' | 'HSL'>('HEX');
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const [recent, setRecent] = useState(readRecentColors);
  const [activePalette, setActivePalette] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pickerId = React.useId();
  const previewCanvas = useRef<HTMLElement | null>(null);
  const draftRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clearPreview = React.useCallback(() => {
    if (previewCanvas.current) {
      previewCanvas.current.style.removeProperty(`--automenu-preview-${preview}`);
      if (preview === 'primary') previewCanvas.current.style.removeProperty('--automenu-preview-tint');
      delete previewCanvas.current.dataset.colorPreview;
    }
    previewCanvas.current = null;
  }, [preview]);

  const updateDraft = (color: string) => {
    draftRef.current = color;
    setDraft(color);
    if (preview) {
      previewCanvas.current ||= document.querySelector('[data-automenu-editor-canvas="true"]');
      if (previewCanvas.current) {
        previewCanvas.current.dataset.colorPreview = 'true';
        previewCanvas.current.style.setProperty(`--automenu-preview-${preview}`, color);
        if (preview === 'primary') previewCanvas.current.style.setProperty('--automenu-preview-tint', color + '18');
      }
    }
  };

  const commit = (color: string) => {
    color = toHex(color);
    updateDraft(color);
    recentColors = [color, ...readRecentColors().filter(current => current !== color)];
    try { localStorage.setItem(recentColorsKey, JSON.stringify(recentColors)); } catch { /* In-memory colors still work. */ }
    setRecent(recentColors);
    onChangeRef.current(color);
  };

  useLayoutEffect(() => {
    if (open && !sampling) setActivePalette([...new Set(getRenderedColors(trigger.current, colors).map(toHex))]);
  }, [colors, open, sampling]);

  useEffect(() => clearPreview, [clearPreview]);
  useEffect(() => { if (!open) clearPreview(); }, [clearPreview, open]);

  useLayoutEffect(() => {
    if (!open || sampling) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = panel.current?.offsetHeight || 340;
      setPosition({
        left: Math.max(8, Math.min(rect.right - 252, window.innerWidth - 260)),
        top: Math.max(8, Math.min(rect.bottom + 6 <= window.innerHeight - height ? rect.bottom + 6 : rect.top - height - 6, window.innerHeight - height - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, sampling]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      setOpen(false);
      setSampling(false);
      clearPreview();
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sampling && !trigger.current?.contains(target) && !panel.current?.contains(target)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dismiss();
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [clearPreview, open, sampling]);

  useEffect(() => {
    if (!sampling) return;
    const pages = Array.from(document.querySelectorAll<HTMLElement>('[data-menu-print-page="true"]'));
    const overlays = pages.map(page => {
      const overlay = document.createElement('div');
      overlay.className = 'absolute inset-0 z-[90] cursor-crosshair touch-none';
      overlay.dataset.printControl = 'true';
      overlay.dataset.dragIgnore = 'true';
      overlay.setAttribute('aria-label', 'Coletar cor desta página');
      page.appendChild(overlay);
      const sample = async (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = page.getBoundingClientRect();
        const horizontal = (event.clientX - rect.left) / rect.width;
        const vertical = (event.clientY - rect.top) / rect.height;
        setSampling(false);
        try {
          const { default: render } = await import('html2canvas-pro');
          const canvas = await render(page, {
            useCORS: true,
            scale: 1,
            onclone: (_document, clonedPage) => { clonedPage.style.boxShadow = 'none'; },
            ignoreElements: element => element.hasAttribute('data-print-control'),
          });
          const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(horizontal * canvas.width)));
          const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(vertical * canvas.height)));
          const pixel = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data;
          if (!pixel) throw new Error('Canvas indisponível');
          commit('#' + hexByte(pixel[0]) + hexByte(pixel[1]) + hexByte(pixel[2]));
        } catch {
          setMessage('Não foi possível coletar essa cor.');
        }
      };
      overlay.addEventListener('pointerdown', sample, { once: true });
      return overlay;
    });
    return () => overlays.forEach(overlay => overlay.remove());
  }, [sampling]);

  const pickFromCanvas = async () => {
    const EyeDropper = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    setMessage('');
    if (EyeDropper) {
      try {
        const { sRGBHex } = await new EyeDropper().open();
        commit(sRGBHex);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setSampling(true);
      }
    } else {
      setSampling(true);
    }
  };

  const swatches = (items: string[], label: string, active = false) => items.length > 0 && (
    <div role="group" aria-label={label} className={`grid grid-cols-8 gap-1 ${active ? 'rounded-lg bg-indigo-50 p-1 ring-1 ring-indigo-200' : ''}`}>
      {items.map(color => <button key={color} type="button" title={color} aria-label={color}
        aria-pressed={draft === color}
        onClick={() => commit(color)} style={{ background: color }}
        className="aspect-square rounded-md border border-black/15 hover:ring-2 hover:ring-indigo-400" />)}
    </div>
  );

  const channels = mode === 'HEX' ? [] : getChannels(draft, mode);
  const recentPalette = recent.filter(color => !activePalette.includes(color));
  return <>
    <button ref={trigger} type="button" title={label} aria-label={label} aria-expanded={open} aria-controls={pickerId}
      data-drag-ignore="true" className={`h-8 w-8 shrink-0 rounded-md border border-black/15 ${className}`}
      style={{ background: open ? draft : value }}
      onClick={() => {
        if (open) clearPreview();
        else {
          const color = toHex(value);
          setRecent(readRecentColors());
          draftRef.current = color;
          setDraft(color);
          setMessage('');
        }
        setOpen(!open);
      }} />
    {open && createPortal(
      <div ref={panel} id={pickerId} role="dialog" aria-label={label} data-drag-ignore="true" data-editor-popover="true"
        className="fixed z-[11000] max-h-[calc(100dvh-16px)] w-[252px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl"
        style={sampling ? { left: 8, top: 8 } : position}
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 font-semibold text-slate-700">
          {sampling ? 'Toque em um ponto da página' : label}
          <button type="button" className="p-1" aria-label="Fechar seletor de cor" onClick={() => {
            setOpen(false);
            setSampling(false);
            clearPreview();
          }}><X size={16} /></button>
        </div>
        {!sampling && <>
          <HexColorPicker color={draft} onChange={updateDraft} onChangeEnd={commit} style={{ width: '100%', height: 146 }} />
          <div className="flex items-center gap-1">
            <select value={mode} onChange={event => setMode(event.target.value as typeof mode)} aria-label="Formato da cor" className="h-8 rounded-md border border-slate-200">
              <option>HEX</option><option>RGB</option><option>HSL</option>
            </select>
            {mode === 'HEX' ? <HexColorInput color={draft} prefixed onChange={updateDraft}
              onBlur={() => { if (draftRef.current !== toHex(value)) commit(draftRef.current); }}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              aria-label="Valor HEX" className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 font-mono" />
              : channels.map((channel, index) => {
                const channelName = mode[index];
                return <input key={`${mode}-${index}-${channel}`} type="number" min={0} max={mode === 'RGB' ? 255 : index === 0 ? 360 : 100} defaultValue={channel}
                  aria-label={channelName} title={channelName} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-1 font-mono"
                  onBlur={event => {
                    const next = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(next) || next === channel) return;
                    const max = Number(event.currentTarget.max);
                    const values = channels.map((current, slot) => slot === index ? Math.max(0, Math.min(max, next)) : current);
                    commit(toHex(mode === 'RGB' ? `rgb(${values.join(',')})` : `hsl(${values[0]},${values[1]}%,${values[2]}%)`));
                  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
              })}
            <button type="button" title="Conta-gotas" aria-label="Conta-gotas" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 text-indigo-700" onClick={() => void pickFromCanvas()}><Pipette size={16} /></button>
          </div>
          {swatches(activePalette, 'Cores do cardápio', true)}
          {swatches(recentPalette, 'Cores recentes')}
          {swatches(palette.filter(color => !activePalette.includes(color) && !recentPalette.includes(color)), 'Cores básicas')}
          {message && <p role="status" className="text-rose-700">{message}</p>}
        </>}
      </div>, document.body)}
  </>;
}
