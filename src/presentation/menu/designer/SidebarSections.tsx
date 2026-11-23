import { FontSizeInput } from './FontSizeInput';
import { triggerLimitFeedback } from '../canvas/textFit';
import { canMoveImageLayer } from '../../../domain/menu/imageLayers';
import { MINI_FOOD_INK } from '../../../domain/menu/miniFoods';
import { HoldStepButton } from '../../common/HoldStepButton';
import { BooleanSwitch } from '../../common/BooleanSwitch';
import { ColorPicker } from './ColorPicker';
import { DecorationControls } from './Decorations';
import { ShapeChoices, ShapePicker, ShapeSettings } from './ShapePicker';
import { canvasShapeUrl, applyCanvasShapeParameters, setCanvasImageBackground } from '../../../domain/menu/canvasShapes';
import type { CanvasShape } from '../../../domain/menu/model';

import React, { useRef } from 'react';
import type { MenuStyle, Product, ElementStyle, SortOption, AddedImage, FontSizeLimitKey } from '../../../domain/menu/model';
import { isMiniFoodTexture, normalizeTextureUrl } from '../../../domain/menu/defaults';
import { resolveFontSizeLimits, resolveMenuContentSpacing, resolveMenuMargins, resolveMinimumFontSize, MIN_CONFIGURABLE_FONT_SIZE, roundFontSize, resolveProductImageFrame, clampPhotoScale, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE } from '../../../domain/menu/styleRules';
import { normalizeMenuPageSetup, resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { StyleControls } from './StyleControls';
import { PriceFormatSettings } from './PriceFormatSettings';
import { updateCanvasPageSetup } from './updateCanvasPageSetup';
import { DesignerOptionSelect, FontSelect, MiniFoodTextureSelect, TextureSelect } from './SearchableSelects';
import { resolveCategoryDivider, resolveProductDivider } from '../canvas/categoryDividers';
import { CategoryDividerPicker } from './CategoryDividerPicker';
import { getProductCardRadius, PRODUCT_CARD_SHAPES, PRODUCT_IMAGE_FRAMES } from '../canvas/templateStyles';
import { 
  Type, ImagePlus, Loader2, Minus, Plus,
  Layout, List, Maximize, Palette, ArrowUpAZ, SortAsc, SortDesc, BringToFront, SendToBack,
  Wallpaper, ImageIcon, Eye, EyeOff, FileCog, RectangleHorizontal, RectangleVertical
} from 'lucide-react';

// --- ELEMENTS SECTION ---
interface ElementsSectionProps {
  selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
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

  return (
    <section className="space-y-3">
        <div className="flex justify-between items-center">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Type size={14} /> Elementos
        </h3>
        {selection.type && (
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                    Editando: {editingLabel}
                </span>
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
                    className="mb-2 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-indigo-50">
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
                        value={safeStyles.category}
                        onChange={(s) => updateGlobalElementStyle('category', s)}
                        maxFontSize={fontSizeLimits.category}
                        minFontSize={minimumFontSize}
                        fallbackFontFamily={fontFamily}
                    />
                    <DecorationControls
                        style={style}
                        setStyle={setStyle}
                        scope="category"
                        sidebar
                        targetElementId={selection.id ? `text-${selection.id}` : undefined}
                        divider={selection.id ? {
                            label: 'Linha da categoria',
                            picker: <CategoryDividerPicker
                                inlineOptions
                                value={resolveCategoryDivider(style, selection.id)}
                                color={style.primaryColor}
                                onChange={(preset) => setStyle((previous) => ({
                                    ...previous,
                                    categoryDividerStyles: { ...(previous.categoryDividerStyles || {}), [selection.id!]: preset },
                                    name: 'Custom',
                                }))}
                            />,
                        } : undefined}
                    />
                </>
                )}
                
                {(selection.type === 'product' || !selection.type) && (
                    <>
                    {safeStyles.productName && <StyleControls 
                        label="Nomes dos produtos"
                        value={safeStyles.productName}
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
                        value={safeStyles.productPrice}
                        onChange={(s) => updateGlobalElementStyle('productPrice', s)}
                    maxFontSize={fontSizeLimits.productPrice}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                    />}
                    {safeStyles.productDescription && <StyleControls 
                        label="Descrições dos produtos"
                        value={safeStyles.productDescription}
                        onChange={(s) => updateGlobalElementStyle('productDescription', s)}
                    maxFontSize={fontSizeLimits.productDescription}
                    minFontSize={minimumFontSize}
                    fallbackFontFamily={fontFamily}
                    />}
                    <DecorationControls
                        style={style}
                        setStyle={setStyle}
                        scope="product"
                        sidebar
                        targetElementId={selection.id ? `product-container-${selection.id}` : undefined}
                        divider={selection.id ? {
                            label: 'Linha do produto',
                            picker: <CategoryDividerPicker
                                inlineOptions
                                label="Linha do produto"
                                value={resolveProductDivider(style, selection.id)}
                                color={style.textColor}
                                onChange={(preset) => setStyle((previous) => ({
                                    ...previous,
                                    productDividerStyle: preset,
                                    name: 'Custom',
                                }))}
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
}

export const LayoutSection: React.FC<LayoutSectionProps> = ({ style, setStyle }) => {
  const scaleValues = React.useRef<Partial<Record<'imageScale' | 'categoryImageScale', HTMLSpanElement | null>>>({});
  const updateImageScale = (field: 'imageScale' | 'categoryImageScale', delta: number) => {
    const current = style[field] || 1;
    const next = clampPhotoScale(Math.round((current + delta) * 1000) / 1000);
    if (next === MIN_PHOTO_SCALE || next === MAX_PHOTO_SCALE) triggerLimitFeedback(scaleValues.current[field]);
    if (next === current) return false;
    setStyle(previous => ({ ...previous, [field]: next, name: 'Custom' }));
    return next > MIN_PHOTO_SCALE && next < MAX_PHOTO_SCALE;
  };

  const updateColumnCounts = (
    event: React.MouseEvent<HTMLButtonElement>,
    nextCategoryColumnCount: number,
    nextProductColumnCount: number,
  ) => {
    setStyle((previous) => ({
      ...previous,
      columnCount: nextProductColumnCount as 1 | 2 | 3,
      categoryColumnCount: nextCategoryColumnCount as 1 | 2 | 3,
      categoryPlacements: {},
      categoryPositions: nextCategoryColumnCount !== (previous.categoryColumnCount || 1)
        ? Object.fromEntries(Object.entries(previous.categoryPositions || {})
          .filter(([, position]) => position.pageX !== undefined)
          .map(([category, position]) => [category, { ...position, columnIndex: Math.min(position.columnIndex, nextCategoryColumnCount - 1) }]))
        : previous.categoryPositions,
      categoryColumnWidths: nextCategoryColumnCount !== (previous.categoryColumnCount || 1)
        ? []
        : previous.categoryColumnWidths,
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
    
    <div className="flex gap-2">
        <div className="flex-1 bg-slate-50 p-2 rounded border border-slate-100">
            <label className="text-[10px] text-slate-500 font-bold block mb-1">Colunas de produtos</label>
            <div className="flex gap-1">
                {[1, 2, 3].map(cols => ( <button key={cols} onClick={(event) => updateColumnCounts(event, style.categoryColumnCount || 1, cols)} className={`flex-1 h-6 text-xs font-bold rounded ${style.columnCount === cols ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}> {cols} </button> ))}
            </div>
        </div>
        <div className="flex-1 bg-slate-50 p-2 rounded border border-slate-100">
            <label className="text-[10px] text-slate-500 font-bold block mb-1">Colunas de categorias</label>
            <div className="flex gap-1">
                            {[1, 2, 3].map(cols => ( <button key={cols} onClick={(event) => updateColumnCounts(event, cols, style.columnCount || 1)} className={`flex-1 h-6 text-xs font-bold rounded ${(style.categoryColumnCount || 1) === cols ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}> {cols} </button> ))}
            </div>
        </div>
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

// --- GENERAL RULES SECTION ---
interface GeneralRulesSectionProps {
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
}

const RuleNumberInput: React.FC<{
  value: number;
  label: string;
  min?: number;
  max?: number;
  normalizeValue?: (value: number) => number;
  onChange: (value: number) => void;
}> = ({ value, label, min = 0, max = 300, normalizeValue, onChange }) => (
  <div className="grid content-between justify-items-start gap-1 text-xs text-slate-700">
    <span>{label}</span>
    <FontSizeInput label={label} value={value} min={min} max={max} commitOnBlur showStepButtons stepSubject=""
      onChange={next => onChange(normalizeValue ? normalizeValue(next) : next)}
      className="!w-12 bg-white text-center font-semibold tabular-nums text-slate-700"
    />
  </div>
);

export const GeneralRulesSection: React.FC<GeneralRulesSectionProps> = ({ style, setStyle }) => {
  const fontSizeLimits = resolveFontSizeLimits(style);
  const minimumFontSize = resolveMinimumFontSize(style);
  const margins = resolveMenuMargins(style);
  const contentSpacing = resolveMenuContentSpacing(style);
  const fontLimitRows: Array<{ key: FontSizeLimitKey; label: string }> = [
    { key: 'menuTitle', label: 'Título' },
    { key: 'menuSubtitle', label: 'Subtítulo' },
    { key: 'category', label: 'Nome das categorias' },
    { key: 'productName', label: 'Nome dos produtos' },
    { key: 'productPrice', label: 'Preço dos produtos' },
    { key: 'productDescription', label: 'Descrições dos produtos' },
    { key: 'freeText', label: 'Texto livre' },
  ];
  const marginRows: Array<{ key: keyof typeof margins; label: string }> = [
    { key: 'top', label: 'Superior' },
    { key: 'bottom', label: 'Inferior' },
    { key: 'left', label: 'Esquerda' },
    { key: 'right', label: 'Direita' },
    { key: 'columnGap', label: 'Entre colunas' },
  ];
  const spacingRows: Array<{ key: keyof typeof contentSpacing; label: string }> = [
    { key: 'headerToContent', label: 'Cabeçalho → primeira categoria' },
    { key: 'categoryToProduct', label: 'Categoria → produto' },
    { key: 'productNameToDescription', label: 'Produto → descrição' },
    { key: 'betweenProducts', label: 'Entre produtos' },
    { key: 'productNameToPrice', label: 'Nome → preço (horizontal)' },
  ];

  const updateFontLimit = (key: FontSizeLimitKey, value: number) => {
    const normalizedValue = roundFontSize(value);
    setStyle((previous) => {
      const nextElementStyles = { ...previous.elementStyles };
      if (key !== 'freeText') {
        const elementKey = key as keyof MenuStyle['elementStyles'];
        const currentElementStyle = nextElementStyles[elementKey];
        if (currentElementStyle?.fontSize && currentElementStyle.fontSize > normalizedValue) {
          nextElementStyles[elementKey] = { ...currentElementStyle, fontSize: normalizedValue };
        }
      }
      return {
        ...previous,
        fontSizeLimits: { ...resolveFontSizeLimits(previous), [key]: normalizedValue },
        elementStyles: nextElementStyles,
        name: 'Custom',
      };
    });
  };

  return (
    <section className="space-y-3">
      {([
        ['showPrices', 'Mostrar preços no cardápio', true],
        ['splitCategoryAcrossPages', 'Continuar categoria na página seguinte', false],
        ['productsCanChangeCategory', 'Permitir mudar produto de categoria ao arrastar', false],
        ['allowSameWordBreak', 'Permitir quebra de linha na mesma palavra', false,
          'Ex.: permitir “HAMBU” / “RGUER” em duas linhas. Desativado, o texto reduz até o mínimo.'],
      ] as const).map(([key, label, fallback, description]) => (
        <BooleanSwitch key={key} label={label} value={style[key] ?? fallback} description={description}
          className="border-slate-200 bg-slate-50"
          onChange={value => setStyle(previous => ({ ...previous, [key]: value, name: 'Custom' }))} />
      ))}

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Limite de tamanho das fontes</h4>
        <div className="border-b border-slate-200 pb-2">
          <RuleNumberInput
            label="Mínimo geral"
            value={minimumFontSize}
            min={MIN_CONFIGURABLE_FONT_SIZE}
            max={300}
            normalizeValue={roundFontSize}
            onChange={(value) => setStyle((previous) => ({
              ...previous,
              minimumFontSize: value,
              fontSizeLimits: (() => {
                const limits = resolveFontSizeLimits(previous);
                return {
                  menuTitle: Math.max(value, limits.menuTitle),
                  menuSubtitle: Math.max(value, limits.menuSubtitle),
                  category: Math.max(value, limits.category),
                  productName: Math.max(value, limits.productName),
                  productPrice: Math.max(value, limits.productPrice),
                  productDescription: Math.max(value, limits.productDescription),
                  freeText: Math.max(value, limits.freeText),
                };
              })(),
              elementStyles: Object.fromEntries(
                Object.entries(previous.elementStyles).map(([key, elementStyle]) => [
                  key,
                  elementStyle?.fontSize && elementStyle.fontSize < value
                    ? { ...elementStyle, fontSize: value }
                    : elementStyle,
                ]),
              ) as MenuStyle['elementStyles'],
              name: 'Custom',
            }))}
          />
        </div>
        <h4 className="pt-1 text-xs font-bold text-slate-600">Limites máximos</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {fontLimitRows.map(({ key, label }) => (
            <RuleNumberInput key={key} label={label} value={fontSizeLimits[key]} min={minimumFontSize} max={300}
              normalizeValue={roundFontSize} onChange={(value) => updateFontLimit(key, value)} />
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Margens</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {marginRows.map(({ key, label }) => (
            <RuleNumberInput
              key={key}
              label={label}
              value={margins[key]}
              onChange={(value) => setStyle((previous) => ({
                ...previous,
                margins: { ...resolveMenuMargins(previous), [key]: value },
                name: 'Custom',
              }))}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Espaçamentos</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {spacingRows.map(({ key, label }) => (
            <RuleNumberInput
              key={key}
              label={label}
              value={contentSpacing[key]}
              max={200}
              onChange={(value) => setStyle((previous) => ({
                ...previous,
                contentSpacing: { ...resolveMenuContentSpacing(previous), [key]: value },
                name: 'Custom',
              }))}
            />
          ))}
        </div>
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
