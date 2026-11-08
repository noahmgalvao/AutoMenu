import React from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ImagePlus,
  Italic,
  Loader2,
  Minus,
  Plus,
  Underline,
  X,
} from 'lucide-react';
import type { ElementStyle, MenuStyle, Product } from '../types';
import { formatMenuPriceValue, parseAndRoundPrice, roundPrice } from '../utils/price';
import {
  applyPriceOperations,
  createPricePropagationRequest,
  inferManualPriceOperation,
  type PriceAdjustmentMode,
  type PriceAdjustmentOperation,
  type PricePropagationRequest,
} from '../utils/pricePropagation';
import { FontSelect } from './MenuDesigner/SearchableSelects';
import { FontSizeInput } from './MenuDesigner/FontSizeInput';

type TextFormattingField = 'name' | 'description' | 'price';
type FormattingField = TextFormattingField | 'image';

interface MobileProductEditorModalProps {
  productIds: string[];
  products: Product[];
  style: MenuStyle;
  onClose: () => void;
  onSave: (
    updates: { id: string; field: keyof Product; value: any }[],
    propagation: PricePropagationRequest | null,
  ) => void;
  onStyleChange: (field: TextFormattingField, value: ElementStyle, productId: string) => void | boolean;
  onUploadImage?: (productId: string, file: File) => Promise<{ url: string; assetId: string }>;
}

const FIELD_LABELS: Record<FormattingField, string> = {
  name: 'Nome',
  description: 'Descrição',
  price: 'Preço',
  image: 'Imagem',
};

