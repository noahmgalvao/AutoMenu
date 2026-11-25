import type { FormattingKind, FormattingScope } from '../../../domain/menu/itemFormatting';
import { getMenuColumnLimit, getProductColumnCount } from '../../../domain/menu/categoryColumns';
import type { MenuColumnCount } from '../../../domain/menu/model';
import { canApplyCanvasColumnCounts, triggerLimitFeedback } from '../canvas/textFit';
import { canMoveImageLayer } from '../../../domain/menu/imageLayers';
import { MINI_FOOD_INK } from '../../../domain/menu/miniFoods';
import { HoldStepButton } from '../../common/HoldStepButton';
import { ColorPicker } from './ColorPicker';
import { DecorationControls } from './Decorations';
import { ShapeChoices, ShapePicker, ShapeSettings } from './ShapePicker';
import { canvasShapeUrl, applyCanvasShapeParameters, setCanvasImageBackground } from '../../../domain/menu/canvasShapes';
import type { CanvasShape } from '../../../domain/menu/model';

import React, { useRef } from 'react';
import type { MenuStyle, Product, ElementStyle, SortOption, AddedImage } from '../../../domain/menu/model';
import { isMiniFoodTexture, normalizeTextureUrl } from '../../../domain/menu/defaults';
import { resolveFontSizeLimits, resolveProductImageFrame, clampPhotoScale, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE } from '../../../domain/menu/styleRules';
import { normalizeMenuPageSetup, resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { StyleControls } from './StyleControls';
import { PriceFormatSettings } from './PriceFormatSettings';
import { updateCanvasPageSetup } from './updateCanvasPageSetup';
import { DesignerOptionSelect, FontSelect, MiniFoodTextureSelect, TextureSelect } from './SearchableSelects';
import { resolveCategoryDivider, resolveProductDivider } from '../canvas/categoryDividers';
import { setItemDivider } from '../../../domain/menu/itemFormatting';
import { CategoryDividerPicker } from './CategoryDividerPicker';
import { getProductCardRadius, PRODUCT_CARD_SHAPES, PRODUCT_IMAGE_FRAMES } from '../canvas/templateStyles';
import { 
  Type, ImagePlus, Loader2, Minus, Plus, ChevronDown,
  Layout, List, Maximize, Palette, CircleHelp, ArrowUpAZ, SortAsc, SortDesc, BringToFront, SendToBack,
  Wallpaper, ImageIcon, Eye, EyeOff, FileCog, RectangleHorizontal, RectangleVertical
} from 'lucide-react';

// --- ELEMENTS SECTION ---
interface ElementsSectionProps {
  selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
  formattingScope: { value: FormattingScope; group?: number; change: (scope: FormattingScope) => void } | null;
  itemStyle: (kind: FormattingKind) => MenuStyle;
  setSidebarFormatting: (kind: FormattingKind, update: React.SetStateAction<MenuStyle>) => void;
  selectedFreeText: Product | null;
  selectedAddedImage: AddedImage | null;
  shapePickerRequest: { id: string } | null;
  onChangeShape: (id: string) => void;
  onAddShape: (shape: CanvasShape) => void;
  selectedAddedImageIds: string[];
  safeStyles: MenuStyle['elementStyles'];
  fontSizeLimits: ReturnType<typeof resolveFontSizeLimits>;
  minimumFontSize: number;
  fontFamily: string;
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  updateFreeTextStyle: (id: string, newStyle: ElementStyle) => void | boolean;
  updateGlobalElementStyle: (elementType: keyof MenuStyle['elementStyles'], newStyle: ElementStyle) => void | boolean;
  setPreviewAction: React.Dispatch<React.SetStateAction<{ type: string, id: number } | undefined>>;
  onMovePhotoToBackground: (id: string) => void;
  onAddedImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isAddingImage: boolean;
  setSelection: (selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }) => void;
  resizeSelectedAddedImages: (delta: number) => boolean;
  removeSelectedAddedImages: () => void;
  layerSelectedAddedImages: (direction: 'front' | 'back') => void;
}

