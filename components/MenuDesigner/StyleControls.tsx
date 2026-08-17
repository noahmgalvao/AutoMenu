
import React from 'react';
import { ElementStyle } from '../../types';
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
}

export const StyleControls: React.FC<StyleControlsProps> = ({ 
  label, 
  value, 
  onChange,
  disabled = false,
  maxFontSize,
  minFontSize,
}) => {
    return (
        <div className={`space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-100 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
            
            {/* Fonte e tamanho */}
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                    <FontSelect
                        value={value.fontFamily || ''}
                        includeInherit
                        placeholder="Buscar fonte..."
                        onChange={(font) => onChange({...value, fontFamily: font || undefined})}
                    />
                </div>
                <FontSizeInput
                    value={value.fontSize}
                    onChange={(fontSize) => onChange({...value, fontSize})}
                    max={maxFontSize}
                    min={minFontSize}
                />
            </div>

            {/* Cor e alinhamento */}
            <div className="flex gap-2 items-center">
                <div className="h-8 w-10 relative rounded border border-slate-200 overflow-hidden flex-shrink-0">
                    <input 
                        type="color" 
                        className="absolute -top-4 -left-4 w-[200%] h-[200%] cursor-pointer"
                        value={value.color || '#000000'}
                        onChange={(e) => onChange({...value, color: e.target.value})}
                    />
                </div>
                
                <div className="flex bg-white rounded border border-slate-200">
                    {['left', 'center', 'right'].map((align) => (
                        <button
                            key={align}
                            onClick={() => onChange({...value, textAlign: align as any})}
                            className={`p-1.5 hover:bg-slate-100 ${value.textAlign === align ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}
                        >
                            {align === 'left' && <AlignLeft size={14} />}
                            {align === 'center' && <AlignCenter size={14} />}
                            {align === 'right' && <AlignRight size={14} />}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => onChange({...value, fontWeight: value.fontWeight === '700' ? '400' : '700'})}
                    className={`p-1.5 rounded border border-slate-200 ${value.fontWeight === '700' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`}
                    title="Negrito"
                >
                    <Bold size={14} />
                </button>
                <button
                    onClick={() => onChange({...value, italic: !value.italic})}
                    className={`p-1.5 rounded border border-slate-200 ${value.italic ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`}
                    title="Itálico"
                >
                    <Italic size={14} />
                </button>
                <button
                    onClick={() => onChange({...value, underline: !value.underline})}
                    className={`p-1.5 rounded border border-slate-200 ${value.underline ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`}
                    title="Sublinhado"
                >
                    <Underline size={14} />
                </button>
            </div>
        </div>
    );
};