export const MobileProductEditorModal: React.FC<MobileProductEditorModalProps> = ({
  productIds,
  products,
  style,
  onClose,
  onSave,
  onStyleChange,
  onUploadImage,
}) => {
  const selectedProducts = React.useMemo(() => productIds
    .map((id) => products.find((product) => product.id === id && !product.isFreeText))
    .filter(Boolean) as Product[], [productIds, products]);
  const initialProductsRef = React.useRef(new Map(selectedProducts.map((product) => [product.id, { ...product }])));
  const [drafts, setDrafts] = React.useState<Record<string, Product>>(() => Object.fromEntries(
    selectedProducts.map((product) => [product.id, { ...product }]),
  ));
  const [priceInputs, setPriceInputs] = React.useState<Record<string, string>>(() => Object.fromEntries(
    selectedProducts.map((product) => [product.id, formatMenuPriceValue(product.price, style)]),
  ));
  const [formattingField, setFormattingField] = React.useState<FormattingField>('name');
  const [priceAdjustment, setPriceAdjustment] = React.useState('10');
  const [priceAdjustmentMode, setPriceAdjustmentMode] = React.useState<PriceAdjustmentMode>('percentage');
  const [operations, setOperations] = React.useState<PriceAdjustmentOperation[]>([]);
  const [referenceProductId, setReferenceProductId] = React.useState(productIds[0] || '');
  const [uploadingId, setUploadingId] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const replacePriceOnNextInputRef = React.useRef(new Set<string>());
  const priceAtFocusRef = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    const currentIds = new Set(productIds);
    setDrafts((current) => {
      const next = { ...current };
      products.forEach((product) => {
        if (!currentIds.has(product.id) || !next[product.id]) return;
        next[product.id] = {
          ...next[product.id],
          image: product.image,
          imageAssetId: product.imageAssetId,
        };
      });
      return next;
    });
  }, [productIds, products]);

  const currentStyle = formattingField === 'price'
    ? style.elementStyles.productPrice || {}
    : formattingField === 'description'
      ? style.elementStyles.productDescription || {}
      : style.elementStyles.productName || {};

  const currentImageAlignment = drafts[referenceProductId]?.imageAlignment || 'center';
  const updateSelectedImageAlignment = (imageAlignment: NonNullable<Product['imageAlignment']>) => {
    setDrafts((current) => {
      const next = { ...current };
      productIds.forEach((id) => {
        if (next[id]) next[id] = { ...next[id], imageAlignment };
      });
      return next;
    });
  };

  const updateDraft = (id: string, changes: Partial<Product>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  };

  const appendOperation = (operation: PriceAdjustmentOperation, productId?: string) => {
    setReferenceProductId((current) => current || productId || productIds[0] || '');
    setOperations((current) => [...current, operation]);
  };

  const adjustPrices = (direction: 1 | -1) => {
    const amount = Number(priceAdjustment);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const operation: PriceAdjustmentOperation = {
      mode: priceAdjustmentMode,
      signedAmount: direction * amount,
    };
    const nextDrafts = { ...drafts };
    const nextPriceInputs = { ...priceInputs };
    productIds.forEach((id) => {
      const draft = nextDrafts[id];
      if (!draft) return;
      const price = applyPriceOperations(draft.price, [operation]);
      nextDrafts[id] = { ...draft, price };
      nextPriceInputs[id] = formatMenuPriceValue(price, style);
    });
    setDrafts(nextDrafts);
    setPriceInputs(nextPriceInputs);
    appendOperation(operation, productIds[0]);
  };

  const finishManualPriceEdit = (productId: string, rawValue: string) => {
    const draft = drafts[productId];
    if (!draft) return;
    const normalized = parseAndRoundPrice(rawValue) ?? draft.price;
    const previousPrice = priceAtFocusRef.current.get(productId) ?? draft.price;
    updateDraft(productId, { price: normalized });
    setPriceInputs((current) => ({ ...current, [productId]: formatMenuPriceValue(normalized, style) }));
    priceAtFocusRef.current.delete(productId);
    replacePriceOnNextInputRef.current.delete(productId);
    if (previousPrice !== normalized && (!referenceProductId || referenceProductId === productId || operations.length === 0)) {
      if (operations.length === 0) setReferenceProductId(productId);
      appendOperation(inferManualPriceOperation(previousPrice, normalized), productId);
    }
  };

  const replacePriceInput = (productId: string, value: string) => {
    const sanitized = value.replace(/[^0-9.,]/g, '');
    if (!sanitized) return;
    replacePriceOnNextInputRef.current.delete(productId);
    setPriceInputs((current) => ({ ...current, [productId]: sanitized }));
    const normalized = parseAndRoundPrice(sanitized);
    if (normalized !== null) updateDraft(productId, { price: normalized });
  };

  const uploadImage = async (productId: string, file?: File) => {
    if (!file || !onUploadImage) return;
    setUploadingId(productId);
    setImageError(null);
    try {
      const uploaded = await onUploadImage(productId, file);
      updateDraft(productId, { image: uploaded.url, imageAssetId: uploaded.assetId });
    } catch {
      setImageError('Não foi possível alterar a imagem. Tente novamente.');
    } finally {
      setUploadingId(null);
    }
  };

  const save = () => {
    const updates: { id: string; field: keyof Product; value: any }[] = [];
    productIds.forEach((id) => {
      const initial = initialProductsRef.current.get(id);
      const draft = drafts[id];
      if (!initial || !draft) return;
      if (draft.name !== initial.name) updates.push({ id, field: 'name', value: draft.name });
      if (draft.description !== initial.description) updates.push({ id, field: 'description', value: draft.description });
      if (draft.price !== initial.price) updates.push({ id, field: 'price', value: roundPrice(draft.price) });
      if (draft.image !== initial.image) updates.push({ id, field: 'image', value: draft.image || '' });
      if (draft.imageAssetId !== initial.imageAssetId) updates.push({ id, field: 'imageAssetId', value: draft.imageAssetId || null });
      if (draft.imageAlignment !== initial.imageAlignment) updates.push({ id, field: 'imageAlignment', value: draft.imageAlignment || 'center' });
    });

    const changedReference = drafts[referenceProductId];
    const initialReference = initialProductsRef.current.get(referenceProductId);
    let finalOperations = [...operations];
    if (changedReference && initialReference && changedReference.price !== initialReference.price) {
      const reproducedPrice = applyPriceOperations(initialReference.price, finalOperations);
      if (reproducedPrice !== changedReference.price) {
        finalOperations.push(inferManualPriceOperation(reproducedPrice, changedReference.price));
      }
    }
    const propagation = changedReference && initialReference && finalOperations.length > 0
      ? {
          ...createPricePropagationRequest({
            productId: referenceProductId,
            productIds,
            productName: productIds.length > 1 ? `${productIds.length} produtos selecionados` : changedReference.name,
            previousPrice: initialReference.price,
            nextPrice: changedReference.price,
            operation: finalOperations[0],
          }),
          operations: finalOperations,
        }
      : null;

    onSave(updates, propagation);
  };

  if (selectedProducts.length === 0) return null;
  const canAdjustPrice = Number.isFinite(Number(priceAdjustment)) && Number(priceAdjustment) > 0;

  return createPortal(
    <div className="fixed inset-0 z-[2147483500] flex flex-col bg-slate-100 md:hidden" onPointerDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <h2 className="font-bold text-slate-900">Editar {productIds.length > 1 ? `${productIds.length} produtos` : 'produto'}</h2>
          <p className="text-xs text-slate-500">Altere os dados e a formatação em uma única tela.</p>
        </div>
        <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="Fechar"><X size={19} /></button>
      </header>

      <div className="border-b border-slate-200 bg-white p-3">
        <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1">
          {(Object.keys(FIELD_LABELS) as FormattingField[]).map((field) => (
            <button key={field} type="button" onClick={() => setFormattingField(field)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${formattingField === field ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{FIELD_LABELS[field]}</button>
          ))}
        </div>
        {formattingField === 'image' ? (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">Alinhamento das imagens</span>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button" onClick={() => updateSelectedImageAlignment(align)} className={`rounded-lg border p-1.5 ${currentImageAlignment === align ? 'border-indigo-300 bg-white text-indigo-600 shadow-sm' : 'border-transparent text-slate-500'}`}>{align === 'left' ? <AlignLeft size={16} /> : align === 'center' ? <AlignCenter size={16} /> : <AlignRight size={16} />}</button>)}
            </div>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_2.25rem] gap-1.5">
          <FontSelect value={currentStyle.fontFamily || ''} includeInherit placeholder="Fonte..." onChange={(font) => onStyleChange(formattingField, { ...currentStyle, fontFamily: font || undefined }, referenceProductId || productIds[0])} />
          <FontSizeInput value={currentStyle.fontSize} onChange={(fontSize) => onStyleChange(formattingField, { ...currentStyle, fontSize }, referenceProductId || productIds[0])} className="!w-16" />
          <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-slate-200">
            <input type="color" className="absolute -left-4 -top-4 h-[200%] w-[200%]" value={currentStyle.color || '#000000'} onChange={(event) => onStyleChange(formattingField, { ...currentStyle, color: event.target.value }, referenceProductId || productIds[0])} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1">
          {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button" onClick={() => onStyleChange(formattingField, { ...currentStyle, textAlign: align }, referenceProductId || productIds[0])} className={`rounded-lg border p-1.5 ${currentStyle.textAlign === align ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}>{align === 'left' ? <AlignLeft size={15} /> : align === 'center' ? <AlignCenter size={15} /> : <AlignRight size={15} />}</button>)}
          <button type="button" onClick={() => onStyleChange(formattingField, { ...currentStyle, fontWeight: currentStyle.fontWeight === '700' || currentStyle.fontWeight === 'bold' ? '400' : '700' }, referenceProductId || productIds[0])} className={`rounded-lg border p-1.5 ${currentStyle.fontWeight === '700' || currentStyle.fontWeight === 'bold' ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}><Bold size={15} /></button>
          <button type="button" onClick={() => onStyleChange(formattingField, { ...currentStyle, italic: !currentStyle.italic }, referenceProductId || productIds[0])} className={`rounded-lg border p-1.5 ${currentStyle.italic ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}><Italic size={15} /></button>
          <button type="button" onClick={() => onStyleChange(formattingField, { ...currentStyle, underline: !currentStyle.underline }, referenceProductId || productIds[0])} className={`rounded-lg border p-1.5 ${currentStyle.underline ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}><Underline size={15} /></button>
        </div>
          </>
        )}
        <div className="mt-3 grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_2.5rem] gap-1.5 border-t border-slate-100 pt-3">
          <button type="button" disabled={!canAdjustPrice} onClick={() => adjustPrices(-1)} className="flex h-9 items-center justify-center rounded-lg border border-slate-200 text-red-600 disabled:opacity-40"><Minus size={16} /></button>
          <input type="number" min="0" step={priceAdjustmentMode === 'percentage' ? '0.1' : '1'} value={priceAdjustment} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setPriceAdjustment(event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-center text-sm font-semibold" aria-label="Valor do reajuste" />
          <label className="relative"><select value={priceAdjustmentMode} onChange={(event) => setPriceAdjustmentMode(event.target.value as PriceAdjustmentMode)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-2 pr-5 text-xs"><option value="percentage">%</option><option value="integer">R$</option></select><ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" /></label>
          <button type="button" disabled={!canAdjustPrice} onClick={() => adjustPrices(1)} className="flex h-9 items-center justify-center rounded-lg border border-slate-200 text-emerald-600 disabled:opacity-40"><Plus size={16} /></button>
        </div>
      </div>

      <main className="flex-1 space-y-3 overflow-y-auto p-3 pb-28">
        {selectedProducts.map((product) => {
          const draft = drafts[product.id];
          if (!draft) return null;
          return (
            <section key={product.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex gap-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {draft.image ? <img src={draft.image} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${draft.imageAlignment || 'center'} center` }} /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><ImagePlus size={24} /></div>}
                  {draft.image && <button type="button" onClick={() => updateDraft(product.id, { image: '', imageAssetId: null })} className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-red-600 shadow" aria-label="Remover imagem"><X size={14} /></button>}
                  {uploadingId === product.id && <div className="absolute inset-0 flex items-center justify-center bg-white/75"><Loader2 size={20} className="animate-spin text-indigo-600" /></div>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                  <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600"><ImagePlus size={14} /> Alterar imagem<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void uploadImage(product.id, file); }} /></label>
                  <button type="button" onClick={() => { setReferenceProductId(product.id); setFormattingField('image'); }} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Alinhar imagem</button>
                </div>
              </div>
              <div className="mt-3 space-y-2.5">
                <label className="block"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Nome</span><input value={draft.name} onChange={(event) => updateDraft(product.id, { name: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
                <label className="block"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Descrição</span><textarea value={draft.description} onChange={(event) => updateDraft(product.id, { description: event.target.value })} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="block"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Preço</span><div className="mt-1 flex h-10 items-center rounded-xl border border-slate-200 px-3"><span className="mr-2 text-sm text-slate-400">R$</span><input type="text" inputMode="decimal" value={priceInputs[product.id] || ''} onFocus={(event) => { priceAtFocusRef.current.set(product.id, draft.price); replacePriceOnNextInputRef.current.add(product.id); event.currentTarget.select(); }} onChange={(event) => { const inputEvent = event.nativeEvent as InputEvent; if (replacePriceOnNextInputRef.current.has(product.id) && inputEvent.data) { replacePriceInput(product.id, inputEvent.data); return; } replacePriceOnNextInputRef.current.delete(product.id); const value = event.currentTarget.value; setPriceInputs((current) => ({ ...current, [product.id]: value })); const normalized = parseAndRoundPrice(value); if (normalized !== null) updateDraft(product.id, { price: normalized }); }} onBeforeInput={(event) => { if (!replacePriceOnNextInputRef.current.has(product.id)) return; const inputEvent = event.nativeEvent as InputEvent; if (!inputEvent.inputType?.startsWith('insert') || !inputEvent.data) return; event.preventDefault(); replacePriceInput(product.id, inputEvent.data); }} onBlur={(event) => finishManualPriceEdit(product.id, event.currentTarget.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" /></div></label>
              </div>
            </section>
          );
        })}
        {imageError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{imageError}</p>}
      </main>

      <footer className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-slate-200 font-semibold text-slate-700">Cancelar</button>
        <button type="button" onClick={save} disabled={Boolean(uploadingId)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-50"><Check size={17} /> Salvar</button>
      </footer>
    </div>,
    document.body,
  );
};
