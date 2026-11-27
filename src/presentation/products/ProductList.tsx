import { DisclosureChevron } from '../common/DisclosureChevron';
import { hasPhotosForType, type PhotoType } from '../menu/canvas/photoSizing';
import { categoryName } from '../../domain/menu/categoryName';

import React from 'react';
import { createPortal } from 'react-dom';
import { observeAnchorScroll } from '../menu/canvas/canvasViewport';
import type { CategoryDividerStyle, Product, MenuStyle } from '../../domain/menu/model';
import { 
  CopyCheck, GripVertical, MoreVertical,
  Plus, Edit3, Trash2, Eye, EyeOff, ImagePlus, Loader2, X
} from 'lucide-react';
import { EditForm } from './EditForm';
import { resolveProductDivider } from '../menu/canvas/categoryDividers';
import { isPristineNewCategory, isPristineNewProduct } from '../../domain/menu/pristineItems';
import { formatMenuPrice, resolveMenuPriceDecimalPlaces } from '../../domain/menu/price';

const CATEGORY_DOUBLE_CLICK_MS = 400;

function ProductOptionsMenu({ anchor, floating, children }: {
  anchor: HTMLButtonElement | null;
  floating: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!floating || !anchor) return;
    const menu = ref.current;
    if (!menu) return;
    const viewport = window.visualViewport;
    const update = () => {
      const target = anchor.getBoundingClientRect();
      const top = (viewport?.offsetTop ?? 0) + 8;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8;
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const right = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 8;
      const above = target.top - top - 4;
      const below = bottom - target.bottom - 4;
      const opensAbove = below < menu.scrollHeight && above > below;
      const height = Math.max(0, opensAbove ? above : below);
      menu.style.maxHeight = `${height}px`;
      menu.style.left = `${Math.max(left, Math.min(target.right, right) - menu.offsetWidth)}px`;
      menu.style.top = `${opensAbove ? target.top - 4 - menu.offsetHeight : target.bottom + 4}px`;
      menu.style.visibility = 'visible';
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    const stopScroll = observeAnchorScroll(anchor, update);
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      stopScroll();
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [anchor, floating]);

  const menu = <div ref={ref} data-product-designer-options-menu="true"
    style={floating ? { visibility: 'hidden' } : undefined}
    className={`flex w-44 flex-col rounded-lg border border-slate-100 bg-white py-1 shadow-xl ${floating
      ? 'fixed z-[150] overflow-y-auto overscroll-contain'
      : 'absolute right-0 top-8 z-[140] animate-in fade-in zoom-in-95'}`}
    onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    {children}
  </div>;
  return floating ? createPortal(menu, document.body) : menu;
}

interface PendingImageUpload {
  id: string;
  previewUrl: string;
}

const ImageThumbnail: React.FC<{
  src?: string;
  fit: 'contain' | 'cover';
  uploading?: boolean;
  iconSize?: number;
}> = ({ src, fit, uploading = false, iconSize = 16 }) => {
  const [loadedSource, setLoadedSource] = React.useState<string | null>(null);
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const isLoading = Boolean(src && loadedSource !== src && failedSource !== src);
  const hasFailed = Boolean(src && failedSource === src);

  React.useEffect(() => {
    if (!src || loadedSource === src || failedSource === src) return;
    const timeoutId = window.setTimeout(() => setFailedSource(src), 12000);
    return () => window.clearTimeout(timeoutId);
  }, [failedSource, loadedSource, src]);

  return (
    <>
      {src && !hasFailed && (
        <img
          src={src}
          className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          onLoad={() => { setLoadedSource(src); setFailedSource(null); }}
          onError={() => setFailedSource(src)}
        />
      )}
      {!src || hasFailed ? (
        <div className={`absolute inset-0 flex items-center justify-center ${hasFailed ? 'text-red-400' : 'text-slate-300'}`} title={hasFailed ? 'Não foi possível carregar a imagem' : undefined}>
          <ImagePlus size={iconSize} />
        </div>
      ) : null}
      {(uploading || isLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-indigo-600">
          <Loader2 size={Math.max(13, iconSize)} className="animate-spin" />
        </div>
      )}
    </>
  );
};

