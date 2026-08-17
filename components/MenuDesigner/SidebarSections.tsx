
import React, { useRef } from 'react';
import { MenuStyle, Product, ElementStyle, SortOption, AddedImage, FontSizeLimitKey } from '../../types';
import { isMiniFoodTexture, normalizeTextureUrl } from '../../constants';
import { resolveFontSizeLimits, resolveMenuContentSpacing, resolveMenuMargins, resolveMinimumFontSize } from '../../utils/styleRules';
import { canApplyCanvasColumnCounts, triggerLimitFeedback } from '../../utils/textFit';
import { StyleControls } from './StyleControls';
import { FontSelect, MiniFoodTextureSelect, TemplateSelect, TextureSelect } from './SearchableSelects';
import { 
  Type, ImagePlus, Minus, Plus, LayoutTemplate, 
  Layout, List, Maximize, Palette, ArrowUpAZ, SortAsc, SortDesc, BringToFront, SendToBack, SlidersHorizontal
} from 'lucide-react';

// --- ELEMENTS SECTION ---
interface ElementsSectionProps {
  selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
  selectedFreeText: Product | null;
  selectedAddedImage: AddedImage | null;
  selectedAddedImageIds: string[];
  safeStyles: MenuStyle['elementStyles'];
  fontSizeLimits: ReturnType<typeof resolveFontSizeLimits>;
  minimumFontSize: number;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  updateFreeTextStyle: (id: string, newStyle: ElementStyle) => void | boolean;
  updateGlobalElementStyle: (elementType: keyof MenuStyle['elementStyles'], newStyle: ElementStyle) => void | boolean;
  setPreviewAction: React.Dispatch<React.SetStateAction<{ type: string, id: number } | undefined>>;
  onAddedImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setSelection: (selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }) => void;
  resizeSelectedAddedImages: (delta: number) => void;
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
  setStyle,
  updateFreeTextStyle,
  updateGlobalElementStyle,
  setPreviewAction,
  onAddedImageUpload,
  setSelection,
  resizeSelectedAddedImages,
  removeSelectedAddedImages,
  layerSelectedAddedImages
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selectedImageCount = selectedAddedImageIds.includes(selectedAddedImage?.id || '') && selectedAddedImageIds.length > 1
    ? selectedAddedImageIds.length
    : 1;
  const editingLabel =
    selection.type === 'menuTitle' ? 'titulo' :
    selection.type === 'menuSubtitle' ? 'subtítulo' :
    selection.type === 'freeText' ? 'Texto livre' :
    selection.type === 'category' ? 'Categorias' :
    selection.type === 'addedImage' ? 'Imagem' :
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
                    label="Estilo do titulo"
                    value={safeStyles.menuTitle || {}}
                    onChange={(s) => updateGlobalElementStyle('menuTitle', s)}
                    maxFontSize={fontSizeLimits.menuTitle}
                    minFontSize={minimumFontSize}
                />
            </div>
        ) : selection.type === 'menuSubtitle' ? (
            <div className="animate-fade-in border-l-2 border-indigo-500 pl-2">
                <StyleControls
                    label="Estilo do subtitulo"
                    value={safeStyles.menuSubtitle || {}}
                    onChange={(s) => updateGlobalElementStyle('menuSubtitle', s)}
                    maxFontSize={fontSizeLimits.menuSubtitle}
                    minFontSize={minimumFontSize}
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
                />
            </div>
        ) : selection.type === 'addedImage' && selectedAddedImage ? (
        <div className="animate-fade-in border-l-2 border-indigo-500 pl-2">
                <p className="text-xs text-indigo-600 font-medium mb-2">Controles da imagem</p>
                <p className="text-xs text-slate-500 mb-2">{selectedImageCount > 1 ? `${selectedImageCount} imagens selecionadas.` : 'Arraste a imagem na pré-visualização para mover.'}</p>
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                    <span className="text-xs font-bold">Tamanho</span>
                    <div className="flex items-center gap-2">
                        <button 
                        onClick={() => resizeSelectedAddedImages(-20)}
                        className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100"
                        >
                        <Minus size={14} />
                        </button>
                        <span className="text-xs w-12 text-center">{Math.round(selectedAddedImage.width)}px</span>
                        <button 
                        onClick={() => resizeSelectedAddedImages(20)}
                        className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100"
                        >
                        <Plus size={14} />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                        onClick={() => layerSelectedAddedImages('back')}
                        className="py-2 text-xs bg-white text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center gap-1"
                    >
                        <SendToBack size={14} /> Enviar atras
                    </button>
                    <button
                        onClick={() => layerSelectedAddedImages('front')}
                        className="py-2 text-xs bg-white text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center gap-1"
                    >
                        <BringToFront size={14} /> Trazer frente
                    </button>
                </div>
                <button
                onClick={() => {
                    removeSelectedAddedImages();
                    setSelection({ type: null, id: null });
                }}
                className="w-full mt-2 py-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
                >
                    Remover imagem
                </button>
        </div>
        ) : (
            <div className="space-y-4 animate-fade-in">
                {(selection.type === 'category' || !selection.type) && safeStyles.category && (
                <StyleControls 
                    label="Titulos das categorias"
                    value={safeStyles.category}
                    onChange={(s) => updateGlobalElementStyle('category', s)}
                    maxFontSize={fontSizeLimits.category}
                    minFontSize={minimumFontSize}
                />
                )}
                
                {(selection.type === 'product' || !selection.type) && (
                    <>
                    {safeStyles.productName && <StyleControls 
                        label="Nomes dos produtos"
                        value={safeStyles.productName}
                        onChange={(s) => updateGlobalElementStyle('productName', s)}
                    maxFontSize={fontSizeLimits.productName}
                    minFontSize={minimumFontSize}
                    />}
                    {safeStyles.productPrice && <StyleControls 
                        label="Preços dos produtos"
                        value={safeStyles.productPrice}
                        onChange={(s) => updateGlobalElementStyle('productPrice', s)}
                    maxFontSize={fontSizeLimits.productPrice}
                    minFontSize={minimumFontSize}
                    />}
                    {safeStyles.productDescription && <StyleControls 
                        label="Descricoes dos produtos"
                        value={safeStyles.productDescription}
                        onChange={(s) => updateGlobalElementStyle('productDescription', s)}
                    maxFontSize={fontSizeLimits.productDescription}
                    minFontSize={minimumFontSize}
                    />}
                    </>
                )}
            </div>
        )}

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
            className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-2 text-sm font-medium text-slate-700"
        >
            <ImagePlus size={18} className="text-indigo-600" />
            <span>Adicionar imagem</span>
        </button>
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
interface TemplatesSectionProps {
  templates: MenuStyle[];
  currentStyleId: string;
  applyTemplate: (template: MenuStyle) => void;
}

