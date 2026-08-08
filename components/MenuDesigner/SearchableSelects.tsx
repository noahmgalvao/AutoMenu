import React, { useEffect } from 'react';
import Select from 'react-select';
import type { SingleValue, StylesConfig } from 'react-select';
import type { MenuStyle } from '../../types';
import {
  FONTS,
  isMiniFoodTexture,
  MINI_FOOD_BACKGROUNDS,
  normalizeTextureUrl,
  SAMPLE_BACKGROUNDS,
} from '../../constants';

type SelectOption = { value: string; label: string };
type TextureOption = SelectOption & { url: string };
type TemplateOption = SelectOption & { template: MenuStyle };

const selectStyles: StylesConfig<any, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderColor: state.isFocused ? '#6366f1' : '#e2e8f0',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.12)' : 'none',
    fontSize: 12,
  }),
  menu: (base) => ({ ...base, zIndex: 80, fontSize: 12 }),
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
  includeInherit?: boolean;
  placeholder?: string;
}> = ({ value, onChange, includeInherit = false, placeholder = 'Buscar fonte...' }) => {
  useFontLibrary();
  const options = includeInherit
    ? [{ value: '', label: 'Herdar fonte' }, ...fontOptions]
    : fontOptions;

  return (
    <Select
      value={options.find((option) => option.value === (value || '')) || null}
      onChange={(option: SingleValue<SelectOption>) => onChange(option?.value || '')}
      options={options}
      placeholder={placeholder}
      styles={selectStyles}
      isSearchable
      noOptionsMessage={() => 'Nenhuma fonte encontrada'}
      formatOptionLabel={(option) => (
        <span style={{ fontFamily: option.value || undefined }}>{option.label}</span>
      )}
    />
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

export const TemplateSelect: React.FC<{
  templates: MenuStyle[];
  currentStyleId: string;
  onChange: (template: MenuStyle) => void;
}> = ({ templates, currentStyleId, onChange }) => {
  const options: TemplateOption[] = templates.map((template) => ({
    value: template.id,
    label: template.name,
    template,
  }));

  return (
    <Select
      value={options.find((option) => option.value === currentStyleId) || null}
      onChange={(option: SingleValue<TemplateOption>) => {
        if (option?.template) onChange(option.template);
      }}
      options={options}
      placeholder="Buscar modelo..."
      styles={selectStyles}
      isSearchable
      noOptionsMessage={() => 'Nenhum modelo encontrado'}
      formatOptionLabel={(option) => (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-5 w-5 rounded border border-black/10 shadow-sm shrink-0"
            style={{ backgroundColor: option.template.primaryColor }}
          />
          <span className="truncate">{option.label}</span>
        </div>
      )}
    />
  );
};