export const ElementsSection: React.FC<ElementsSectionProps> = ({
  selection,
  selectedFreeText,
  selectedAddedImage,
  selectedAddedImageIds,
  safeStyles,
  formattingScope, itemStyle, setSidebarFormatting,
  fontSizeLimits,
  minimumFontSize,
  fontFamily,
  style,
  setStyle,
  updateFreeTextStyle,
  updateGlobalElementStyle,
  setPreviewAction,
  onMovePhotoToBackground,
  onAddedImageUpload,
  isAddingImage,
  onAddShape, shapePickerRequest, onChangeShape,
  setSelection,
  resizeSelectedAddedImages,
  removeSelectedAddedImages,
  layerSelectedAddedImages
}) => {
  const imageSizeValue = React.useRef<HTMLSpanElement>(null);
  const stepLayerSize = (delta: number) => {
    const resized = resizeSelectedAddedImages(delta);
    if (!resized) triggerLimitFeedback(imageSizeValue.current);
    return resized;
  };
  const imageInputRef = useRef<HTMLInputElement>(null);
  const layerIds = new Set(selectedAddedImageIds.includes(selectedAddedImage?.id || '')
    ? selectedAddedImageIds : selectedAddedImage ? [selectedAddedImage.id] : []);
  const shapeEditor = selectedAddedImage?.shape ? selectedAddedImage
    : [...(style.addedImages || [])].reverse().find(image => layerIds.has(image.id) && image.shape);
  const selectedImageCount = selectedAddedImageIds.includes(selectedAddedImage?.id || '') && selectedAddedImageIds.length > 1
    ? selectedAddedImageIds.length
    : 1;
  const editingLabel =
    selection.type === 'menuTitle' ? 'título' :
    selection.type === 'menuSubtitle' ? 'subtítulo' :
    selection.type === 'freeText' ? 'Texto livre' :
    selection.type === 'category' ? 'Categorias' :
    selection.type === 'addedImage' ? (selectedAddedImage?.shape ? 'Forma' : 'Imagem') :
    selection.type === 'page' ? 'Página' :
    'Produtos';

  const categoryStyle = itemStyle('category');
  const productStyle = itemStyle('product');
  const groupLabel = `${editingLabel} - ${formattingScope?.group}`;
  const scopeLabel = formattingScope?.value === 'selection' ? 'Seleção' : formattingScope?.value === 'group' ? groupLabel : editingLabel;

  return (
    <section className="space-y-3">
        <div className="flex justify-between items-center">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Type size={14} /> Elementos
        </h3>
        {formattingScope ? (
            <label className="relative flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold text-indigo-700 focus-within:ring-2 focus-within:ring-indigo-500">
                <span aria-hidden="true">Editando: {scopeLabel}</span>
                <ChevronDown size={12} aria-hidden="true" />
                <select aria-label={`Editando: ${scopeLabel}`} className="absolute inset-0 size-full cursor-pointer opacity-0"
                    value={formattingScope.value} onChange={event => formattingScope.change(event.target.value as FormattingScope)}>
                    {formattingScope.group && <option value="group">{groupLabel}</option>}
                    <option value="all">{selection.type === 'category' ? 'Todas as categorias' : 'Todos os produtos'}</option>
                    <option value="selection">Somente seleção</option>
                </select>
            </label>
        ) : selection.type && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Editando: {editingLabel}</span>
        )}
        </div>

        {/* DYNAMIC EDIT CONTROLS */}
        {selection.type === 'menuTitle' ? (
            <div className="animate-fade-in border-l-2 border-indigo-500 pl-2">
                <StyleControls
                    label="Estilo do título"
                    value={safeStyles.menuTitle || {}}
                    onChange={(s) => updateGlobalElementStyle('menuTitle', s)}
                    maxFontSize={fontSizeLimits.menuTitle}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                />
            </div>
        ) : selection.type === 'menuSubtitle' ? (
            <div className="animate-fade-in border-l-2 border-indigo-500 pl-2">
                <StyleControls
                    label="Estilo do subtítulo"
                    value={safeStyles.menuSubtitle || {}}
                    onChange={(s) => updateGlobalElementStyle('menuSubtitle', s)}
                    maxFontSize={fontSizeLimits.menuSubtitle}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                />
            </div>
        ) : selection.type === 'freeText' && selectedFreeText ? (
            <div className="animate-fade-in border-l-2 border-indigo-500 pl-2">
                <p className="text-xs text-indigo-600 font-medium mb-2">Ajuste local apenas deste item</p>
                <StyleControls 
                label="Estilo do texto livre"
                value={selectedFreeText.styles || {}}
                onChange={(newStyle) => updateFreeTextStyle(selectedFreeText.id, newStyle)}
                maxFontSize={fontSizeLimits.freeText}
                minFontSize={minimumFontSize}
                fallbackFontFamily={fontFamily}
                />
            </div>
        ) : selection.type === 'addedImage' && selectedAddedImage ? (
        <div className="animate-fade-in border-l-2 border-indigo-500 pl-2">
                <button type="button" aria-pressed={Boolean(selectedAddedImage.repeatAsBackground)}
                    className="mb-2 w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs font-semibold text-indigo-700"
                    onClick={() => setStyle(previous => ({
                        ...previous,
                        name: 'Custom',
                        addedImages: previous.addedImages?.map(image => layerIds.has(image.id)
                            ? setCanvasImageBackground(image, !selectedAddedImage.repeatAsBackground) : image),
                    }))}>
                    {selectedAddedImage.repeatAsBackground ? 'Usar só nesta página' : 'Integrar ao plano de fundo'}
                </button>
                {!selectedAddedImage.shape && <button type="button"
                    onClick={() => onMovePhotoToBackground(selectedAddedImage.id)}
                    className="mb-2 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <Wallpaper size={15} /> Definir imagem de fundo
                </button>}
                {shapeEditor?.shape && shapePickerRequest?.id === shapeEditor.id && <div data-change-shape-picker className="mb-2">
                    <ShapeChoices selected={shapeEditor.shape.kind} choose={kind => setStyle(previous => ({
                        ...previous, name: 'Custom', addedImages: previous.addedImages?.map(image => {
                            if (!image.shape || !layerIds.has(image.id)) return image;
                            const shape = { ...image.shape, kind };
                            return { ...image, shape, url: canvasShapeUrl(shape) };
                        }),
                    }))} />
                </div>}
                {shapeEditor?.shape && <ShapeSettings shape={shapeEditor.shape} onChangeShape={() => onChangeShape(shapeEditor.id)}
                    onChange={patch => setStyle(previous => ({
                        ...previous, name: 'Custom',
                        addedImages: previous.addedImages?.map(image => layerIds.has(image.id)
                            ? applyCanvasShapeParameters(image, patch) : image),
                    }))}
                    onEditEnd={() => window.dispatchEvent(new CustomEvent('automenu:image-edit-end', { detail: shapeEditor.id }))}
                />}
                {selectedImageCount > 1 && <p className="my-2 text-xs text-slate-500">{selectedImageCount} elementos selecionados.</p>}
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                    <span className="text-xs font-bold">Tamanho</span>
                    <div className="flex items-center gap-2">
                        <HoldStepButton label="Diminuir tamanho" onStep={() => stepLayerSize(-20)}
                            className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100">
                            <Minus size={14} />
                        </HoldStepButton>
                        <span ref={imageSizeValue} className="text-xs w-12 text-center">{Math.round(selectedAddedImage.width)}px</span>
                        <HoldStepButton label="Aumentar tamanho" onStep={() => stepLayerSize(20)}
                            className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100">
                            <Plus size={14} />
                        </HoldStepButton>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                        disabled={!canMoveImageLayer(style.addedImages || [], [...layerIds], 'back')}
                        onClick={() => layerSelectedAddedImages('back')}
                        className="py-2 text-xs bg-white text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <SendToBack size={14} /> Enviar para trás
                    </button>
                    <button
                        disabled={!canMoveImageLayer(style.addedImages || [], [...layerIds], 'front')}
                        onClick={() => layerSelectedAddedImages('front')}
                        className="py-2 text-xs bg-white text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <BringToFront size={14} /> Trazer à frente
                    </button>
                </div>
                <button
                onClick={() => {
                    removeSelectedAddedImages();
                    setSelection({ type: null, id: null });
                }}
                className="w-full mt-2 py-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
                >
                    {selectedAddedImage.shape ? 'Remover forma' : 'Remover imagem'}
                </button>
        </div>
        ) : (
            <div className="space-y-4 animate-fade-in">
                {(selection.type === 'category' || !selection.type) && safeStyles.category && (
                <>
                    <StyleControls 
                        label="Títulos das categorias"
                        value={categoryStyle.elementStyles.category || safeStyles.category}
                        onChange={(s) => updateGlobalElementStyle('category', s)}
                        maxFontSize={fontSizeLimits.category}
                        minFontSize={minimumFontSize}
                        fallbackFontFamily={fontFamily}
                    />
                    <DecorationControls
                        style={categoryStyle}
                        setStyle={update => setSidebarFormatting('category', update)}
                        scope="category"
                        sidebar
                        targetElementId={selection.id ? `text-${selection.id}` : undefined}
                        divider={selection.id ? {
                            label: 'Linha da categoria',
                            picker: <CategoryDividerPicker
                                inlineOptions
                                value={resolveCategoryDivider(categoryStyle, selection.id)}
                                color={style.primaryColor}
                                onChange={preset => setSidebarFormatting('category', previous => setItemDivider(previous, 'category', selection.id!, preset))}
                            />,
                        } : undefined}
                    />
                </>
                )}
                
                {(selection.type === 'product' || !selection.type) && (
                    <>
                    {safeStyles.productName && <StyleControls 
                        label="Nomes dos produtos"
                        value={productStyle.elementStyles.productName || safeStyles.productName}
                        onChange={(s) => updateGlobalElementStyle('productName', s)}
                    maxFontSize={fontSizeLimits.productName}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                    />}
                    {safeStyles.productPrice && <StyleControls 
                        label="Preços dos produtos"
                        header={<PriceFormatSettings style={style} setStyle={setStyle}>
                            <span className="text-xs font-bold uppercase text-slate-500">Preços dos produtos</span>
                        </PriceFormatSettings>}
                        value={productStyle.elementStyles.productPrice || safeStyles.productPrice}
                        onChange={(s) => updateGlobalElementStyle('productPrice', s)}
                    maxFontSize={fontSizeLimits.productPrice}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                    />}
                    {safeStyles.productDescription && <StyleControls 
                        label="Descrições dos produtos"
                        value={productStyle.elementStyles.productDescription || safeStyles.productDescription}
                        onChange={(s) => updateGlobalElementStyle('productDescription', s)}
                    maxFontSize={fontSizeLimits.productDescription}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                    />}
                    <DecorationControls
                        style={productStyle}
                        setStyle={update => setSidebarFormatting('product', update)}
                        scope="product"
                        sidebar
                        targetElementId={selection.id ? `product-container-${selection.id}` : undefined}
                        divider={selection.id ? {
                            label: 'Linha do produto',
                            picker: <CategoryDividerPicker
                                inlineOptions
                                label="Linha do produto"
                                value={resolveProductDivider(productStyle, selection.id)}
                                color={style.textColor}
                                onChange={preset => setSidebarFormatting('product', previous => setItemDivider(previous, 'product', selection.id!, preset))}
                            />,
                        } : undefined}
                        borderTargets={selection.id ? [
                            { scope: 'product', label: 'Produto', elementId: `product-container-${selection.id}` },
                            ...(style.showPrices !== false ? [{ scope: 'price' as const, label: 'Preço', elementId: `product-price-${selection.id}` }] : []),
                            ...(style.showImages ? [{ scope: 'productImage' as const, label: 'Foto', elementId: `product-container-${selection.id}` }] : []),
                        ] : undefined}
                    />
                    </>
                )}
            </div>
        )}

        {(selection.type === 'menuTitle' || selection.type === 'menuSubtitle') &&
            <DecorationControls style={style} setStyle={setStyle} scope="header" />}
        {selectedFreeText && <DecorationControls style={style} setStyle={setStyle} scope="freeText" id={selectedFreeText.id} />}

        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
        <button 
            onClick={() => setPreviewAction({ type: 'APPEND_FREE_TEXT', id: Date.now() })}
            className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-2 text-sm font-medium text-slate-700"
        >
            <Type size={18} className="text-indigo-600" />
            <span>Adicionar texto</span>
        </button>
        
        <button 
            onClick={() => imageInputRef.current?.click()}
            disabled={isAddingImage}
            aria-busy={isAddingImage}
            className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-2 text-sm font-medium text-slate-700 disabled:cursor-wait disabled:border-indigo-200 disabled:bg-indigo-50"
        >
            {isAddingImage ? <Loader2 size={18} className="animate-spin text-indigo-600 motion-reduce:animate-none" /> : <ImagePlus size={18} className="text-indigo-600" />}
            <span>{isAddingImage ? 'Adicionando imagem…' : 'Adicionar imagem'}</span>
        </button>
        <ShapePicker color={style.primaryColor} onAdd={onAddShape} />
        <input 
            type="file" 
            ref={imageInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={onAddedImageUpload}
        />
        </div>
    </section>
  );
};