interface ProductListProps {
  categories: string[];
  grouped: Record<string, Product[]>;
  products: Product[];
  style: MenuStyle;
  setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
  handlers: any; // Return type from useMenuInteractions
  collapsedCategories: Set<string>;
  toggleCollapse: (cat: string) => void;
  editModeId: string | null;
  savedEditIds: ReadonlySet<string>;
  editTogether?: boolean;
  isProductDesigner?: boolean;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  formData: Partial<Product>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  newItemDraft: { categoryId: string, type: 'product' | 'category'; position?: 'first' | 'last' | { after: string } } | null;
  existingEdits: Record<string, Partial<Product>>;
  pendingDivider?: CategoryDividerStyle;
  updateExistingEdit: (id: string, update: React.SetStateAction<Partial<Product>>) => void;
  updateProductDivider: (id: string, preset: CategoryDividerStyle) => void;
  
  // Actions
  startEdit: (id: string) => void;
  saveEdit: (id?: string) => void;
  cancelEdit: (id: string) => void;
  remove: (id: string, type: 'product' | 'category') => void;
  handleToggleVisibility: (id: string, visible: boolean) => void;
  initiateAdd: (categoryId: string, type: 'product' | 'category', position?: 'first' | 'last' | { after: string }) => void;
  onCategoryImageClick: (category: string) => void;
  onRemoveCategoryImage: (category: string) => void;
  onProductImageClick: (id: string) => void;
  onRemoveProductImage: (id: string) => void;
  productImageUpload: PendingImageUpload | null;
  categoryImageUpload: PendingImageUpload | null;
}

