import React, { useEffect, useRef, useState } from 'react';
import Select, { components } from 'react-select';
import type { SingleValue, StylesConfig } from 'react-select';
import {
  FONTS,
  isMiniFoodTexture,
  MINI_FOOD_BACKGROUNDS,
  normalizeTextureUrl,
  SAMPLE_BACKGROUNDS,
} from '../../constants';

type SelectOption = { value: string; label: string };
type TextureOption = SelectOption & { url: string };

const selectStyles: StylesConfig<any, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderColor: state.isFocused ? '#6366f1' : '#e2e8f0',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.12)' : 'none',
    fontSize: 12,
  }),
  menu: (base) => ({ ...base, zIndex: 80, fontSize: 12 }),
  menuList: (base) => ({
    ...base,
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain',
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#eef2ff' : state.isFocused ? '#f8fafc' : '#fff',
    color: state.isSelected ? '#4338ca' : '#334155',
  }),
};

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

const getMiniFoodIconPreviewUrl = (url: string) => {
  const prefix = 'data:image/svg+xml;base64,';
  if (!url.startsWith(prefix) || typeof atob !== 'function' || typeof btoa !== 'function') return url;

  const svg = atob(url.slice(prefix.length))
    .replace(/opacity="\.16"/g, 'opacity=".95"')
    .replace(/opacity="\.12"/g, 'opacity="0"');
  return `${prefix}${btoa(svg)}`;
};

const getTexturePreviewStyle = (url: string, showMiniFoodIcon: boolean): React.CSSProperties => (
  showMiniFoodIcon
    ? {
        backgroundColor: '#ffffff',
        backgroundImage: `url(${getMiniFoodIconPreviewUrl(url)})`,
        backgroundPosition: '-8px -8px',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '794px 1123px',
      }
    : {
        backgroundColor: '#ffffff',
        backgroundImage: url ? `url(${url})` : 'none',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }
);

export const FontSelect: React.FC<{
  value?: string;
  onChange: (font: string) => void;
  fallbackFontFamily?: string;
  placeholder?: string;
  menuGap?: number;
}> = ({ value, onChange, fallbackFontFamily, placeholder = 'Buscar fonte...', menuGap }) => {
  useFontLibrary();
  const [isTouchInput, setIsTouchInput] = useState(false);
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const selectRef = useRef<any>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const keepMenuOpenRef = useRef(false);
  const keyboardDismissedForGestureRef = useRef(false);
  const lastTouchToggleRef = useRef(0);
  const resolvedValue = value || fallbackFontFamily || FONTS[0];

  const dismissKeyboard = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  };

  useEffect(() => {
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setIsTouchInput(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!menuIsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [menuIsOpen]);

  const toggleFromIndicator = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    lastTouchToggleRef.current = Date.now();
    dismissKeyboard();
    setMenuIsOpen((current) => !current);
  };

  const DropdownIndicator = (indicatorProps: any) => {
    if (!isTouchInput) return <components.DropdownIndicator {...indicatorProps} />;
    const innerProps = indicatorProps.innerProps || {};
    return (
      <components.DropdownIndicator
        {...indicatorProps}
        innerProps={{
          ...innerProps,
          onPointerDown: (event: React.PointerEvent) => toggleFromIndicator(event),
          onMouseDown: (event: React.MouseEvent) => {
            if (Date.now() - lastTouchToggleRef.current < 500) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            toggleFromIndicator(event);
          },
        }}
      />
    );
  };

  const MenuList = (menuProps: any) => {
    const hideKeyboard = (event: React.TouchEvent<HTMLDivElement>) => {
      if (keyboardDismissedForGestureRef.current) return;
      keyboardDismissedForGestureRef.current = true;
      keepMenuOpenRef.current = true;
      const list = event.currentTarget.querySelector<HTMLElement>('[role="listbox"]');
      const scrollTop = list?.scrollTop || 0;
      selectRef.current?.blur?.();
      window.requestAnimationFrame(() => {
        if (list) list.scrollTop = scrollTop;
        keepMenuOpenRef.current = false;
      });
    };
    return (
      <div
        className="touch-pan-y"
        onTouchStartCapture={() => { keyboardDismissedForGestureRef.current = false; }}
        onTouchMoveCapture={hideKeyboard}
      >
        <components.MenuList {...menuProps} />
      </div>
    );
  };

  return (
    <div ref={rootRef} className="automenu-font-select">
    <Select
      ref={selectRef}
      value={fontOptions.find((option) => option.value === resolvedValue) || { value: resolvedValue, label: resolvedValue }}
      onChange={(option: SingleValue<SelectOption>) => onChange(option?.value || '')}
      options={fontOptions}
      placeholder={placeholder}
      styles={menuGap === undefined ? selectStyles : {
        ...selectStyles,
        menu: (base, state) => ({ ...selectStyles.menu?.(base, state), marginTop: menuGap }),
      }}
      captureMenuScroll={false}
      menuShouldScrollIntoView={false}
      isSearchable
      menuIsOpen={menuIsOpen}
      onMenuOpen={() => setMenuIsOpen(true)}
      onMenuClose={() => { if (!keepMenuOpenRef.current) setMenuIsOpen(false); }}
      components={{ DropdownIndicator, MenuList }}
      noOptionsMessage={() => 'Nenhuma fonte encontrada'}
      formatOptionLabel={(option) => (
        <span style={{ fontFamily: option.value }}>{option.label}</span>
      )}
    />
    </div>
  );
};

export const TextureSelect: React.FC<{
  value?: string;
  onChange: (url: string) => void;
}> = ({ value, onChange }) => {
  const normalizedValue = normalizeTextureUrl(value);
  const selectedOption = isMiniFoodTexture(normalizedValue)
    ? textureOptions.find((option) => isMiniFoodTexture(option.value))
    : textureOptions.find((option) => option.value === normalizedValue);

  return (
    <Select
      value={selectedOption || textureOptions[0]}
      onChange={(option: SingleValue<TextureOption>) => onChange(option?.value || '')}
      options={textureOptions}
      placeholder="Buscar textura..."
      styles={selectStyles}
      isSearchable
      noOptionsMessage={() => 'Nenhuma textura encontrada'}
      formatOptionLabel={(option) => {
        const showMiniFoodIcon = isMiniFoodTexture(option.url);
        return (
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`${showMiniFoodIcon ? 'h-10 w-10' : 'h-5 w-7'} rounded border border-slate-200 shrink-0`}
              style={getTexturePreviewStyle(option.url, showMiniFoodIcon)}
            />
            <span className="truncate">{option.label}</span>
          </div>
        );
      }}
    />
  );
};

export const MiniFoodTextureSelect: React.FC<{
  value?: string;
  onChange: (url: string) => void;
}> = ({ value, onChange }) => (
  <Select
    value={miniFoodTextureOptions.find((option) => option.value === normalizeTextureUrl(value)) || miniFoodTextureOptions[0]}
    onChange={(option: SingleValue<TextureOption>) => onChange(option?.value || MINI_FOOD_BACKGROUNDS[0].url)}
    options={miniFoodTextureOptions}
    placeholder="Escolher mini comida..."
    styles={selectStyles}
    isSearchable
    noOptionsMessage={() => 'Nenhuma mini comida encontrada'}
    formatOptionLabel={(option) => (
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-10 w-10 rounded border border-slate-200 bg-white shrink-0"
          style={getTexturePreviewStyle(option.url, true)}
        />
        <span className="truncate">{option.label}</span>
      </div>
    )}
  />
);