export const TemplatesSection: React.FC<TemplatesSectionProps> = ({ templates, currentStyleId, applyTemplate }) => (
  <section className="space-y-3">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"> <LayoutTemplate size={14} /> Modelos </h3>
    <TemplateSelect templates={templates} currentStyleId={currentStyleId} onChange={applyTemplate} />
  </section>
);

// --- LAYOUT SECTION ---
interface LayoutSectionProps {
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  handleImageResize: (delta: number) => void;
}

export const LayoutSection: React.FC<LayoutSectionProps> = ({ style, setStyle, handleImageResize }) => {
  const updateColumnCounts = (
    event: React.MouseEvent<HTMLButtonElement>,
    nextCategoryColumnCount: number,
    nextProductColumnCount: number,
  ) => {
    if (!canApplyCanvasColumnCounts(style, nextCategoryColumnCount, nextProductColumnCount)) {
      triggerLimitFeedback(event.currentTarget);
      return;
    }
    setStyle((previous) => ({
      ...previous,
      columnCount: nextProductColumnCount as 1 | 2 | 3,
      categoryColumnCount: nextCategoryColumnCount as 1 | 2 | 3,
      categoryPlacements: {},
      categoryPositions: nextCategoryColumnCount !== (previous.categoryColumnCount || 1)
        ? {}
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
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase">Cor dos cartões</span>
            <input
                type="color"
                value={style.cardBackgroundColor || '#ffffff'}
                onChange={(event) => setStyle(prev => ({ ...prev, cardBackgroundColor: event.target.value, name: 'Custom' }))}
                className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-1"
                aria-label="Cor de fundo dos cartões"
            />
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
    <div className="space-y-2">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase">Tamanho das imagens</span>
            <div className="flex items-center gap-2">
                    <button onClick={() => handleImageResize(-0.1)} className="p-1 bg-white rounded border border-slate-200 hover:bg-slate-100"><Minus size={14} /></button>
                    <span className="text-xs font-mono w-10 text-center">{Math.round((style.imageScale || 1) * 100)}%</span>
                    <button onClick={() => handleImageResize(0.1)} className="p-1 bg-white rounded border border-slate-200 hover:bg-slate-100"><Plus size={14} /></button>
            </div>
        </div>
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
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ value, min = 0, max = 300, onChange }) => (
  <input
    type="number"
    min={min}
    max={max}
    value={value}
    onChange={(event) => {
      const parsed = Number(event.target.value);
      if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
    }}
    className="h-8 w-20 rounded border border-slate-200 bg-white px-2 text-right text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
  />
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
    setStyle((previous) => {
      const nextElementStyles = { ...previous.elementStyles };
      if (key !== 'freeText') {
        const elementKey = key as keyof MenuStyle['elementStyles'];
        const currentElementStyle = nextElementStyles[elementKey];
        if (currentElementStyle?.fontSize && currentElementStyle.fontSize > value) {
          nextElementStyles[elementKey] = { ...currentElementStyle, fontSize: value };
        }
      }
      return {
        ...previous,
        fontSizeLimits: { ...resolveFontSizeLimits(previous), [key]: value },
        elementStyles: nextElementStyles,
        name: 'Custom',
      };
    });
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <SlidersHorizontal size={14} /> Regras gerais
      </h3>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Limite de tamanho das fontes</h4>
        <label className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-700">
          <span>Mínimo geral</span>
          <RuleNumberInput
            value={minimumFontSize}
            min={1}
            max={300}
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
        </label>
        {fontLimitRows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>{label}</span>
            <RuleNumberInput value={fontSizeLimits[key]} min={minimumFontSize} max={300} onChange={(value) => updateFontLimit(key, value)} />
          </label>
        ))}
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <span className="min-w-0">
          <span className="block text-xs font-bold text-slate-700">Permitir quebra de linha na mesma palavra</span>
          <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">
            Ex.: permitir “HAMBU” / “RGUER” em duas linhas. Desativado, o texto reduz até o mínimo.
          </span>
        </span>
        <input
          type="checkbox"
          checked={style.allowSameWordBreak === true}
          onChange={(event) => setStyle((previous) => ({
            ...previous,
            allowSameWordBreak: event.target.checked,
            name: 'Custom',
          }))}
          className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
        />
      </label>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Margens</h4>
        {marginRows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>{label}</span>
            <RuleNumberInput
              value={margins[key]}
              max={300}
              onChange={(value) => setStyle((previous) => ({
                ...previous,
                margins: { ...resolveMenuMargins(previous), [key]: value },
                name: 'Custom',
              }))}
            />
          </label>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-bold text-slate-600">Espaçamentos</h4>
        {spacingRows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>{label}</span>
            <RuleNumberInput
              value={contentSpacing[key]}
              max={200}
              onChange={(value) => setStyle((previous) => ({
                ...previous,
                contentSpacing: { ...resolveMenuContentSpacing(previous), [key]: value },
                name: 'Custom',
              }))}
            />
          </label>
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
  const followsPaletteColor = (elementColor: string | undefined, paletteColor: string, overridden?: boolean) => (
    !overridden || !elementColor || elementColor.toLowerCase() === paletteColor.toLowerCase()
  );

  const updatePrimaryColor = (color: string) => {
    setStyle(prev => {
      const titleStyle = prev.elementStyles.menuTitle || {};
      const categoryStyle = prev.elementStyles.category || {};
      const titleUsesPrimary = followsPaletteColor(titleStyle.color, prev.primaryColor, prev.elementColorOverrides?.menuTitle);
      const categoryUsesPrimary = followsPaletteColor(categoryStyle.color, prev.primaryColor, prev.elementColorOverrides?.category);

      return {
        ...prev,
        primaryColor: color,
        elementStyles: {
          ...prev.elementStyles,
          menuTitle: titleUsesPrimary ? { ...titleStyle, color } : titleStyle,
          category: categoryUsesPrimary ? { ...categoryStyle, color } : categoryStyle,
        },
        elementColorOverrides: {
          ...(prev.elementColorOverrides || {}),
          ...(titleUsesPrimary ? { menuTitle: false } : {}),
          ...(categoryUsesPrimary ? { category: false } : {}),
        },
        name: 'Custom',
      };
    });
  };

  const updateTextColor = (color: string) => {
    setStyle(prev => {
      const titleStyle = prev.elementStyles.menuTitle || {};
      const subtitleStyle = prev.elementStyles.menuSubtitle || {};
      const productNameStyle = prev.elementStyles.productName || {};
      const titleUsesText = followsPaletteColor(titleStyle.color, prev.textColor, prev.elementColorOverrides?.menuTitle);
      const subtitleUsesText = followsPaletteColor(subtitleStyle.color, prev.textColor, prev.elementColorOverrides?.menuSubtitle);
      const productNameUsesText = followsPaletteColor(productNameStyle.color, prev.textColor, prev.elementColorOverrides?.productName);

      return {
        ...prev,
        textColor: color,
        elementStyles: {
          ...prev.elementStyles,
          menuTitle: titleUsesText ? { ...titleStyle, color } : titleStyle,
          menuSubtitle: subtitleUsesText ? { ...subtitleStyle, color } : subtitleStyle,
          productName: productNameUsesText ? { ...productNameStyle, color } : productNameStyle,
        },
        elementColorOverrides: {
          ...(prev.elementColorOverrides || {}),
          ...(titleUsesText ? { menuTitle: false } : {}),
          ...(subtitleUsesText ? { menuSubtitle: false } : {}),
          ...(productNameUsesText ? { productName: false } : {}),
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
            <div className="h-8 w-full rounded border border-slate-200 overflow-hidden relative"> <input type="color" value={style.primaryColor} onChange={(e) => updatePrimaryColor(e.target.value)} className="absolute -top-4 -left-4 w-[200%] h-[200%] cursor-pointer" /> </div>
        </div>
        <div className="space-y-1 flex-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Fundo</label>
            <div className="h-8 w-full rounded border border-slate-200 overflow-hidden relative"> <input type="color" value={style.backgroundColor} onChange={(e) => setStyle(prev => ({ ...prev, backgroundColor: e.target.value, name: 'Custom' }))} className="absolute -top-4 -left-4 w-[200%] h-[200%] cursor-pointer" /> </div>
        </div>
        <div className="space-y-1 flex-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Texto</label>
            <div className="h-8 w-full rounded border border-slate-200 overflow-hidden relative"> <input type="color" value={style.textColor} onChange={(e) => updateTextColor(e.target.value)} className="absolute -top-4 -left-4 w-[200%] h-[200%] cursor-pointer" /> </div>
        </div>
    </div>
        <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-slate-400">Textura de fundo</label>
        <TextureSelect value={style.backgroundImage} onChange={(url) => setStyle(prev => ({ ...prev, backgroundImage: url, name: 'Custom' }))} />
        {isMiniFoodSelected && (
            <div className="space-y-1 pt-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Mini comida</label>
                <MiniFoodTextureSelect value={style.backgroundImage} onChange={(url) => setStyle(prev => ({ ...prev, backgroundImage: url, name: 'Custom' }))} />
            </div>
        )}
    </div>
  </section>
  );
};

// --- SORTING SECTION ---
interface SortingSectionProps {
  sortOption: SortOption;
  setSortOption: React.Dispatch<React.SetStateAction<SortOption>>;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
}

export const SortingSection: React.FC<SortingSectionProps> = ({ sortOption, setSortOption, setStyle }) => {
  const applySort = (nextSort: SortOption) => {
    setSortOption(nextSort);
    setStyle(prev => ({
      ...prev,
      customProductOrder: {},
      name: 'Custom',
    }));
  };

  return (
  <section className="space-y-3">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"> <ArrowUpAZ size={14} /> Ordenação de produtos </h3>
    <div className="flex items-center gap-2">
    <select className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-700" value={sortOption.field === 'price' ? 'price' : 'name'} onChange={(e) => applySort({ ...sortOption, field: e.target.value as SortOption['field'] })}>
        <option value="name">Nome</option>
        <option value="price">Preço</option>
    </select>
    <button onClick={() => applySort({ ...sortOption, direction: sortOption.direction === 'asc' ? 'desc' : 'asc' })} className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-600 hover:bg-slate-100"> {sortOption.direction === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />} </button>
    </div>
  </section>
  );
};
