import { photoDimensions } from '../menu/canvas/photoSizing';
import { MenuPhoto, PhotoLoading } from '../menu/canvas/MenuPhoto';
import { PhotoEditControls } from '../menu/canvas/PhotoEditControls';
import { copiedProductFields, matchingCanvasCopy } from '../menu/canvas/canvasClipboard';

import React from 'react';
import type { MenuStyle, Product, CategoryDividerStyle } from '../../domain/menu/model';
import { AlignCenter, AlignLeft, AlignRight, Check, X } from 'lucide-react';
import { formatMenuPriceValue, getMenuPriceSymbol, parseAndRoundPrice } from '../../domain/menu/price';
import { PriceFormatSettings } from '../menu/designer/PriceFormatSettings';
import { CategoryDividerPicker } from '../menu/designer/CategoryDividerPicker';
import { useReplacePlaceholderOnInput } from '../menu/interactions/useReplacePlaceholderOnInput';

interface EditFormProps {
  type: 'product' | 'category';
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  formData: Partial<Product>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  saveEdit: () => void;
  cancelEdit: () => void;
  autoFocus?: boolean;
  photoId?: string;
  imageSource?: string;
  imageUploading?: boolean;
  onImageClick?: () => void;
  onRemoveImage?: () => void;
  productDividerStyle?: CategoryDividerStyle;
  onProductDividerStyleChange?: (preset: CategoryDividerStyle) => void;
}

export const EditForm: React.FC<EditFormProps> = ({
  type,
  style,
  setStyle,
  formData,
  setFormData,
  saveEdit,
  cancelEdit,
  autoFocus = false,
  photoId = formData.id,
  imageSource,
  imageUploading = false,
  onImageClick,
  onRemoveImage,
  productDividerStyle,
  onProductDividerStyleChange,
}) => {
  const formRef = React.useRef<HTMLDivElement>(null);
  useReplacePlaceholderOnInput(formRef);
  const [photoActive, setPhotoActive] = React.useState(false);
  const anchorId = React.useId();
  const isCategory = type === 'category';
  const categoryImage = photoId && isCategory ? style.categoryImages?.[photoId] : undefined;
  const scale = (isCategory ? style.categoryImageScale : style.imageScale) || 1;
  const crop = (isCategory ? categoryImage?.crop : photoId ? style.productPhotoCrops?.[photoId] : undefined)
    || { x: formData.imageAlignment === 'left' ? 0 : formData.imageAlignment === 'right' ? 100 : 50, y: 50 };
  const flips = isCategory ? categoryImage : photoId ? style.productImageFlips?.[photoId] : undefined;

  const currencySymbol = getMenuPriceSymbol(style);
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
    <div ref={formRef} data-product-designer-edit-form
      onPointerDownCapture={event => {
        if (!(event.target as Element).closest('[data-product-image-surface]')) setPhotoActive(false);
      }}
      onPasteCapture={event => {
        const copied = matchingCanvasCopy(event.clipboardData.getData('text/html'))?.items[0];
        if (type !== 'product' || copied?.type !== 'product') return;
        event.preventDefault();
        event.stopPropagation();
        setFormData(prev => ({ ...prev, ...copiedProductFields(copied.product) }));
        setPriceInput(formatMenuPriceValue(copied.product.price, style));
        priceAtFocusRef.current = copied.product.price;
      }}
      className="flex flex-col gap-2 p-3 bg-white border-2 border-indigo-500 rounded-lg shadow-lg animate-in fade-in zoom-in-95" 
      onKeyDown={event => {
        if (event.key === 'Escape') cancelEdit();
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) saveEdit();
      }}
    >
      <input 
        autoFocus={autoFocus}
        data-placeholder-field={type === 'category' ? 'category-name' : 'product-name'}
        className="w-full bg-white text-slate-900 [color-scheme:light] font-bold text-sm border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
        placeholder={type === 'category' ? "Nome da categoria" : "Nome do produto"}
        value={formData.name || ''}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
      />
      {photoId && (isCategory ? style.showCategoryImages !== false : style.showImages) && (imageSource || photoActive || imageUploading) && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2">
            <div id={anchorId} data-auto-photo-ratio data-product-image-surface={photoId} className="relative shrink-0 rounded-lg bg-slate-100" style={photoDimensions(type, scale, 72, '45%')}>
              {imageSource && <MenuPhoto showLoading={!imageUploading} src={imageSource} alt="" draggable={false} className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
                style={{ objectPosition: `${crop.x}% ${crop.y}%`, transform: `scale(${flips?.horizontal ? -1 : 1}, ${flips?.vertical ? -1 : 1})` }} />}
              <PhotoEditControls id={photoId} type={type} anchorId={anchorId} active={photoActive} activate={() => setPhotoActive(true)}
                hasPhoto={Boolean(imageSource)} choose={() => onImageClick?.()} remove={() => onRemoveImage?.()}
                updateStyle={setStyle} crop={crop} scale={scale} flips={flips} />
              {imageUploading && <PhotoLoading blocking />}
            </div>
            {!isCategory && imageSource && <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Alinhamento da imagem</p>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((alignment) => (
                  <button key={alignment} type="button" onClick={() => {
                    setFormData(previous => ({ ...previous, imageAlignment: alignment }));
                    if (style.productPhotoCrops?.[photoId]) setStyle(prev => ({ ...prev, productPhotoCrops: {
                      ...prev.productPhotoCrops, [photoId]: { ...crop, x: alignment === 'left' ? 0 : alignment === 'right' ? 100 : 50 },
                    } }));
                  }} className={`flex h-8 w-8 items-center justify-center rounded-lg border ${formData.imageAlignment === alignment || (!formData.imageAlignment && alignment === 'center') ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`} aria-label={`Alinhar imagem à ${alignment === 'left' ? 'esquerda' : alignment === 'right' ? 'direita' : 'centro'}`}>
                    {alignment === 'left' ? <AlignLeft size={15} /> : alignment === 'center' ? <AlignCenter size={15} /> : <AlignRight size={15} />}
                  </button>
                ))}
              </div>
            </div>}
          </div>
      )}
      {type === 'product' && (
        <>
          <input 
            className="w-full bg-white text-slate-900 [color-scheme:light] text-xs border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
            placeholder="Descrição"
            data-placeholder-field="product-description"
            value={formData.description || ''}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          />
          <PriceFormatSettings style={style} setStyle={setStyle}>
          <div className="flex items-center gap-2">
            {currencySymbol && <span className="text-xs text-slate-400">{currencySymbol}</span>}
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
                const nextValue = event.currentTarget.value.replace(/[^0-9.,]/g, '');
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
          </PriceFormatSettings>
          {productDividerStyle && onProductDividerStyleChange && (
            <CategoryDividerPicker
              label="Linha do produto"
              value={productDividerStyle}
              color={style.textColor}
              onChange={onProductDividerStyleChange}
            />
          )}
        </>
      )}
      <div className="flex justify-end gap-2 mt-1">
        <button type="button" onClick={cancelEdit} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100"><X size={16} /> Cancelar</button>
        <button type="button" onClick={saveEdit} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"><Check size={16} /> Salvar</button>
      </div>
    </div>
  );
};
