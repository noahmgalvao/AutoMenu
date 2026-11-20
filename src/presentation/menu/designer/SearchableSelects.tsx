import { miniFoodIconUrl } from '../../../domain/menu/miniFoods';
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  FONTS,
  getMiniFoodTextureKind,
  MINI_FOOD_BACKGROUNDS,
  normalizeTextureUrl,
  SAMPLE_BACKGROUNDS,
} from '../../../domain/menu/defaults';

type SelectOption<Value extends string = string> = { value: Value; label: string; disabled?: boolean };
type TextureOption = SelectOption & { url: string };

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fontUrl = (fonts: string[]) => (
  `https://fonts.googleapis.com/css2?${fonts
    .map((font) => `family=${font.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800`)
    .join('&')}&display=swap`
);

const useFontLibrary = () => {
  useEffect(() => {
    chunk(FONTS, 18).forEach((fonts, index) => {
      const id = `font-library-${index}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = fontUrl(fonts);
      document.head.appendChild(link);
    });
  }, []);
};

const fontOptions: SelectOption[] = FONTS.map((font) => ({ value: font, label: font }));
const textureOptions: TextureOption[] = SAMPLE_BACKGROUNDS.map((texture) => ({
  value: texture.url,
  label: texture.name,
  url: texture.url,
}));
const miniFoodTextureOptions: TextureOption[] = MINI_FOOD_BACKGROUNDS.map((texture) => ({
  value: texture.url,
  label: texture.name,
  url: texture.url,
}));

const getTexturePreviewStyle = (url: string): React.CSSProperties => {
  const kind = getMiniFoodTextureKind(url);
  const preview = kind ? miniFoodIconUrl(kind) : url;
  return {
    backgroundColor: '#ffffff',
    backgroundImage: preview ? `url(${preview})` : 'none',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: kind ? 'contain' : 'cover',
  };
};

const foldSearch = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();

export function DesignerPicker<T extends SelectOption>({ label, value, options, preferred, choose, render, renderAction, searchLabel, empty, gap, compact = false }: {
  label: string;
  value: T;
  options: readonly T[];
  preferred?: { label: string; options: readonly T[] };
  choose: (option: T) => void;
  render: (option: T) => React.ReactNode;
  renderAction?: (option: T) => React.ReactNode;
  searchLabel?: string;
  empty?: string;
  gap?: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const search = open ? foldSearch(query) : '';
  const filter = (items: readonly T[]) => search ? items.filter(option => foldSearch(option.label).includes(search)) : items;
  const matches = open ? filter(options) : [];
  const preferredMatches = open && preferred ? filter(preferred.options) : [];
  const renderOption = (option: T) => <div key={option.value} role="presentation" className="flex items-center gap-1">
    <button type="button" role="option" aria-selected={option.value === value.value}
      data-option-value={option.value} disabled={option.disabled}
      className="block min-w-0 flex-1 truncate rounded px-2 py-2 text-left text-slate-700 hover:bg-slate-50 active:bg-indigo-100 focus:bg-slate-100 disabled:opacity-50 aria-selected:bg-indigo-50 aria-selected:text-indigo-700"
      onClick={() => { choose(option); close(); trigger.current?.focus({ preventScroll: true }); }}>{render(option)}</button>
    {renderAction?.(option)}
  </div>;
  const close = () => { setOpen(false); setQuery(''); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query]);

  return <div ref={root} className="relative min-w-0" onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.current?.focus({ preventScroll: true });
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    if (!open) { setOpen(true); return; }
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]:not(:disabled)') || []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1)
      : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    items[next]?.focus();
  }}>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId}
      className={`flex ${compact ? 'min-h-8' : 'min-h-9'} w-full min-w-0 items-center justify-between gap-1 rounded border border-slate-200 bg-white px-2 text-left text-xs text-slate-700 outline-indigo-500`}
      onClick={() => open ? close() : setOpen(true)}>
      <span className="block min-w-0 flex-1 truncate">{render(value)}</span>
      <ChevronDown aria-hidden="true" size={14} className="shrink-0" />
    </button>
    {open && <div className="absolute z-[80] w-full min-w-32 rounded-lg border border-slate-200 bg-white text-xs shadow-lg"
      style={{ marginTop: gap ?? 4 }}>
      {searchLabel && <label className="flex items-center gap-1.5 border-b border-slate-100 px-2 text-slate-500">
        <Search size={13} aria-hidden="true" />
        <input className="h-8 min-w-0 flex-1 bg-transparent text-slate-800 outline-none" type="text"
          aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.target.value)} />
      </label>}
      <div ref={list} id={listId} role="listbox" aria-label={label} className="max-h-44 touch-pan-y overflow-y-auto p-1">
        {preferredMatches.length > 0 && <div role="group" aria-label={preferred?.label} className="mb-1 border-b border-slate-200 pb-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{preferred?.label}</div>
          {preferredMatches.map(renderOption)}
        </div>}
        {matches.map(renderOption)}
        {!matches.length && !preferredMatches.length && <div role="status" className="p-2 text-slate-500">{empty}</div>}
      </div>
    </div>}
  </div>;
}

export function DesignerOptionSelect<Value extends string>({ label, value, options, onChange }: {
  label: string;
  value: Value;
  options: readonly SelectOption<Value>[];
  onChange: (value: Value) => void;
}) {
  return <DesignerPicker compact label={label} value={options.find(option => option.value === value) || { value, label: value }}
    options={options} choose={option => onChange(option.value)} render={option => option.label} />;
}

export const MenuFontContext = React.createContext<readonly string[]>([]);

export const FontSelect: React.FC<{
  value?: string;
  onChange: (font: string) => void;
  fallbackFontFamily?: string;
  placeholder?: string;
  menuGap?: number;
}> = ({ value, onChange, fallbackFontFamily, placeholder = 'Buscar fonte...', menuGap }) => {
  const used = React.useContext(MenuFontContext);
  const groups = React.useMemo(() => ({
    used: used.map(font => ({ value: font, label: font })),
    catalog: fontOptions.filter(option => !used.includes(option.value)),
  }), [used]);
  useFontLibrary();
  const resolvedValue = value || fallbackFontFamily || FONTS[0];
  return <div className="automenu-font-select min-w-0">
    <DesignerPicker label="Fonte" searchLabel={placeholder} gap={menuGap}
      value={fontOptions.find(option => option.value === resolvedValue) || { value: resolvedValue, label: resolvedValue }}
      preferred={{ label: 'Neste cardápio', options: groups.used }}
      options={groups.catalog} choose={option => onChange(option.value)} empty="Nenhuma fonte encontrada"
      render={option => <span style={{ fontFamily: option.value }}>{option.label}</span>} />
  </div>;
};

export function TextureSelect({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const normalizedValue = normalizeTextureUrl(value);
  const selectedOption = getMiniFoodTextureKind(normalizedValue)
    ? textureOptions.find(option => getMiniFoodTextureKind(option.value))
    : textureOptions.find(option => option.value === normalizedValue);

  return <DesignerPicker label="Textura de fundo" value={selectedOption || textureOptions[0]}
    options={textureOptions} choose={option => onChange(option.url)} render={option => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-5 w-7 shrink-0 rounded border border-slate-200" style={getTexturePreviewStyle(option.url)} />
        <span className="truncate">{option.label}</span>
      </span>
    )} />;
}

export function MiniFoodTextureSelect({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const selected = miniFoodTextureOptions.find(option => getMiniFoodTextureKind(option.value) === getMiniFoodTextureKind(value));
  return <DesignerPicker label="Mini comida" searchLabel="Buscar mini comida" value={selected || miniFoodTextureOptions[0]}
    options={miniFoodTextureOptions} choose={option => onChange(option.url)} empty="Nenhuma mini comida encontrada"
    render={option => {
      const kind = getMiniFoodTextureKind(option.url);
      return <span className="flex min-w-0 items-center gap-2">
        {kind && <img src={miniFoodIconUrl(kind)} alt="" className="h-5 w-5 shrink-0" draggable={false} />}
        <span className="truncate">{option.label}</span>
      </span>;
    }} />;
}
