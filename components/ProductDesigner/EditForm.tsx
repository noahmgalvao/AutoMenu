
import React from 'react';
import { MenuStyle, Product } from '../../types';
import { X, Check } from 'lucide-react';
import { formatMenuPriceValue, parseAndRoundPrice } from '../../utils/price';

interface EditFormProps {
  type: 'product' | 'category';
  style: MenuStyle;
  formData: Partial<Product>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  saveEdit: () => void;
  cancelEdit: () => void;
}

export const EditForm: React.FC<EditFormProps> = ({
  type,
  style,
  formData,
  setFormData,
  saveEdit,
  cancelEdit
}) => {
  const priceInputFocusedRef = React.useRef(false);
  const priceAtFocusRef = React.useRef<number | undefined>(undefined);
  const [priceInput, setPriceInput] = React.useState(() => formatMenuPriceValue(formData.price ?? 0, style));

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
              onFocus={() => {
                priceInputFocusedRef.current = true;
                priceAtFocusRef.current = formData.price;
              }}
              onChange={(event) => {
                const nextValue = event.target.value;
                setPriceInput(nextValue);
                const normalized = parseAndRoundPrice(nextValue);
                if (normalized !== null) setFormData((previous) => ({ ...previous, price: normalized }));
              }}
              onBlur={(event) => {
                priceInputFocusedRef.current = false;
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
