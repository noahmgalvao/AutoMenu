
import React from 'react';
import { MenuStyle, Product } from '../../types';
import { AlignCenter, AlignLeft, AlignRight, Check, ImagePlus, Loader2, X } from 'lucide-react';
import { formatMenuPriceValue, parseAndRoundPrice } from '../../utils/price';

interface EditFormProps {
  type: 'product' | 'category';
  style: MenuStyle;
  formData: Partial<Product>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  saveEdit: () => void;
  cancelEdit: () => void;
  imageSource?: string;
  imageUploading?: boolean;
  onImageClick?: () => void;
  onRemoveImage?: () => void;
}

export const EditForm: React.FC<EditFormProps> = ({
  type,
  style,
  formData,
  setFormData,
  saveEdit,
  cancelEdit,
  imageSource,
  imageUploading = false,
  onImageClick,
  onRemoveImage,
}) => {
  const priceInputFocusedRef = React.useRef(false);
  const priceAtFocusRef = React.useRef<number | undefined>(undefined);
  const replacePriceOnNextInputRef = React.useRef(false);
  const [priceInput, setPriceInput] = React.useState(() => formatMenuPriceValue(formData.price ?? 0, style));

  const replacePriceInput = (nextValue: string) => {
    const sanitized = nextValue.replace(/[^0-9.,]/g, '');
    if (!sanitized) return;
    replacePriceOnNextInputRef.current = false;
    setPriceInput(sanitized);
    const normalized = parseAndRoundPrice(sanitized);
    if (normalized !== null) setFormData((previous) => ({ ...previous, price: normalized }));
  };

  React.useEffect(() => {
    if (!priceInputFocusedRef.current) {
      setPriceInput(formatMenuPriceValue(formData.price ?? 0, style));
    }
  }, [formData.price, style.priceDecimalPlaces, style.priceDecimalSeparator]);

  return (
    <div 
      className="flex flex-col gap-2 p-3 bg-white border-2 border-indigo-500 rounded-lg shadow-lg animate-in fade-in zoom-in-95" 
      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
    >
      <input 
        autoFocus
        className="w-full bg-white text-slate-900 [color-scheme:light] font-bold text-sm border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
        placeholder={type === 'category' ? "Nome da categoria" : "Nome do produto"}
        value={formData.name || ''}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
      />
      {type === 'product' && (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              <button type="button" onClick={onImageClick} className="absolute inset-0 z-[1] flex items-center justify-center" title="Alterar imagem">
                {imageSource ? <img src={imageSource} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${formData.imageAlignment || 'center'} center` }} /> : <ImagePlus size={20} className="text-slate-300" />}
              </button>
              {imageSource && <button type="button" onClick={(event) => { event.stopPropagation(); onRemoveImage?.(); }} className="absolute right-1 top-1 z-[3] flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-600 shadow" title="Remover imagem" aria-label="Remover imagem"><X size={12} /></button>}
              {imageUploading && <div className="absolute inset-0 z-[4] flex items-center justify-center bg-white/75"><Loader2 size={18} className="animate-spin text-indigo-600" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Alinhamento da imagem</p>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((alignment) => (
                  <button key={alignment} type="button" onClick={() => setFormData((previous) => ({ ...previous, imageAlignment: alignment }))} className={`flex h-8 w-8 items-center justify-center rounded-lg border ${formData.imageAlignment === alignment || (!formData.imageAlignment && alignment === 'center') ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`} aria-label={`Alinhar imagem à ${alignment === 'left' ? 'esquerda' : alignment === 'right' ? 'direita' : 'centro'}`}>
                    {alignment === 'left' ? <AlignLeft size={15} /> : alignment === 'center' ? <AlignCenter size={15} /> : <AlignRight size={15} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <input 
            className="w-full bg-white text-slate-900 [color-scheme:light] text-xs border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
            placeholder="Descrição"
            value={formData.description || ''}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            {style.showCurrencySymbol !== false && <span className="text-xs text-slate-400">R$</span>}
            <input 
              type="text"
              inputMode="decimal"
              className="w-20 bg-white text-slate-900 [color-scheme:light] text-xs font-mono border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
              placeholder={formatMenuPriceValue(0, style)}
              value={priceInput}
              onFocus={(event) => {
                priceInputFocusedRef.current = true;
                priceAtFocusRef.current = formData.price;
                replacePriceOnNextInputRef.current = true;
                event.currentTarget.select();
              }}
              onChange={(event) => {
                const inputEvent = event.nativeEvent as InputEvent;
                if (replacePriceOnNextInputRef.current && inputEvent.data) {
                  replacePriceInput(inputEvent.data);
                  return;
                }
                replacePriceOnNextInputRef.current = false;
                const nextValue = event.currentTarget.value;
                setPriceInput(nextValue);
                const normalized = parseAndRoundPrice(nextValue);
                if (normalized !== null) setFormData((previous) => ({ ...previous, price: normalized }));
              }}
              onBeforeInput={(event) => {
                if (!replacePriceOnNextInputRef.current) return;
                const inputEvent = event.nativeEvent as InputEvent;
                if (!inputEvent.inputType?.startsWith('insert') || !inputEvent.data) return;
                event.preventDefault();
                replacePriceInput(inputEvent.data);
              }}
              onKeyDown={(event) => {
                const isPriceCharacter = event.key.length === 1
                  && /^[0-9.,]$/.test(event.key)
                  && !event.ctrlKey
                  && !event.metaKey
                  && !event.altKey;
                if (replacePriceOnNextInputRef.current && isPriceCharacter) {
                  event.preventDefault();
                  event.stopPropagation();
                  replacePriceInput(event.key);
                }
              }}
              onPointerUp={(event) => {
                if (replacePriceOnNextInputRef.current) event.currentTarget.select();
              }}
              onPaste={(event) => {
                if (!replacePriceOnNextInputRef.current) return;
                const pastedValue = event.clipboardData.getData('text');
                if (!pastedValue) return;
                event.preventDefault();
                replacePriceInput(pastedValue);
              }}
              onBlur={(event) => {
                priceInputFocusedRef.current = false;
                replacePriceOnNextInputRef.current = false;
                const normalized = parseAndRoundPrice(event.target.value);
                const originalPrice = priceAtFocusRef.current;
                const unchangedVisibleValue = originalPrice !== undefined
                  && event.target.value.trim() === formatMenuPriceValue(originalPrice, style);
                const nextPrice = unchangedVisibleValue ? originalPrice : normalized ?? formData.price ?? 0;
                priceAtFocusRef.current = undefined;
                setPriceInput(formatMenuPriceValue(nextPrice, style));
                setFormData((previous) => ({ ...previous, price: nextPrice }));
              }}
            />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 mt-1">
        <button onClick={cancelEdit} className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={14}/></button>
        <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={14}/></button>
      </div>
    </div>
  );
};