export const ProductList: React.FC<ProductListProps> = ({
  categories,
  grouped,
  products,
  style,
  setStyle,
  handlers,
  collapsedCategories,
  toggleCollapse,
  editModeId, savedEditIds,
  editTogether = false,
  isProductDesigner = false,
  menuOpenId,
  setMenuOpenId,
  formData,
  setFormData,
  newItemDraft,
  existingEdits,
  pendingDivider,
  updateExistingEdit,
  updateProductDivider,
  startEdit,
  saveEdit,
  cancelEdit,
  remove,
  handleToggleVisibility,
  initiateAdd,
  onCategoryImageClick,
  onRemoveCategoryImage,
  onProductImageClick,
  onRemoveProductImage,
  productImageUpload,
  categoryImageUpload,
}) => {
  const optionsTrigger = React.useRef<HTMLButtonElement | null>(null);
  const previousCategoryClick = React.useRef<{ area: HTMLElement; time: number } | null>(null);
  const [shakingCategory, setShakingCategory] = React.useState<string | null>(null);
  const categoryOptionsPointerDownRef = React.useRef<{ category: string; startedAt: number } | null>(null);
  const draggingCategory = handlers.draggedItem?.type === 'category';
  const editAllItems = editTogether && Boolean(editModeId && !newItemDraft);
  const priceDecimalPlaces = React.useMemo(() => {
    const effectivePrices = products.map(product => ({ ...product, ...existingEdits[product.id] }));
    return resolveMenuPriceDecimalPlaces(style, newItemDraft?.type === 'product'
      ? [...effectivePrices, { price: formData.price ?? 0, priceEnteredWithDecimals: formData.priceEnteredWithDecimals }]
      : effectivePrices);
  }, [style.priceDecimalPlaces, products, existingEdits, newItemDraft, formData.price, formData.priceEnteredWithDecimals]);
  const priceFormat = { ...style, priceDecimalPlaces };

  React.useEffect(() => {
    const handleLimitReached = (e: Event) => {
      const customEvent = e as CustomEvent<{ category: string }>;
      setShakingCategory(customEvent.detail.category);
      setTimeout(() => setShakingCategory(null), 800);
    };
    window.addEventListener('menu-category-limit-reached', handleLimitReached);
    return () => window.removeEventListener('menu-category-limit-reached', handleLimitReached);
  }, []);

  React.useEffect(() => {
    if (!isProductDesigner) return;
    const clearOutsideCategoryClick = (event: MouseEvent) => {
      const previous = previousCategoryClick.current;
      const target = event.target;
      if (previous && (!(target instanceof Element) || !previous.area.contains(target) || target.closest('button'))) {
        previousCategoryClick.current = null;
      }
    };
    document.addEventListener('click', clearOutsideCategoryClick, true);
    return () => document.removeEventListener('click', clearOutsideCategoryClick, true);
  }, [isProductDesigner]);

  const imageOptions = (id: string, type: PhotoType, hasPhoto: boolean) => {
    const key = type === 'category' ? 'showCategoryImages' : 'showImages';
    const enabled = style[key] !== false;
    const groupHasPhoto = hasPhotosForType(type, style, Object.values(grouped).flat());
    return <>
      {(!hasPhoto || enabled) && <button onPointerDown={e => e.stopPropagation()} onClick={() => {
        setMenuOpenId(null);
        (type === 'category' ? onCategoryImageClick : onProductImageClick)(id);
      }} className="flex items-center gap-2 px-4 py-2 text-left text-xs hover:bg-slate-50"><ImagePlus size={14} />{hasPhoto ? 'Substituir imagem' : 'Adicionar imagem'}</button>}
      {groupHasPhoto && <button onPointerDown={e => e.stopPropagation()} onClick={() => {
        setMenuOpenId(null);
        setStyle(prev => ({ ...prev, [key]: !enabled, name: 'Custom' }));
      }} className="flex items-center gap-2 px-4 py-2 text-left text-xs hover:bg-slate-50"><Eye size={14} />{enabled ? 'Desabilitar imagens' : 'Habilitar imagens'}</button>}
    </>;
  };

  const renderProductDraft = () => {
    const form = <EditForm type="product" style={style} priceFormat={priceFormat} setStyle={setStyle}
      formData={formData} setFormData={setFormData} saveEdit={() => saveEdit()} cancelEdit={() => cancelEdit('DRAFT')} autoFocus />;
    return isProductDesigner ? <div data-new-product-draft>{form}</div> : form;
  };
  const multiSelectAction = <button type="button" aria-pressed={Boolean(handlers.multiSelectMode)}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      handlers.setMultiSelectMode(!handlers.multiSelectMode);
      setMenuOpenId(null);
    }} className="flex items-center gap-2 px-4 py-2 text-left text-xs hover:bg-slate-50"><CopyCheck size={14} /> Seleção múltipla</button>;

  return (
    <div
      className={`w-full min-w-0 overflow-x-hidden ${handlers.multiSelectMode ? 'select-none' : ''}`}
      data-drag-scope={handlers.dragScope}
      data-drag-column-container="category"
      data-drag-page-index={0}
      data-drag-column-index={0}
      onMouseDown={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey || handlers.multiSelectMode) {
          e.preventDefault();
        }
      }}
    >
      {categories.map((cat, catIndex) => {
        const isCollapsed = collapsedCategories.has(cat);
        const isEditing = !savedEditIds.has(cat) && (editAllItems || editModeId === cat);
        const isSelected = handlers.isSelected?.('category', cat) ?? handlers.selectedId === cat;
        const isBeingDragged = handlers.draggedItem?.type === 'category' && handlers.draggedItem?.id === cat;
        
        // Determine if category is fully hidden (all products hidden)
        const productsInCat = grouped[cat] || [];
        const hiddenCount = productsInCat.filter(p => style.hiddenProductIds?.includes(p.id)).length;
        // Logic check: if category has products and all are hidden, it is effectively hidden.
        const isCatHidden = productsInCat.length > 0 && hiddenCount === productsInCat.length;
        const isPristineCategory = isPristineNewCategory(cat, Object.values(grouped).flat());
        const hasOpenMenuInCategory = menuOpenId === cat || productsInCat.some(product => product.id === menuOpenId);

        // Hide generated free text categories from this manager to reduce clutter
        if(cat.startsWith('ft_')) return null;

        return (
          <div 
            key={cat}
            id={cat}
            className={`relative min-w-0 ${isProductDesigner ? 'mb-2 last:mb-0' : 'mb-4 transition-all'} ${hasOpenMenuInCategory ? 'z-[120]' : 'z-0'} ${isCatHidden ? 'grayscale' : ''}`}
          >
            {/* Category Header */}
            <div data-product-designer-category-header={isProductDesigner ? cat : undefined}
              className={`flex items-center gap-2 group min-w-0 ${isProductDesigner ? '' : 'mb-2'}`}>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleCollapse(cat); }}
                className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                onPointerDown={e => e.stopPropagation()}
              >
                <DisclosureChevron open={!isCollapsed} size={16} />
              </button>
              
              <div className="flex-1 relative min-w-0">
                {isEditing ? (
                  <EditForm 
                    type="category" 
                    style={style}
                    priceFormat={priceFormat}
                    setStyle={setStyle}
                    photoId={cat}
                    imageSource={categoryImageUpload?.id === cat ? categoryImageUpload.previewUrl : style.categoryImages?.[cat]?.url}
                    imageUploading={categoryImageUpload?.id === cat}
                    onImageClick={() => onCategoryImageClick(cat)}
                    onRemoveImage={() => onRemoveCategoryImage(cat)}
                    autoFocus={editModeId === cat}
                    formData={{ name: categoryName(cat), ...existingEdits[cat] }}
                    setFormData={update => updateExistingEdit(cat, update)}
                    saveEdit={() => saveEdit(cat)}
                    cancelEdit={() => cancelEdit(cat)}
                  />
                ) : (
                  <div
                    data-drag-scope={handlers.dragScope}
                    data-drag-type="category"
                    data-drag-id={cat}
                    data-drag-context="product-designer"
                    data-drag-page-index={0}
                    data-drag-column-index={0}
                    data-drag-flow-index={catIndex}
                    data-category-id={cat}
                    onPointerDown={(e) => handlers.handleDragStart(e, 'category', cat)}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`automenu-drag-item select-none ${(style.categoryColumnCount || 1) === 2 ? 'touch-none md:touch-pan-y' : 'touch-pan-y'} cursor-grab flex items-center justify-between p-2 bg-slate-100 border rounded-lg transition-all active:cursor-grabbing ${isCatHidden ? 'bg-slate-200 text-slate-400' : ''} ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 group-hover:border-indigo-300'} ${isBeingDragged ? 'opacity-40' : ''}`}
                    onClick={event => {
                      event.stopPropagation();
                      if (isProductDesigner && event.detail > 0 && event.target instanceof Element && !event.target.closest('button')) {
                        const previous = previousCategoryClick.current;
                        if (previous?.area === event.currentTarget && event.timeStamp - previous.time <= CATEGORY_DOUBLE_CLICK_MS) {
                          previousCategoryClick.current = null;
                          toggleCollapse(cat);
                          return;
                        }
                        previousCategoryClick.current = { area: event.currentTarget, time: event.timeStamp };
                      }
                      handlers.handleSelection('category', cat, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey || handlers.multiSelectMode });
                    }}
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-700 text-sm min-w-0">
                      <GripVertical size={14} className="text-slate-400" />
                      <div className="group/category-image relative h-8 w-8 shrink-0">
                        <button
                          type="button"
                          className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-slate-300 hover:border-indigo-300 hover:text-indigo-500"
                          onClick={(e) => { e.stopPropagation(); onCategoryImageClick(cat); }}
                          onPointerDown={(e) => e.stopPropagation()}
                          title={style.categoryImages?.[cat]?.url ? 'Trocar imagem da categoria' : 'Adicionar imagem à categoria'}
                        >
                          <ImageThumbnail
                            src={categoryImageUpload?.id === cat ? categoryImageUpload.previewUrl : style.categoryImages?.[cat]?.url}
                            fit="contain"
                            uploading={categoryImageUpload?.id === cat}
                            iconSize={15}
                          />
                        </button>
                        {isSelected && style.categoryImages?.[cat]?.url && (
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
                            onClick={(e) => { e.stopPropagation(); onRemoveCategoryImage(cat); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            title="Remover imagem da categoria"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                      <span className="truncate">{categoryName(cat)}</span>
                    </div>
                    <div className="relative">
                      <button
                        aria-label="Mais ações"
                        data-product-options-trigger="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          const press = categoryOptionsPointerDownRef.current;
                          categoryOptionsPointerDownRef.current = null;
                          const suppressUntil = Number(document.body.dataset.automenuSuppressProductOptionsUntil || 0);
                          const wasLongTouch = press?.category === cat && Date.now() - press.startedAt >= 300;
                          if (wasLongTouch || Date.now() < suppressUntil) return;
                          optionsTrigger.current = e.currentTarget;
                          setMenuOpenId(menuOpenId === cat ? null : cat);
                        }}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          categoryOptionsPointerDownRef.current = e.pointerType === 'touch'
                            ? { category: cat, startedAt: Date.now() }
                            : null;
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === cat && (
                        <>
                          <ProductOptionsMenu anchor={optionsTrigger.current} floating={isProductDesigner}>
                            <button data-product-designer-edit-trigger onPointerDown={(e) => e.stopPropagation()} onClick={() => startEdit(cat)} className="px-4 py-2 text-xs text-left hover:bg-slate-50 flex items-center gap-2"> <Edit3 size={14}/> Editar </button>
                            {multiSelectAction}
                            {imageOptions(cat, 'category', Boolean(style.categoryImages?.[cat]?.url))}
                            {!isPristineCategory && (
                              <button 
                                  onPointerDown={(e) => e.stopPropagation()} 
                                  onClick={() => handleToggleVisibility(cat, isCatHidden)} 
                                  className="px-4 py-2 text-xs text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                              > 
                                  {isCatHidden ? <Eye size={14}/> : <EyeOff size={14}/>} {isCatHidden ? 'Mostrar' : 'Ocultar'} 
                              </button>
                            )}
                            <button 
                              onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation();
                                remove(cat, 'category'); 
                              }} 
                              className="px-4 py-2 text-xs text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                            > 
                              <Trash2 size={14}/> Remover
                            </button>
                          </ProductOptionsMenu>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {!isEditing && (isProductDesigner || !draggingCategory) && <ListActions
                addLabel="Adicionar categoria abaixo" editLabel="Editar categoria"
                compact={isProductDesigner} invisible={draggingCategory}
                add={() => initiateAdd(cat, 'category')} edit={() => startEdit(cat)} />}
            </div>

            <div data-designer-category-products hidden={draggingCategory || (isProductDesigner && isCollapsed)}
              className={`pl-8 border-l-2 border-slate-100 ml-3 ${isProductDesigner ? 'mt-1 space-y-1.5' : 'space-y-2'} ${!isProductDesigner && isCollapsed ? 'max-h-0 overflow-hidden opacity-0' : ''}`}
              inert={isCollapsed || draggingCategory || undefined}>
              {!isProductDesigner && <div className="flex justify-end pr-1">
                <ListAction label="Adicionar produto no início" add busy={shakingCategory === cat}
                  onClick={() => initiateAdd(cat, 'product', 'first')} />
              </div>}
              {newItemDraft?.type === 'product' && newItemDraft.categoryId === cat && newItemDraft.position === 'first' && renderProductDraft()}
              {(grouped[cat] || []).filter(product => !product.isFreeText).map(product => {
                const pIsHidden = style.hiddenProductIds?.includes(product.id);
                const productSelectionType = 'product';
                const pIsSelected = handlers.isSelected?.(productSelectionType, product.id) ?? handlers.selectedId === product.id;
                const isBeingDragged = handlers.draggedItem?.id === product.id;
                const isPristineProduct = isPristineNewProduct(product);
                
                return (
                  <React.Fragment key={product.id}>
                  <div
                    key={product.id} 
                    id={`product-container-${product.id}`}
                    className={`relative flex items-start gap-2 select-none ${menuOpenId === product.id ? 'z-[130]' : 'z-0'}`}
                  >
                    <div className="min-w-0 flex-1">
                    {!savedEditIds.has(product.id) && (editAllItems || editModeId === product.id) ? (
                      <EditForm 
                        type="product" 
                        style={style}
                        priceFormat={priceFormat}
                        setStyle={setStyle}
                        autoFocus={editModeId === product.id}
                        formData={{ ...product, ...existingEdits[product.id] }}
                        setFormData={update => updateExistingEdit(product.id, update)}
                        saveEdit={() => saveEdit(product.id)}
                        cancelEdit={() => cancelEdit(product.id)}
                        imageSource={productImageUpload?.id === product.id ? productImageUpload.previewUrl : existingEdits[product.id]?.image ?? product.image}
                        imageUploading={productImageUpload?.id === product.id}
                        onImageClick={() => onProductImageClick(product.id)}
                        onRemoveImage={() => onRemoveProductImage(product.id)}
                        productDividerStyle={pendingDivider ?? resolveProductDivider(style, product.id)}
                        onProductDividerStyleChange={preset => updateProductDivider(product.id, preset)}
                      />
                    ) : (
                      <div 
                        data-drag-scope={handlers.dragScope}
                        data-drag-type="product"
                        data-drag-id={product.id}
                        data-drag-group={cat}
                        data-drag-context="product-designer"
                        data-category-id={cat}
                        onPointerDown={(e) => handlers.handleDragStart(e, 'product', product.id, cat)}
                        onDragStart={(e) => e.preventDefault()}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`automenu-drag-item touch-pan-y cursor-grab group flex items-start gap-3 p-2 bg-white border rounded-lg hover:shadow-sm transition-all relative ${pIsHidden ? 'bg-slate-50' : ''} ${pIsSelected ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/20' : 'border-slate-200'} ${isBeingDragged ? 'opacity-30' : ''}`}
                      >
                        {/* Image Thumbnail */}
                        <div 
                          className={`w-10 h-10 bg-slate-100 rounded flex-shrink-0 overflow-hidden cursor-pointer relative group/img ${pIsHidden ? 'grayscale opacity-60' : ''}`}
                          onClick={() => onProductImageClick(product.id)}
                          onPointerDown={e => e.stopPropagation()}
                        >
                          <ImageThumbnail
                            src={productImageUpload?.id === product.id ? productImageUpload.previewUrl : product.image}
                            fit="cover"
                            uploading={productImageUpload?.id === product.id}
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <Edit3 size={12} />
                          </div>
                        </div>
                        {pIsSelected && product.image && (
                          <button 
                            onClick={(event) => { event.stopPropagation(); onRemoveProductImage(product.id); }}
                            onPointerDown={(event) => event.stopPropagation()}
                            className="absolute top-1 left-1 bg-red-500 text-white rounded-full p-0.5"
                            style={{ width: 14, height: 14 }}
                            title="Remover imagem"
                          >
                            <X size={10} />
                          </button>
                        )}

                        <div 
                          className={`flex-1 min-w-0 cursor-grab active:cursor-grabbing ${pIsHidden ? 'opacity-60' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handlers.handleSelection(productSelectionType, product.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey || handlers.multiSelectMode }); }}
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="text-sm font-medium text-slate-800 truncate">{product.name}</h4>
                            {style.showPrices !== false && (
                              <span className="text-xs font-mono font-bold text-slate-600">
                                {formatMenuPrice(product.price, priceFormat)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{product.description}</p>
                        </div>

                        {/* Options Menu */}
                        <div className="relative">
                          <button aria-label="Mais ações"
                            onClick={(e) => { e.stopPropagation(); optionsTrigger.current = e.currentTarget; setMenuOpenId(menuOpenId === product.id ? null : product.id); }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                            onPointerDown={e => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </button>
                          {menuOpenId === product.id && (
                            <>
                              <ProductOptionsMenu anchor={optionsTrigger.current} floating={isProductDesigner}>
                                <button data-product-designer-edit-trigger onPointerDown={(e) => e.stopPropagation()} onClick={() => startEdit(product.id)} className="px-4 py-2 text-xs text-left hover:bg-slate-50 flex items-center gap-2"> <Edit3 size={14}/> Editar </button>
                                {multiSelectAction}
                                {imageOptions(product.id, 'product', Boolean(product.image))}
                                {!isPristineProduct && (
                                  <button 
                                      onPointerDown={(e) => e.stopPropagation()} 
                                      onClick={() => handleToggleVisibility(product.id, pIsHidden)} 
                                      className="px-4 py-2 text-xs text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                                  > 
                                      {pIsHidden ? <Eye size={14}/> : <EyeOff size={14}/>} {pIsHidden ? 'Mostrar' : 'Ocultar'} 
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { 
                                    e.preventDefault();
                                    e.stopPropagation(); 
                                    remove(product.id, 'product'); 
                                  }} 
                                  className="px-4 py-2 text-xs text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                                > 
                                  <Trash2 size={14}/> Remover
                                </button>
                              </ProductOptionsMenu>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                    {(savedEditIds.has(product.id) || (!editAllItems && editModeId !== product.id)) && <ListActions
                      addLabel="Adicionar produto abaixo" editLabel="Editar produto" busy={shakingCategory === cat} compact={isProductDesigner} small={isProductDesigner}
                      add={() => initiateAdd(cat, 'product', { after: product.id })} edit={() => startEdit(product.id)} />}
                  </div>
                  {newItemDraft?.type === 'product' && newItemDraft.categoryId === cat
                    && typeof newItemDraft.position === 'object' && newItemDraft.position.after === product.id && renderProductDraft()}
                  </React.Fragment>
                )
              })}
              {newItemDraft?.type === 'product' && newItemDraft.categoryId === cat
                && (!newItemDraft.position || newItemDraft.position === 'last') && renderProductDraft()}
            </div>
            
            {/* Render Category Draft Form OUTSIDE wrapper for correct position */}
            {newItemDraft?.type === 'category' && newItemDraft.categoryId === cat && (
              <div className="mb-4 ml-4 pl-4 border-l-2 border-indigo-200">
                <EditForm 
                  type="category" 
                  style={style}
                  priceFormat={priceFormat}
                  setStyle={setStyle}
                  formData={formData} 
                  setFormData={setFormData} 
                  saveEdit={() => saveEdit()}
                  cancelEdit={() => cancelEdit('DRAFT')}
                  autoFocus
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

function ListAction({ label, add, busy, compact, small, onClick }: {
  label: string; add?: boolean; busy?: boolean; compact?: boolean; small?: boolean; onClick: () => void;
}) {
  const icon = add ? <Plus size={small ? 12 : compact ? 14 : 16} /> : <Edit3 size={small ? 12 : compact ? 13 : 15} />;
  const surface = add
    ? busy ? 'animate-shake border-red-500 bg-red-600 text-white' : 'border-indigo-600 bg-indigo-600 text-white group-hover/list-action:bg-indigo-700'
    : 'border-slate-200 bg-white text-slate-600 group-hover/list-action:bg-slate-50';
  return <button type="button" title={label} aria-label={label} data-product-designer-edit-trigger
    className={`group/list-action grid shrink-0 place-items-center rounded-full ${compact ? 'size-7' : 'size-8'}`}
    onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onClick(); }}>
    <span aria-hidden="true" className={`pointer-events-none grid place-items-center rounded-full border shadow-sm ${small ? 'size-[22px]' : 'size-full'} ${surface}`}>
      {icon}
    </span>
  </button>;
}

function ListActions({ addLabel, editLabel, add, edit, busy, compact, small, invisible }: {
  addLabel: string; editLabel: string; add: () => void; edit: () => void; busy?: boolean; compact?: boolean; small?: boolean; invisible?: boolean;
}) {
  return <div className={`flex shrink-0 flex-col ${compact ? 'gap-0.5' : 'gap-1'} ${invisible ? 'invisible' : ''}`}>
    <ListAction label={addLabel} add busy={busy} compact={compact} small={small} onClick={add} />
    <ListAction label={editLabel} compact={compact} small={small} onClick={edit} />
  </div>;
}
