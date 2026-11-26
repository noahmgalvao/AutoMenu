import { useRenderedTextControls } from './useRenderedTextControls';
import { TextOutlinePicker } from './TextOutlinePicker';

import { ColorPicker } from './ColorPicker';
import React from 'react';
import type { ElementStyle } from '../../../domain/menu/model';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline } from 'lucide-react';
import { FontSelect } from './SearchableSelects';
import { FontSizeInput } from './FontSizeInput';

interface StyleControlsProps {
  label: string;
  value: ElementStyle;
  onChange: (newStyle: ElementStyle) => void | boolean;
  disabled?: boolean;
  maxFontSize?: number;
  minFontSize?: number;
  fallbackFontFamily?: string;
  header?: React.ReactNode;
  fontSelector?: string;
}

export const StyleControls: React.FC<StyleControlsProps> = ({ 
  label, 
  value, 
  onChange,
  disabled = false,
  maxFontSize,
  minFontSize,
  fallbackFontFamily,
  header,
  fontSelector,
}) => {
    const rendered = useRenderedTextControls(fontSelector, value.fontSize);
    return (
        <div className={`space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-100 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {header ?? <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>}
            
            {/* Fonte e tamanho */}
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                    <FontSelect
                        value={value.fontFamily || fallbackFontFamily}
                        fallbackFontFamily={fallbackFontFamily}
                        placeholder="Buscar fonte..."
                        onChange={(font) => onChange({...value, fontFamily: font})}
                    />
                </div>
                <FontSizeInput showStepButtons
                    value={rendered.size}
                    onChange={(fontSize) => rendered.canSetSize(fontSize) && onChange({...value, fontSize})}
                    max={maxFontSize}
                    min={minFontSize}
                />
            </div>

            {/* Cor e alinhamento */}
            <div className="flex flex-wrap items-center gap-1.5">
                <ColorPicker value={value.color} onChange={color => onChange({ ...value, color })} />
                <TextOutlinePicker value={value.textOutline} onChange={textOutline => onChange({ ...value, textOutline })} />

                <div className="flex bg-white rounded border border-slate-200">
                    {(['left', 'center', 'right'] as const).map((align) => (
                        <button type="button"
                            key={align}
                            aria-label={align === 'left' ? 'Alinhar à esquerda' : align === 'center' ? 'Centralizar texto' : 'Alinhar à direita'}
                            aria-pressed={(rendered.priceAlignmentDisabled ? 'right' : value.textAlign || rendered.priceAlignment) === align}
                            disabled={rendered.priceAlignmentDisabled}
                            onClick={() => onChange({...value, textAlign: align})}
                            className={`p-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 ${value.textAlign === align ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}
                        >
                            {align === 'left' && <AlignLeft size={14} />}
                            {align === 'center' && <AlignCenter size={14} />}
                            {align === 'right' && <AlignRight size={14} />}
                        </button>
                    ))}
                </div>

                <button type="button"
                    onClick={() => onChange({...value, fontWeight: (value.fontWeight === '700' || value.fontWeight === 'bold') ? '400' : '700'})}
                    className={`p-1.5 rounded border border-slate-200 ${(value.fontWeight === '700' || value.fontWeight === 'bold') ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`}
                    title="Negrito" aria-label="Negrito" aria-pressed={value.fontWeight === '700' || value.fontWeight === 'bold'}
                >
                    <Bold size={14} />
                </button>
                <button type="button"
                    onClick={() => onChange({...value, italic: !value.italic})}
                    className={`p-1.5 rounded border border-slate-200 ${value.italic ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`}
                    title="Itálico" aria-label="Itálico" aria-pressed={Boolean(value.italic)}
                >
                    <Italic size={14} />
                </button>
                <button type="button"
                    onClick={() => onChange({...value, underline: !value.underline})}
                    className={`p-1.5 rounded border border-slate-200 ${value.underline ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`}
                    title="Sublinhado" aria-label="Sublinhado" aria-pressed={Boolean(value.underline)}
                >
                    <Underline size={14} />
                </button>
            </div>
        </div>
    );
};