// --- TEMPLATES SECTION ---
// --- PAGE SECTION ---
interface PageSectionProps {
  style: MenuStyle;
  products: Product[];
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
}

const PAGE_PRESET_OPTIONS = [
  { value: 'A4', label: 'A4' },
  { value: 'A5', label: 'A5' },
  { value: 'A3', label: 'A3' },
  { value: 'Letter', label: 'Carta' },
  { value: 'screen', label: 'Painel 16:9' },
  { value: 'Square', label: 'Quadrado' },
  { value: 'custom', label: 'Personalizado' },
] as const;

export const PageSection: React.FC<PageSectionProps> = ({ style, setStyle, products }) => {
  const setup = normalizeMenuPageSetup(style.pageSetup);
  const dimensions = resolveMenuPageDimensions(setup);

  const updatePageSetup = (nextSetup: typeof setup) => updateCanvasPageSetup(setStyle, nextSetup, products);

  const updateCustomDimension = (axis: 'width' | 'height', value: number) => {
    if (!Number.isFinite(value)) return;

    const nextValue = Math.min(1000, Math.max(50, value));
    const isLandscape = setup.orientation === 'landscape';
    const field = axis === 'width'
      ? (isLandscape ? 'heightMm' : 'widthMm')
      : (isLandscape ? 'widthMm' : 'heightMm');

    updatePageSetup({ ...setup, preset: 'custom', [field]: nextValue });
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <FileCog size={14} /> Página
      </h3>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500">Tamanho</span>
          <DesignerOptionSelect label="Tamanho da página" value={setup.preset} options={PAGE_PRESET_OPTIONS}
            onChange={preset => updatePageSetup({
              ...setup,
              preset,
              orientation: preset === 'screen' ? 'landscape' : setup.orientation,
            })} />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500">Orientação</span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'portrait', label: 'Retrato', icon: RectangleVertical },
              { value: 'landscape', label: 'Paisagem', icon: RectangleHorizontal },
            ] as const).map(({ value, label, icon: Icon }) => {
              const selected = setup.orientation === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updatePageSetup({ ...setup, orientation: value })}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors ${selected ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                  aria-pressed={selected}
                >
                  <Icon size={15} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        {setup.preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            {([
              { axis: 'width', label: 'Largura', value: dimensions.widthMm },
              { axis: 'height', label: 'Altura', value: dimensions.heightMm },
            ] as const).map(({ axis, label, value }) => (
              <label key={axis} className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
                <div className="relative">
                  <input
                    key={`${axis}-${value}`}
                    type="number"
                    min={50}
                    max={1000}
                    step={0.1}
                    defaultValue={Number(value.toFixed(1))}
                    onBlur={(event) => updateCustomDimension(axis, Number(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    aria-label={`${label} da página em milímetros`}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">mm</span>
                </div>
              </label>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-500">
          Canvas: {Number(dimensions.widthMm.toFixed(1))} × {Number(dimensions.heightMm.toFixed(1))} mm
        </p>
      </div>
    </section>
  );
};

// --- LAYOUT SECTION ---
interface LayoutSectionProps {
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  selectedCategory?: string;
  products: Product[];
}

const columnCounts: MenuColumnCount[] = [1, 2, 3, 4, 5];

export const LayoutSection: React.FC<LayoutSectionProps> = ({ style, setStyle, selectedCategory, products }) => {
  const [limits, setLimits] = React.useState<{ products: number[]; categories: number[] }>({ products: [], categories: [] });
  const [help, setHelp] = React.useState<'products' | 'categories'>();
  const helpId = React.useId();
  const categoryCount = style.categoryColumnCount || 1;
  const productCount = getProductColumnCount(style, selectedCategory);
  const choices = columnCounts.slice(0, getMenuColumnLimit(style));
  React.useLayoutEffect(() => {
    const root = document.querySelector('[data-automenu-editor-canvas="true"]');
    if (!root) return;
    let frame = 0;
    let cancelled = false;
    const measure = () => {
      const counts = columnCounts.slice(0, getMenuColumnLimit(style));
      const blocked = {
        products: counts.filter(count => !canApplyCanvasColumnCounts(style, categoryCount, count, selectedCategory)),
        categories: counts.filter(count => count > categoryCount && !canApplyCanvasColumnCounts(style, count)),
      };
      setLimits(previous => previous.products.join() === blocked.products.join() && previous.categories.join() === blocked.categories.join()
        ? previous : blocked);
    };
    const schedule = () => {
      if (cancelled) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['data-word-fit-size', 'data-word-fit-base-size', 'data-word-fit-minimum'] });
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(schedule);
    measure();
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.fonts?.removeEventListener('loadingdone', schedule);
    };
  }, [style, products, productCount, categoryCount, selectedCategory]);

  const scaleValues = React.useRef<Partial<Record<'imageScale' | 'categoryImageScale', HTMLSpanElement | null>>>({});
  const updateImageScale = (field: 'imageScale' | 'categoryImageScale', delta: number) => {
    const current = style[field] || 1;
    const next = clampPhotoScale(Math.round((current + delta) * 1000) / 1000);
    if (next === MIN_PHOTO_SCALE || next === MAX_PHOTO_SCALE) triggerLimitFeedback(scaleValues.current[field]);
    if (next === current) return false;
    setStyle(previous => ({ ...previous, [field]: next, name: 'Custom' }));
    return next > MIN_PHOTO_SCALE && next < MAX_PHOTO_SCALE;
  };

  const updateColumnCounts = (type: 'products' | 'categories', count: MenuColumnCount) => {
    if (type === 'products') {
      if (!canApplyCanvasColumnCounts(style, categoryCount, count, selectedCategory)) return;
      setStyle(previous => {
        const overrides = { ...previous.categoryProductColumnCounts, ...(selectedCategory ? { [selectedCategory]: count } : {}) };
        if (selectedCategory && count === previous.columnCount) delete overrides[selectedCategory];
        return {
          ...previous,
          columnCount: selectedCategory ? previous.columnCount : count,
          categoryProductColumnCounts: selectedCategory ? overrides : undefined,
          pageBreaks: [],
          name: 'Custom',
        };
      });
      return;
    }
    if (count > categoryCount && !canApplyCanvasColumnCounts(style, count)) return;
    if (count === categoryCount) return;
    setStyle(previous => ({
      ...previous,
      categoryColumnCount: count,
      categoryPlacements: {},
      categoryPositions: Object.fromEntries(Object.entries(previous.categoryPositions || {})
        .filter(([, position]) => position.pageX !== undefined)
        .map(([category, position]) => [category, { ...position, columnIndex: Math.min(position.columnIndex, count - 1) }])),
      categoryColumnWidths: [],
      pageBreaks: [],
      name: 'Custom',
    }));
  };

  return (
  <section className="space-y-3">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"> <Layout size={14} /> Layout </h3>
    <div className="flex bg-slate-100 p-1 rounded-lg">
        {['list', 'cards'].map((mode) => (
        <button key={mode} onClick={() => setStyle(prev => ({ ...prev, layoutMode: mode as any, name: 'Custom' }))} className={`flex-1 py-1.5 text-xs font-medium capitalize rounded-md flex items-center justify-center gap-1 transition-all ${(style.layoutMode === mode || (style.layoutMode === 'grid' && mode === 'cards')) ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {mode === 'list' && <List size={14} />}
            {mode === 'cards' && <Maximize size={14} />}
            <span className="hidden sm:inline">{mode === 'list' ? 'Lista' : 'Cartões'}</span>
        </button>
        ))}
    </div>
    {(style.layoutMode === 'cards' || style.layoutMode === 'grid') && (
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <label className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                Formato dos cartões
                <select value={style.productCardShape || 'template'} className="h-8 min-w-0 rounded border border-slate-200 bg-white px-1.5"
                    onChange={(event) => {
                        const productCardShape = event.currentTarget.value as MenuStyle['productCardShape'];
                        setStyle((previous) => ({
                            ...previous, productCardShape, name: 'Custom',
                            borders: previous.borders?.product ? {
                                ...previous.borders,
                                product: { ...previous.borders.product, radius: getProductCardRadius(previous, productCardShape) },
                            } : previous.borders,
                        }));
                    }}>
                    {PRODUCT_CARD_SHAPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </label>
            <DecorationControls style={style} setStyle={setStyle} scope="product" showMarker={false} sidebar />
        </div>
    )}
    
    <div className="flex flex-wrap gap-2">
        {([
          ['products', 'Colunas de produtos', productCount],
          ['categories', 'Colunas de categorias', categoryCount],
        ] as const).map(([type, label, current]) => (
          <div key={type} role="group" aria-label={label} className="min-w-[8rem] flex-1 rounded border border-slate-100 bg-slate-50 p-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-slate-500">
              <span>{label}</span>
              {limits[type].length > 0 && <button type="button" aria-label={`Ajuda sobre ${label.toLowerCase()}`}
                aria-expanded={help === type} aria-describedby={help === type ? helpId : undefined}
                onClick={() => setHelp(value => value === type ? undefined : type)}
                onKeyDown={event => { if (event.key === 'Escape') setHelp(undefined); }}
                className="text-indigo-700"><CircleHelp size={14} /></button>}
            </div>
            {help === type && limits[type].length > 0 && <p role="tooltip" id={helpId} className="mb-1 rounded bg-indigo-50 p-1.5 text-[11px] text-slate-700">
              O número de colunas foi limitado pelas definições de fonte e pelos caracteres do texto do cardápio.
            </p>}
            <div className="flex gap-1">
              {choices.map(count => <button key={count} type="button" aria-pressed={current === count} disabled={limits[type].includes(count)}
                onClick={() => updateColumnCounts(type, count)}
                className={`h-6 flex-1 rounded text-xs font-bold disabled:opacity-40 ${current === count ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
                {count}
              </button>)}
            </div>
          </div>
        ))}
    </div>
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase text-slate-500">
            <ImageIcon size={14} className="text-indigo-500" /> Imagens
        </div>
        {style.showImages && (
            <label className="flex items-center justify-between gap-2 px-1 text-xs font-medium text-slate-600">
                Moldura das fotos dos produtos
                <select value={resolveProductImageFrame(style)} className="h-8 rounded border border-slate-200 bg-white px-1.5"
                    onChange={(event) => {
                        const productImageFrame = event.currentTarget.value as MenuStyle['productImageFrame'];
                        setStyle((previous) => ({ ...previous, productImageFrame, name: 'Custom' }));
                    }}>
                    {PRODUCT_IMAGE_FRAMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </label>
        )}
        {([
          { label: 'Produtos', visible: style.showImages, toggleField: 'showImages' as const, scaleField: 'imageScale' as const, scale: style.imageScale || 1 },
          { label: 'Categorias', visible: style.showCategoryImages !== false, toggleField: 'showCategoryImages' as const, scaleField: 'categoryImageScale' as const, scale: style.categoryImageScale || 1 },
        ]).map((control) => (
          <div key={control.label} className={`rounded-lg border bg-white p-2 transition-opacity ${control.visible ? 'border-slate-200' : 'border-slate-100 opacity-65'}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">{control.label}</span>
              <button
                type="button"
                onClick={() => setStyle((previous) => ({ ...previous, [control.toggleField]: !control.visible, name: 'Custom' }))}
                className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition-colors ${control.visible ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                aria-pressed={control.visible}
                title={`${control.visible ? 'Ocultar' : 'Mostrar'} imagens de ${control.label.toLowerCase()}`}
              >
                {control.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                {control.visible ? 'Visíveis' : 'Ocultas'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase text-slate-400">Tamanho</span>
              <div className="flex items-center gap-2">
                <HoldStepButton onStep={() => updateImageScale(control.scaleField, -0.1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-100" label={`Diminuir imagens de ${control.label.toLowerCase()}`}><Minus size={14} /></HoldStepButton>
                <span ref={node => { scaleValues.current[control.scaleField] = node; }} className="w-10 text-center font-mono text-xs text-slate-600">{Math.round(control.scale * 100)}%</span>
                <HoldStepButton onStep={() => updateImageScale(control.scaleField, 0.1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-100" label={`Aumentar imagens de ${control.label.toLowerCase()}`}><Plus size={14} /></HoldStepButton>
              </div>
            </div>
          </div>
        ))}
    </div>
  </section>
  );
};

// --- STYLE SECTION ---
interface StyleSectionProps {
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
}

export const StyleSection: React.FC<StyleSectionProps> = ({ style, setStyle }) => {
  const selectedTextureUrl = normalizeTextureUrl(style.backgroundImage);
  const isMiniFoodSelected = isMiniFoodTexture(selectedTextureUrl);
  const updatePrimaryColor = (color: string) => {
    setStyle(prev => {
      const titleStyle = prev.elementStyles.menuTitle || {};
      const subtitleStyle = prev.elementStyles.menuSubtitle || {};
      const categoryStyle = prev.elementStyles.category || {};

      return {
        ...prev,
        primaryColor: color,
        elementStyles: {
          ...prev.elementStyles,
          menuTitle: { ...titleStyle, color },
          menuSubtitle: { ...subtitleStyle, color },
          category: { ...categoryStyle, color },
        },
        elementColorOverrides: {
          ...(prev.elementColorOverrides || {}),
          menuTitle: false,
          menuSubtitle: false,
          category: false,
        },
        name: 'Custom',
      };
    });
  };

  const updateTextColor = (color: string) => {
    setStyle(prev => {
      const productNameStyle = prev.elementStyles.productName || {};
      const productDescriptionStyle = prev.elementStyles.productDescription || {};
      const productPriceStyle = prev.elementStyles.productPrice || {};

      return {
        ...prev,
        textColor: color,
        elementStyles: {
          ...prev.elementStyles,
          productName: { ...productNameStyle, color },
          productDescription: { ...productDescriptionStyle, color },
          productPrice: { ...productPriceStyle, color },
        },
        elementColorOverrides: {
          ...(prev.elementColorOverrides || {}),
          productName: false,
          productDescription: false,
          productPrice: false,
        },
        name: 'Custom',
      };
    });
  };

  return (
  <section className="space-y-3">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"> <Palette size={14} /> Cores e fonte </h3>
    <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-slate-400">Fonte principal</label>
        <FontSelect value={style.fontFamily} onChange={(font) => setStyle(prev => ({ ...prev, fontFamily: font, name: 'Custom' }))} />
    </div>
    <div className="flex gap-3 pt-1">
        <div className="space-y-1 flex-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Principal</label>
            <ColorPicker value={style.primaryColor} onChange={updatePrimaryColor} label="Cor de destaque" className="w-full" preview="primary" />
        </div>
        <div className="space-y-1 flex-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Fundo</label>
            <ColorPicker value={style.backgroundColor} onChange={(color) => setStyle(prev => ({ ...prev, backgroundColor: color, name: 'Custom' }))} label="Cor de fundo" className="w-full" preview="background" disabled={Boolean(style.menuBackgroundPhoto)} />
        </div>
        <div className="space-y-1 flex-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Texto</label>
            <ColorPicker value={style.textColor} onChange={updateTextColor} label="Cor do texto" className="w-full" preview="text" />
        </div>
    </div>
        <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-slate-400">Textura de fundo</label>
        <TextureSelect paper={style.backgroundColor} value={style.backgroundImage} onChange={(url) => setStyle(prev => ({ ...prev, backgroundAssetId: null, backgroundImage: url, name: 'Custom' }))} />
        {(style.menuBackgroundPhoto?.url || style.pageBackgrounds?.some(background => background.url)) &&
          <p className="text-xs text-slate-500">Fundos de página e fotos integradas têm prioridade sobre a textura.</p>}
        {isMiniFoodSelected && (
            <div className="space-y-1 pt-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Mini comida</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <MiniFoodTextureSelect value={style.backgroundImage} onChange={url => setStyle(prev => ({ ...prev, backgroundAssetId: null, backgroundImage: url, name: 'Custom' }))} />
                    <ColorPicker value={style.miniFoodTextureColor || MINI_FOOD_INK} label="Cor da textura de mini comidas"
                        onChange={color => setStyle(prev => ({ ...prev, miniFoodTextureColor: color, name: 'Custom' }))} />
                </div>
                <label className="grid gap-1 pt-1 text-xs font-medium text-slate-600">
                    <span>Tamanho dos ícones <output className="float-right tabular-nums">{style.miniFoodTextureScale ?? 100}%</output></span>
                    <input type="range" aria-label="Tamanho dos ícones" min={60} max={160} step={1} value={style.miniFoodTextureScale ?? 100}
                        onChange={event => { const size = Number(event.target.value); setStyle(prev => ({ ...prev, miniFoodTextureScale: size })); }}
                        className="w-full accent-indigo-600" />
                </label>
            </div>
        )}
    </div>
  </section>
  );
};

// --- SORTING SECTION ---
interface SortingSectionProps {
  sortOption: SortOption;
  manualProductOrder?: boolean;
  setSortOption: React.Dispatch<React.SetStateAction<SortOption>>;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
}

export const SortingSection: React.FC<SortingSectionProps> = ({ sortOption, manualProductOrder, setSortOption, setStyle }) => {
  const applySort = (nextSort: SortOption) => {
    setSortOption(nextSort);
    setStyle(prev => ({
      ...prev,
      customProductOrder: {},
      manualProductOrder: undefined,
      name: 'Custom',
    }));
  };

  return (
  <section className="space-y-3">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"> <ArrowUpAZ size={14} /> Ordenação de produtos </h3>
    <div className="flex items-center gap-2">
    <select aria-label="Ordenação de produtos" className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-700"
      value={manualProductOrder ? 'custom' : sortOption.field === 'price' ? 'price' : 'name'}
      onChange={event => applySort({ ...sortOption, field: event.target.value === 'price' ? 'price' : 'name' })}>
        {manualProductOrder && <option value="custom" disabled hidden>Personalizada</option>}
        <option value="name">Nome</option>
        <option value="price">Preço</option>
    </select>
    <button onClick={() => applySort({ ...sortOption, direction: sortOption.direction === 'asc' ? 'desc' : 'asc' })} className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-600 hover:bg-slate-100"> {sortOption.direction === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />} </button>
    </div>
  </section>
  );
};
