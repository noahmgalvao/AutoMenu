import { getTextOutlineStyle } from './textOutlineStyle';
import { MenuMarkerGlyph } from './MenuMarkerGlyph';
import { getContentLayer, getFreeTextLayer } from '../../../domain/menu/imageLayers';
import { getSurfaceFill } from '../designer/Decorations';
import { categoryName } from '../../../domain/menu/categoryName';
import type { MenuStyle, Product, ElementStyle, FontSizeLimitKey, MenuBorderScope } from '../../../domain/menu/model';
import React from 'react';
import { resolveFontSizeLimits, resolveMinimumFontSize, resolveMenuContentSpacing, clampFontSize, resolveProductImageFrame, usesProductCards } from '../../../domain/menu/styleRules';
import { CategoryDividerPicker } from '../designer/CategoryDividerPicker';
import { resolveCategoryDivider, resolveProductDivider } from './categoryDividers';
import { InlineStyleToolbar } from '../designer/InlineStyleToolbar';
import { DecorationControls, getBorderOverride, BorderDecoration, getMarker } from '../designer/Decorations';
import type { FormattingField } from '../interactions/types';
import type { PriceAdjustmentMode } from '../../../domain/menu/pricePropagation';
import { MenuPhoto, PhotoLoading } from './MenuPhoto';
import { livePhotoScaleVariable, photoDimensions } from './photoSizing';
import { PhotoEditControls } from './PhotoEditControls';
import { getProductCardRadius, getProductPhotoFrameRadius, getProductCardCornerRadii } from './templateStyles';
import { AutoFitText } from './AutoFitText';
import { CanvasTextDivider } from './CanvasTextDivider';
import { isHeadingTextHit } from './menuHeadingHit';
import { getPaginationItemKey, getProductCardImageLimit, getProductListImageLimit, getCategoryPhotoSizing } from '../../../domain/menu/menuPagination';
import { ProductControls, FreeTextResizeHandles, getFreeTextMaximumWidth, getFreeTextContentWidth } from './ProductCanvasControls';
import { FREE_TEXT_PREFIX } from '../../../domain/menu/flow';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { ColumnResizeHandles } from './ColumnResizeHandles';
import { formatMenuPriceValue, getMenuPriceSymbol } from '../../../domain/menu/price';
import { PriceFormatSettings } from '../designer/PriceFormatSettings';

interface MenuItemProps {
    item: any;
    idx: number;
    style: MenuStyle;
    handlers: any; // Return type of useMenuInteractions
    products: Product[];
    inGroup: boolean;
    columnIndex?: number;
    categoryColumnCount?: number;
    backgroundText?: { pageIndex: number; primary: boolean; selected: boolean };
}

const editableTextClassName = 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto';



const focusCanvasFieldAtClick = (event: React.MouseEvent<HTMLElement>) => {
    const field = event.currentTarget;
    if (!field.isContentEditable || field === document.activeElement) return;

    const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const pointerRange = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = position?.offsetNode ?? pointerRange?.startContainer;
    const offset = position?.offset ?? pointerRange?.startOffset ?? 0;
    field.focus({ preventScroll: true });
    if (field.inputMode !== 'decimal' && node && field.contains(node)) {
        window.getSelection()?.collapse(node, offset);
    }
};

const handleEditableFieldClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!event.currentTarget.isContentEditable) return;
    event.stopPropagation();
    focusCanvasFieldAtClick(event);
};

const isMenuHeadingTextHit = (event: React.MouseEvent<HTMLElement>) => isHeadingTextHit(event.currentTarget, event);

const preventHeadingFocusOutsideText = (event: React.PointerEvent<HTMLElement>) => {
    if (isMenuHeadingTextHit(event)) return;
    event.preventDefault();
    const activeHeading = event.currentTarget.ownerDocument.activeElement;
    if (activeHeading instanceof HTMLElement && activeHeading.hasAttribute('data-menu-heading')) activeHeading.blur();
};

export const MenuItem: React.FC<MenuItemProps> = ({
    item,
    idx,
    style,
    handlers,
    products,
    inGroup,
    columnIndex = 0,
    categoryColumnCount: renderedCategoryColumnCount,
    backgroundText,
}) => {
    const formattingTarget = handlers.formattingTarget;
    const canStartEditingAtClick = (event: React.MouseEvent, type: 'product' | 'category' | 'freeText', id: string) =>
        !handlers.readOnly && !handlers.multiSelectMode && !event.shiftKey && !event.ctrlKey && !event.metaKey
        && handlers.isSelected?.(type, id);

    const formattingClick = (event: React.MouseEvent<HTMLElement>, type: 'product' | 'category' | 'freeText', id: string, field: FormattingField) => {
        const elementId = event.currentTarget.id;
        if (!elementId) return;
        if (event.currentTarget.isContentEditable) {
            handleEditableFieldClick(event);
            handlers.setEditingField?.(type, id, field, elementId);
        } else if (canStartEditingAtClick(event, type, id)) {
            handlers.startEditing(event, id, elementId, field);
        }
    };
    const fontSizeLimits = resolveFontSizeLimits(style);
    const minimumFontSize = resolveMinimumFontSize(style);
    const allowSameWordBreak = style.allowSameWordBreak === true;
    const contentSpacing = resolveMenuContentSpacing(style);
    const hasProductFill = Boolean(getSurfaceFill(style, 'product') && getSurfaceFill(style, 'product') !== 'transparent');
    const replacePriceOnNextInputRef = React.useRef<Set<string>>(new Set());
    const [imageMenuProductId, setImageMenuProductId] = React.useState<string | null>(null);
    React.useEffect(() => {
        if (imageMenuProductId && handlers.editingId !== imageMenuProductId) {
            setImageMenuProductId(null);
        }
    }, [handlers.editingId, imageMenuProductId]);
    React.useEffect(() => {
        if (!imageMenuProductId) return;
        const endEditing = () => {
            setImageMenuProductId(null);
            handlers.setEditingId(null);
            handlers.setFormattingTarget(null);
        };
        const closeImageMenuOutside = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest<HTMLElement>('[data-product-image-surface]')?.dataset.productImageSurface === imageMenuProductId) return;
            if (target?.closest('[data-editor-popover="true"], [data-canvas-history-control]')) return;
            if (target?.closest('[data-automenu-editor-canvas]')
                && !target.closest('button, input, textarea, select')) {
                setImageMenuProductId(null);
                return;
            }
            endEditing();
        };
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setImageMenuProductId(null); };
        document.addEventListener('pointerdown', closeImageMenuOutside, true);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeImageMenuOutside, true);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [handlers.setEditingId, handlers.setFormattingTarget, imageMenuProductId]);
    const replacePriceText = (element: HTMLElement, productId: string, text: string) => {
        const nextText = text.replace(/[^0-9.,]/g, '');
        if (!nextText) return;
        element.innerText = nextText;
        replacePriceOnNextInputRef.current.delete(productId);
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    };
    const handlePriceFocus = (event: React.FocusEvent<HTMLElement>, productId: string) => {
        if (!handlers.isReadyToEdit?.('product', productId)) return;
        handlers.setEditingField?.('product', productId, 'price', `product-price-${productId}`);
        replacePriceOnNextInputRef.current.add(productId);
        const field = event.currentTarget;
        window.setTimeout(() => {
            if (document.activeElement !== field || !replacePriceOnNextInputRef.current.has(productId)) return;
            const range = document.createRange();
            range.selectNodeContents(field);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }, 0);
    };
    const handlePriceKeyDown = (event: React.KeyboardEvent<HTMLElement>, productId: string) => {
        const isPlainCharacter = event.key !== 'Unidentified'
            && event.key.length === 1
            && !event.ctrlKey
            && !event.metaKey
            && !event.altKey;
        const isPriceCharacter = isPlainCharacter && /^[0-9.,]$/.test(event.key);
        if (replacePriceOnNextInputRef.current.has(productId) && isPriceCharacter) {
            event.preventDefault();
            replacePriceText(event.currentTarget, productId, event.key);
            return;
        }
        if (isPlainCharacter && !isPriceCharacter) event.preventDefault();
        handlers.handleKeyDown(event);
    };
    const handlePriceBeforeInput = (event: React.FormEvent<HTMLElement>, productId: string) => {
        if (!replacePriceOnNextInputRef.current.has(productId)) return;
        const inputEvent = event.nativeEvent as InputEvent;
        if (!inputEvent.inputType?.startsWith('insert') || !inputEvent.data) return;
        const nextText = inputEvent.data.replace(/[^0-9.,]/g, '');
        if (!nextText) return;
        event.preventDefault();
        replacePriceText(event.currentTarget, productId, nextText);
    };
    const handlePricePaste = (event: React.ClipboardEvent<HTMLElement>, productId: string) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain').replace(/[^0-9.,]/g, '');
        if (!text) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount || !event.currentTarget.contains(selection.anchorNode)) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const inserted = document.createTextNode(text);
        range.insertNode(inserted);
        selection.collapse(inserted, text.length);
        replacePriceOnNextInputRef.current.delete(productId);
    };
    const handleItemClick = (event: React.MouseEvent, type: 'product' | 'category' | 'freeText', id: string) => {
        event.stopPropagation();
        if (handlers.readOnly || handlers.editingId === id) return;
        if (handlers.isReadyToEdit?.(type, id)) {
            handlers.startEditing(event, id, type === 'category' ? `text-${id}` : `product-name-${id}`);
        } else {
            handlers.handleSelection(type, id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey, backgroundPage: backgroundText?.pageIndex });
        }
    };

    const renderFormattingToolbar = (type: 'product' | 'category' | 'freeText' | 'menuTitle' | 'menuSubtitle', id: string, value: ElementStyle) => {
        if (formattingTarget?.type !== type || formattingTarget.id !== id) return null;
        const fontKey: FontSizeLimitKey = type !== 'product' ? type : formattingTarget.field === 'price' ? 'productPrice'
            : formattingTarget.field === 'description' ? 'productDescription' : 'productName';
        const fallbackSize = fontKey === 'menuTitle' ? 48 : fontKey === 'category' ? 24 : fontKey === 'productDescription' ? 14 : 18;
        const scope: MenuBorderScope = type === 'menuTitle' || type === 'menuSubtitle' ? 'header' :
            type === 'category' ? 'category' : type === 'freeText' ? 'freeText' :
            formattingTarget.field === 'price' ? 'price' : 'product';
        const border = scope === 'freeText' ? style.freeTextBorders?.[id] : style.borders?.[scope];
        const dividerLabel = type === 'product' ? 'Linha do produto' : 'Linha da categoria';
        const divider = type === 'category' || type === 'product' ? {
            label: dividerLabel,
            picker: <CategoryDividerPicker compact label={dividerLabel}
                value={type === 'category' ? resolveCategoryDivider(style, id) : resolveProductDivider(style, id)}
                color={type === 'category' ? style.primaryColor : style.textColor}
                onChange={(preset) => handlers.updateStyle?.((previous: MenuStyle) => ({
                    ...previous,
                    ...(type === 'category'
                        ? { categoryDividerStyles: { ...previous.categoryDividerStyles, [id]: preset } }
                        : { productDividerStyle: preset }),
                    name: 'Custom',
                }))}
            />,
        } : undefined;
        return <InlineStyleToolbar
                targetElementId={formattingTarget.elementId}
                positionTargetElementId={type === 'product' ? `product-name-${id}` : undefined}
                value={{ ...value, fontSize: clampFontSize(style, fontKey, value?.fontSize, fallbackSize) }}
                maxFontSize={fontSizeLimits[fontKey]}
                minFontSize={minimumFontSize}
                fallbackFontFamily={style.fontFamily}
                onChange={(newStyle) => handlers.handleInlineStyleChange?.(formattingTarget, newStyle)}
                dismissOnClickInCanvas
                onDismiss={() => {
                    if (handlers.editingId === id) handlers.setEditingId(null);
                    handlers.setFormattingTarget?.(null);
                }}
                borderOffset={border?.offset}
                decoration={handlers.updateStyle ? (formatButtons, onGroupBorderPanelChange) => (
                    <DecorationControls key={scope} style={style} setStyle={handlers.updateStyle} id={id} scope={scope} targetElementId={formattingTarget.elementId} divider={divider}
                        onGroupBorderPanelChange={type === 'category' ? onGroupBorderPanelChange : undefined}>
                        {formatButtons}
                    </DecorationControls>
                ) : undefined}
                onAdjustPrice={type === 'product' && formattingTarget.field === 'price'
                    ? (direction: 1 | -1, amount: number, mode: PriceAdjustmentMode) => handlers.adjustProductPrice?.(id, direction, amount, mode)
                    : undefined}
                priceFormatHeader={type === 'product' && formattingTarget.field === 'price' && handlers.updateStyle
                    ? <PriceFormatSettings style={style} setStyle={handlers.updateStyle}>Alterar valor</PriceFormatSettings>
                    : undefined}
                priceAdjustmentCurrency={getMenuPriceSymbol(style)}
            />;
    };
    const textContrastFill = (key: string): React.CSSProperties | undefined => {
        const backgroundColor = style.textContrastFills?.[key];
        return backgroundColor ? { backgroundColor, opacity: 1 } : undefined;
    };
    const renderProductPrice = (product: Product, isEditable: boolean, badgeClass = '') => {
        if (style.showPrices === false) return null;
        const priceStyle = style.elementStyles?.productPrice || {};
        const baseSize = clampFontSize(style, 'productPrice', priceStyle.fontSize, 18);
        const currency = getMenuPriceSymbol(style);
        return <div data-template-price data-price-base-size={baseSize} data-price-minimum-size={minimumFontSize}
            data-menu-border-surface="price" data-price-alignment={priceStyle.textAlign} data-custom-border={getBorderOverride(style, 'price')}
            className={`relative ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap ${badgeClass}`}
            style={{
                background: getSurfaceFill(style, 'price'), borderRadius: style.borders?.price?.radius,
                ...textContrastFill('productPrice'),
                color: `var(--automenu-preview-text, ${priceStyle.color || style.textColor})`,
                ...getTextOutlineStyle(priceStyle.textOutline),
                fontFamily: priceStyle.fontFamily,
                fontSize: `var(--automenu-fitted-price-size, ${baseSize}px)`,
                fontWeight: priceStyle.fontWeight,
                fontStyle: priceStyle.italic ? 'italic' : 'normal',
                textDecoration: priceStyle.underline ? 'underline' : 'none',
                textTransform: priceStyle.textTransform,
                letterSpacing: priceStyle.letterSpacing ? `${priceStyle.letterSpacing}px` : undefined,
            }}>
            <BorderDecoration style={style} scope="price" />
            {currency && <span data-price-symbol data-border-text className="select-none touch-auto">{currency}</span>}
            <span id={handlers.readOnly ? undefined : `product-price-${product.id}`} data-product-edit-id={product.id}
                data-price-value data-border-text className={`whitespace-nowrap outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                style={{ textAlign: priceStyle.textAlign }}
                contentEditable={isEditable} tabIndex={isEditable ? 0 : undefined} inputMode="decimal"
                enterKeyHint="done" suppressContentEditableWarning
                onBlur={event => {
                    replacePriceOnNextInputRef.current.delete(product.id);
                    handlers.handleBlur(event, 'product', product.id, 'price');
                }}
                onKeyDown={event => handlePriceKeyDown(event, product.id)}
                onBeforeInput={event => handlePriceBeforeInput(event, product.id)}
                onPaste={event => handlePricePaste(event, product.id)}
                onFocus={event => handlePriceFocus(event, product.id)}
                onPointerDown={event => { if (isEditable) event.stopPropagation(); }}
                onClick={event => formattingClick(event, 'product', product.id, 'price')}
            >{formatMenuPriceValue(product.price, style)}</span>
        </div>;
    };
    const activatePhoto = (type: 'product' | 'category', id: string) => {
        handlers.startPhotoEditing?.(type, id);
        setImageMenuProductId(id);
    };

    const handlePhotoClick = (event: React.MouseEvent, type: 'product' | 'category', id: string) => {
        if (!canStartEditingAtClick(event, type, id)) return;
        event.stopPropagation();
        activatePhoto(type, id);
    };

    const photoControls = (type: 'category' | 'product', id: string, hasPhoto: boolean, crop: { x: number; y: number }, flips?: { horizontal?: boolean; vertical?: boolean }) => (
        <PhotoEditControls id={id} anchorId={`${type}-image-${id}`} hasPhoto={hasPhoto} active={imageMenuProductId === id && !formattingTarget}
            scale={(type === 'category' ? style.categoryImageScale : style.imageScale) || 1} crop={crop} flips={flips}
            activate={() => activatePhoto(type, id)}
            choose={() => handlers.choosePhoto(type, id)} remove={() => handlers.removePhoto(type, id)}
            type={type} updateStyle={handlers.updateStyle} />
    );
    const renderProductPhoto = (product: Product, limit: number, maxWidth: string, inRow = false) => {
        const isEditable = !handlers.readOnly && handlers.isReadyToEdit?.('product', product.id);
        const loading = handlers.photoIsLoading?.('product', product.id);
        if (!style.showImages || (!product.image && !loading && !(isEditable && imageMenuProductId === product.id))) return null;
        const crop = style.productPhotoCrops?.[product.id] || { x: product.imageAlignment === 'left' ? 0 : product.imageAlignment === 'right' ? 100 : 50, y: 50 };
        const frame = resolveProductImageFrame(style, inRow);
        const hasFrame = frame !== 'template';
        const shaped = hasFrame && frame !== 'fill';
        const background = inRow && style.design?.image === 'background' && !hasFrame;
        const imageRadius = style.borders?.productImage?.radius;
        const topRadius = Math.min(12, style.borders?.product?.radius ?? getProductCardRadius(style));
        const photoRadius = !shaped && inRow
            ? background
                ? 'inherit'
                : `${topRadius}px ${topRadius}px ${imageRadius ?? 0}px ${imageRadius ?? 0}px`
            : getProductPhotoFrameRadius(frame, imageRadius);
        const flips = style.productImageFlips?.[product.id];
        return (
            <div data-auto-photo-ratio
                id={handlers.readOnly ? undefined : `product-image-${product.id}`}
                data-template-image
                data-menu-border-surface="productImage"
                data-custom-border={getBorderOverride(style, 'productImage')}
                data-product-image-surface={product.id}
                data-product-photo-frame={hasFrame ? frame : undefined}
                className={`relative shrink-0 bg-slate-100 select-none ${isEditable ? 'cursor-pointer ring-2 ring-inset ring-indigo-400' : ''}`}
                style={{
                    ...photoDimensions('product', style.imageScale || 1, limit, maxWidth, frame),
                    margin: inRow && !background ? '0 auto' : undefined,
                    background: getSurfaceFill(style, 'productImage'), borderRadius: photoRadius,
                }}
                onClick={event => handlePhotoClick(event, 'product', product.id)}
                title={isEditable ? 'Opções da imagem' : undefined}
            >
                <span className="absolute inset-0 block overflow-hidden" style={{ borderRadius: 'inherit' }}>
                    {product.image && <MenuPhoto showLoading={!handlers.readOnly && !loading} key={product.image} src={product.image} alt={product.name} draggable={false}
                        className="block h-full w-full"
                        style={{
                            objectFit: !style.productPhotoCrops?.[product.id] && inRow && !hasFrame && !background && style.design?.image !== 'cover' ? 'contain' : 'cover',
                            objectPosition: `${crop.x}% ${crop.y}%`,
                            transform: flips?.horizontal || flips?.vertical
                                ? `scale(${flips.horizontal ? -1 : 1}, ${flips.vertical ? -1 : 1})`
                                : undefined,
                        }}
                        onError={(event) => { event.currentTarget.hidden = true; }} />}
                </span>
                <BorderDecoration style={style} scope="productImage" />
                {loading && <PhotoLoading />}
                {isEditable && photoControls('product', product.id, Boolean(product.image), crop, flips)}
            </div>
        );
    };
    
    if (item.type === 'main-header') {
        const titleStyle = style.elementStyles?.menuTitle || {};
        const subStyle = style.elementStyles?.menuSubtitle || {};
        const hasSubtitle = Boolean(style.menuSubtitle?.trim());
        const showSubtitleDraft = !hasSubtitle && !handlers.readOnly &&
            (formattingTarget?.type === 'menuTitle' || formattingTarget?.type === 'menuSubtitle');
        const showSubtitle = hasSubtitle || showSubtitleDraft;
        const heroImage = style.design?.header === 'hero' && style.showImages && style.design.image !== 'none'
            ? products.find((product) => product.image && !product.isFreeText && !style.hiddenProductIds.includes(product.id))?.image : undefined;
        const isTitleSelected = handlers.isSelected?.('menuTitle', 'menuTitle') ?? handlers.selectedId === 'menuTitle';
        const isSubtitleSelected = handlers.isSelected?.('menuSubtitle', 'menuSubtitle') ?? handlers.selectedId === 'menuSubtitle';
        const subtitlePlaceholderAlignment = style.design?.header === 'split' ? ''
            : subStyle.textAlign === 'left' ? 'empty:mr-auto'
            : subStyle.textAlign === 'right' ? 'empty:ml-auto' : 'empty:mx-auto';
        
        return (
            <header 
                key={`header-${idx}`} 
                data-block-id="main-header"
                data-pagination-item="main-header"
                data-template-header
                data-menu-border-surface="header" data-custom-border={getBorderOverride(style, 'header')}
                className={`text-center group relative pointer-events-auto ${isTitleSelected || isSubtitleSelected ? 'ring-2 ring-indigo-500' : ''}`}
                style={{ marginBottom: 0, zIndex: 20, background: getSurfaceFill(style, 'header'), borderRadius: style.borders?.header?.radius }}
            >
            <BorderDecoration style={style} scope="header" />
            {heroImage && <img src={heroImage} data-template-hero-image alt="" draggable={false} onError={(event) => { event.currentTarget.hidden = true; }} />}
            {formattingTarget?.type === 'menuTitle' && renderFormattingToolbar('menuTitle', 'menuTitle', titleStyle)}
            {formattingTarget?.type === 'menuSubtitle' && renderFormattingToolbar('menuSubtitle', 'menuSubtitle', subStyle)}
            <AutoFitText
                as="h1"
                text={style.menuTitle ?? 'MENU'}
                baseFontSize={clampFontSize(style, 'menuTitle', titleStyle.fontSize, 48)}
                minimumFontSize={minimumFontSize}
                allowSameWordBreak={allowSameWordBreak}
                fitScope="menuTitle"
                widthMode="parent"
                id={handlers.readOnly ? undefined : "menu-title-text"}
                data-menu-heading="title"
                className={`tracking-tight outline-none focus:bg-blue-50/50 rounded cursor-text ${isTitleSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                style={{ 
                    color: `var(--automenu-preview-primary, ${titleStyle.color || style.primaryColor})`,
                    ...textContrastFill('menuTitle'),
                    ...getTextOutlineStyle(titleStyle.textOutline),
                    fontFamily: titleStyle.fontFamily || style.fontFamily,
                    fontSize: `${clampFontSize(style, 'menuTitle', titleStyle.fontSize, 48)}px`,
                    fontWeight: titleStyle.fontWeight || '700',
                    fontStyle: titleStyle.italic ? 'italic' : 'normal',
                    textDecoration: titleStyle.underline ? 'underline' : 'none',
                    textAlign: titleStyle.textAlign as any,
                    textTransform: titleStyle.textTransform,
                    marginBottom: `${showSubtitle ? (titleStyle.marginBottom ?? 10) : contentSpacing.headerToContent}px`
                }} 
                onPointerDown={handlers.readOnly ? undefined : preventHeadingFocusOutsideText}
                onContextMenu={handlers.readOnly ? undefined : (event) => {
                    if (isMenuHeadingTextHit(event)) handlers.openObjectMenu?.(event, { type: 'menuTitle', id: 'menuTitle' });
                }}
                onClick={(e) => {
                    if (!isMenuHeadingTextHit(e)) return;
                    e.stopPropagation();
                    if (handlers.editingId && document.activeElement !== e.currentTarget) {
                        focusCanvasFieldAtClick(e);
                        return;
                    }
                    handlers.handleSelection('menuTitle', 'menuTitle', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                    handlers.setSelectedPageIndex(null);
                }}
                onFocus={() => {
                    handlers.handleSelection('menuTitle', 'menuTitle');
                    handlers.startMenuTextEditing?.('menuTitle', 'menu-title-text');
                }}
                contentEditable={handlers.readOnly ? undefined : true} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'menu', 'header', 'menuTitle')} onKeyDown={handlers.handleKeyDown}
            />
            {showSubtitle && <AutoFitText
                as="p"
                text={hasSubtitle ? style.menuSubtitle : ''}
                data-subtitle-placeholder={showSubtitleDraft ? 'Adicionar subtítulo' : undefined}
                data-print-control={showSubtitleDraft ? 'true' : undefined}
                aria-label={showSubtitleDraft ? 'Adicionar subtítulo' : undefined}
                baseFontSize={clampFontSize(style, 'menuSubtitle', subStyle.fontSize, 18)}
                minimumFontSize={minimumFontSize}
                allowSameWordBreak={allowSameWordBreak}
                fitScope="menuSubtitle"
                widthMode="parent"
                id={handlers.readOnly ? undefined : "menu-subtitle-text"}
                data-menu-heading="subtitle"
                onContextMenu={handlers.readOnly ? undefined : (event) => {
                    if (isMenuHeadingTextHit(event)) handlers.openObjectMenu?.(event, { type: 'menuSubtitle', id: 'menuSubtitle' });
                }}
                className={`opacity-90 outline-none focus:bg-blue-50/50 rounded cursor-text empty:before:pointer-events-none empty:before:opacity-50 empty:before:content-[attr(data-subtitle-placeholder)] ${showSubtitleDraft ? `empty:w-fit ${subtitlePlaceholderAlignment}` : ''} ${isSubtitleSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                style={{
                    color: `var(--automenu-preview-primary, ${subStyle.color || style.textColor})`,
                    ...textContrastFill('menuSubtitle'),
                    ...getTextOutlineStyle(subStyle.textOutline),
                    fontFamily: subStyle.fontFamily || style.fontFamily,
                    fontSize: `${clampFontSize(style, 'menuSubtitle', subStyle.fontSize, 18)}px`,
                    fontWeight: subStyle.fontWeight,
                    fontStyle: subStyle.italic ? 'italic' : 'normal',
                    textDecoration: subStyle.underline ? 'underline' : 'none',
                    textAlign: subStyle.textAlign || (style.design?.header === 'split' ? 'right' : 'center'),
                    textTransform: subStyle.textTransform,
                    letterSpacing: subStyle.letterSpacing ? `${subStyle.letterSpacing}px` : undefined,
                    marginBottom: `${contentSpacing.headerToContent}px`
                }}
                onPointerDown={handlers.readOnly ? undefined : preventHeadingFocusOutsideText}
                onClick={(e) => {
                    if (!isMenuHeadingTextHit(e)) return;
                    e.stopPropagation();
                    if (handlers.editingId && document.activeElement !== e.currentTarget) {
                        focusCanvasFieldAtClick(e);
                        return;
                    }
                    handlers.handleSelection('menuSubtitle', 'menuSubtitle', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                    handlers.setSelectedPageIndex(null);
                }}
                onFocus={() => {
                    handlers.handleSelection('menuSubtitle', 'menuSubtitle');
                    handlers.startMenuTextEditing?.('menuSubtitle', 'menu-subtitle-text');
                }}
                contentEditable={handlers.readOnly ? undefined : true} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'menu', 'subheader', 'menuSubtitle')} onKeyDown={handlers.handleKeyDown}
            />
            }
            </header>
        );
    }

    if (item.type === 'category-header') {
        const isSelected = handlers.isSelected?.('category', item.data) ?? handlers.selectedId === item.data;
        const catStyle = style.elementStyles?.category || {};
        const isEditable = !handlers.readOnly && handlers.isReadyToEdit?.('category', item.data);
        const elementId = `text-${item.data}`;
        const isBeingDragged = handlers.isCanvasObjectDragging?.('category', item.data);
        const compactControls = (style.categoryColumnCount || 1) > 1;
        const categoryAlign = catStyle.textAlign || 'left';
        const categoryImage = style.categoryImages?.[item.data];
        const categoryImageScale = style.categoryImageScale || 1;
        const { limit: photoLimit, widthFraction, titleReserve } = getCategoryPhotoSizing(style);
        const categoryDividerPreset = resolveCategoryDivider(style, item.data);
        const renderCategoryDivider = (key: 'before' | 'after') => (
            <CanvasTextDivider preset={categoryDividerPreset} color="var(--template-accent)" titleEdge={key === 'before' ? 'right' : 'left'} />
        );
        
        return (
            <div 
                key={`cat-header-${item.data}`}
                id={handlers.readOnly ? undefined : `category-header-${item.data}`}
                data-canvas-layer={getContentLayer(style)}
                data-category-id={item.data} 
                data-pagination-item={getPaginationItemKey(item)}
                onPointerDown={(e) => handlers.handleDragStart(e, 'category', item.data)}
                onDragStart={(e) => e.preventDefault()}
                className={`automenu-drag-item relative group transition-all duration-200 select-none touch-auto cursor-grab pointer-events-auto ${isSelected || isEditable ? 'z-[60]' : 'z-[1]'} ${inGroup ? 'px-2 pt-2' : 'hover:bg-black/5 rounded-lg'}`}
                style={{ 
                    zIndex: isBeingDragged ? 65 : getContentLayer(style) * 10 + (isSelected || isEditable ? 1 : 0),
                    marginBottom: `${contentSpacing.categoryToProduct}px`,
                    touchAction: isEditable ? undefined : 'none'
                }}
                onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'category', id: item.data })} 
                onClick={(e) => handleItemClick(e, 'category', item.data)}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                {renderFormattingToolbar('category', item.data, catStyle)}
            {!handlers.readOnly && <ProductControls type="category" catName={item.data} canMoveUp={false} canMoveDown={false} canMoveLeft={false} canMoveRight={false} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showSelectionOutline={false} showAddControls={false} showGridMoveControls={false}/>}
                <div data-template-category data-menu-border-surface="category" data-custom-border={getBorderOverride(style, 'category')} style={{ background: getSurfaceFill(style, 'category'), borderRadius: style.borders?.category?.radius }} className={`relative flex w-full max-w-full min-w-0 items-center gap-1 ${getSurfaceFill(style, 'category') || getBorderOverride(style, 'category') ? 'py-1' : ''} ${compactControls ? 'px-1' : 'px-2'} ${categoryAlign === 'center' ? 'justify-center' : categoryAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <BorderDecoration style={style} scope="category" />
                    <MenuMarkerGlyph marker={getMarker(style, 'category')} fontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        index={handlers.sortedCategories.filter((id: string) => !id.startsWith(FREE_TEXT_PREFIX)).indexOf(item.data)} color="var(--template-accent)" />
                    {(categoryAlign === 'center' || categoryAlign === 'right') && renderCategoryDivider('before')}
                    {style.showCategoryImages !== false && (categoryImage?.url || handlers.photoIsLoading?.('category', item.data) || (isEditable && imageMenuProductId === item.data)) && (
                        <div id={handlers.readOnly ? undefined : `category-image-${item.data}`} data-product-image-surface={item.data}
                            data-auto-photo-ratio className="relative mr-2 shrink-0"
                            onClick={event => handlePhotoClick(event, 'category', item.data)}
                            style={photoDimensions('category', categoryImageScale, photoLimit,
                                `min(${widthFraction * 100}%, max(0px, calc(100% - ${titleReserve}px)))`, undefined, (categoryImage?.width || 1) / (categoryImage?.height || 1))}>
                            {categoryImage?.url && <MenuPhoto showLoading={!handlers.readOnly && !handlers.photoIsLoading?.('category', item.data)} src={categoryImage.url} alt="" draggable={false} className="h-full w-full object-cover"
                                style={{ objectPosition: `${categoryImage.crop?.x ?? 50}% ${categoryImage.crop?.y ?? 50}%`,
                                    transform: `scale(${categoryImage.horizontal ? -1 : 1}, ${categoryImage.vertical ? -1 : 1})` }} />}
                            {handlers.photoIsLoading?.('category', item.data) && <PhotoLoading />}
                            {isEditable && photoControls('category', item.data, Boolean(categoryImage?.url), categoryImage?.crop || { x: 50, y: 50 }, categoryImage)}
                        </div>
                    )}
                    <AutoFitText
                        as="h2"
                        text={categoryName(item.data)}
                        baseFontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        minimumFontSize={minimumFontSize}
                        allowSameWordBreak={allowSameWordBreak}
                        fitScope="category"
                        data-divider-title="true"
                        widthMode="flex"
                        id={handlers.readOnly ? undefined : elementId}
                        data-placeholder-field="category-name"
                        className={`min-w-0 max-w-full shrink whitespace-normal break-words [overflow-wrap:anywhere] [word-break:normal] outline-none rounded ${isEditable ? `${editableTextClassName} z-10` : ''}`}
                        style={{ 
                            color: `var(--automenu-preview-primary, ${catStyle.color || style.primaryColor})`,
                            ...textContrastFill('category'),
                            ...getTextOutlineStyle(catStyle.textOutline),
                            fontFamily: catStyle.fontFamily,
                            fontSize: `${clampFontSize(style, 'category', catStyle.fontSize, 24)}px`,
                            fontWeight: catStyle.fontWeight,
                            fontStyle: catStyle.italic ? 'italic' : 'normal',
                            textDecoration: catStyle.underline ? 'underline' : 'none',
                            textAlign: catStyle.textAlign,
                            textTransform: catStyle.textTransform,
                            letterSpacing: catStyle.letterSpacing ? `${catStyle.letterSpacing}px` : undefined
                        }}
                        contentEditable={Boolean(isEditable)} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'category', item.data)} onKeyDown={handlers.handleKeyDown} onFocus={() => handlers.setEditingField?.('category', item.data, 'category', elementId)} onMouseDown={(e) => { if (!isEditable) e.preventDefault(); }} onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }} onClick={event => formattingClick(event, 'category', item.data, 'category')}
                    />
                    {(categoryAlign === 'left' || categoryAlign === 'center') && renderCategoryDivider('after')}
                </div>
            </div>
        );
    }

    if (item.type === 'product-item') {
        const product = item.data as Product;
        const productSelectionType = product.isFreeText ? 'freeText' : 'product';
        const isSelected = backgroundText?.selected ?? (handlers.isSelected?.(productSelectionType, product.id) ?? handlers.selectedId === product.id);
        const primary = !backgroundText || backgroundText.primary;
        const isEditable = primary && !handlers.readOnly && handlers.isReadyToEdit?.(productSelectionType, product.id);
        const hiddenProductIds = new Set(style.hiddenProductIds || []);
        const visibleCatProducts = (handlers.groupedProducts[item.category] || [])
            .filter((candidate: Product) => !hiddenProductIds.has(candidate.id));
        const pIndex = visibleCatProducts.findIndex((candidate: Product) => candidate.id === product.id);
        const canMoveUp = visibleCatProducts.length > 1 && pIndex > 0;
        const canMoveDown = visibleCatProducts.length > 1 && pIndex >= 0 && pIndex < visibleCatProducts.length - 1;
        
        const isBeingDragged = handlers.isCanvasObjectDragging?.(productSelectionType, product.id);
        const nameStyle = product.isFreeText && product.styles ? product.styles : (style.elementStyles?.productName || {});
        const priceStyle = style.elementStyles?.productPrice || {};
        const descStyle = style.elementStyles?.productDescription || {};
        const productDividerPreset = resolveProductDivider(style, product.id);
        const showProductDivider = style.showPrices !== false && productDividerPreset !== 'none';
        const isNameCentered = nameStyle.textAlign === 'center';
        const isNameRight = nameStyle.textAlign === 'right';
        
        const categoryColumnCount = style.categoryColumnCount || 1;
        const productColumnCount = style.columnCount || 1;
        const compactControls = categoryColumnCount > 1;
        const stackImage = categoryColumnCount >= 3 && style.showImages && Boolean(product.image);
        const imageSizePx = getProductListImageLimit(categoryColumnCount);
        const rawCustomMarginTop = Number(product.customMarginTop);
        const isFreeTextGhost = product.isFreeText && item.category?.startsWith(FREE_TEXT_PREFIX);
        const pageHeight = resolveMenuPageDimensions(style).heightPx;
        const customMarginTop = Number.isFinite(rawCustomMarginTop)
            ? Math.max(0, Math.min(pageHeight, rawCustomMarginTop))
            : 0;
        const productAddControls = handlers.getSelectionAddControls?.(productSelectionType, product.id) || { top: true, bottom: true };
        const layer = product.isFreeText ? getFreeTextLayer(style, product.id) : getContentLayer(style);
        return (
                <div 
                    key={product.id}
                    id={handlers.readOnly || !primary ? undefined : `product-container-${product.id}`}
                    data-drag-scope={handlers.dragScope}
                    data-drag-type={backgroundText && handlers.readOnly ? undefined : 'product'}
                    data-drag-id={backgroundText && (handlers.readOnly || !primary) ? undefined : product.id}
                    data-template-product={product.isFreeText ? undefined : true}
                    data-canvas-free-text-id={product.isFreeText ? product.id : undefined}
                    data-canvas-layer={layer}
                    data-menu-border-surface={product.isFreeText ? 'freeText' : 'product'} data-custom-border={getBorderOverride(style, product.isFreeText ? 'freeText' : 'product', product.id)}
                    data-pagination-item={getPaginationItemKey(item)}
                    data-drag-group={item.category}
                    data-active-canvas-drag={isBeingDragged || undefined}
                    onPointerDown={handlers.readOnly ? undefined : (e) => handlers.handleDragStart(e, 'product', product.id, item.category)}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: productSelectionType, id: product.id })} 
                    onClick={(e) => handleItemClick(e, productSelectionType, product.id)}
                    onDoubleClick={(e) => e.stopPropagation()} 
                    className={`automenu-drag-item relative group rounded-lg transition-all duration-200 ${handlers.readOnly && backgroundText ? 'pointer-events-none' : 'pointer-events-auto'} ${product.isFreeText ? 'p-1' : 'p-2'} ${isEditable ? 'select-text touch-auto cursor-text' : 'select-none touch-auto cursor-grab'} ${isSelected || isEditable ? 'z-[60]' : 'z-[1]'} ${inGroup ? 'ml-0 mb-0' : '-ml-2 mb-2 hover:bg-black/5'} ${isSelected && !isEditable ? 'bg-indigo-50/30' : ''} ${product.isFreeText ? 'transition-none flex-none' : ''}`}
                    style={{
                        zIndex: isBeingDragged ? 65 : layer * 10 + (isSelected || isEditable ? 1 : 0),
                        background: getSurfaceFill(style, productSelectionType === 'freeText' ? 'freeText' : 'product', product.id),
                        borderRadius: product.isFreeText ? style.freeTextBorders?.[product.id]?.radius : style.borders?.product?.radius,
                        width: product.isFreeText ? (product.freeTextWidth ? `${product.freeTextWidth}px` : 'fit-content') : undefined,
                        maxWidth: product.isFreeText ? '100%' : undefined,
                        touchAction: product.isFreeText && !isEditable && !backgroundText && !handlers.readOnly ? 'none' : undefined,
                        marginTop: customMarginTop,
                        marginBottom: isFreeTextGhost
                            ? -customMarginTop
                            : product.isFreeText
                                ? undefined
                                : contentSpacing.betweenProducts,
                        paddingTop: inGroup && !isSelected && !product.isFreeText && !hasProductFill && !getBorderOverride(style, 'product') ? 0 : undefined,
                        paddingBottom: inGroup && !isSelected && !product.isFreeText && !hasProductFill && !getBorderOverride(style, 'product') ? 0 : undefined,
                    }}
                >
                <BorderDecoration style={style} scope={product.isFreeText ? 'freeText' : 'product'} id={product.id} />
                {isSelected && handlers.selectedId === product.id && !isFreeTextGhost && !backgroundText && !handlers.editingId && !handlers.multiSelectMode && (
                    <ColumnResizeHandles
                        columnIndex={columnIndex}
                        columnCount={renderedCategoryColumnCount || categoryColumnCount}
                        onResizeStart={handlers.startCategoryColumnResize}
                    />
                )}
                {product.isFreeText && isSelected && !handlers.isResizingCategoryColumns && (
                    <FreeTextResizeHandles product={product} style={style} handlers={handlers} />
                )}
                {primary && (product.isFreeText
                    ? renderFormattingToolbar('freeText', product.id, product.styles || {})
                    : renderFormattingToolbar('product', product.id,
                        formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle))}
                {!handlers.readOnly && (primary || isSelected) && <ProductControls type="product" id={product.id} catName={item.category} canMoveUp={!backgroundText && canMoveUp} canMoveDown={!backgroundText && canMoveDown} canMoveLeft={false} canMoveRight={false} isFreeText={product.isFreeText} handlers={handlers} outlineOnly={!primary} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showTopAddControl={productAddControls.top} showBottomAddControl={productAddControls.bottom} showGridMoveControls={productColumnCount > 1}/>}
                
                <div>
                {product.isFreeText ? (
                    <div
                        className="relative w-fit min-w-0 max-w-full leading-snug break-words [overflow-wrap:anywhere]"
                        style={{ textAlign: nameStyle.textAlign || 'left' }}
                    >
                            <AutoFitText
                            as="span"
                            text={product.name}
                            baseFontSize={clampFontSize(style, 'freeText', nameStyle.fontSize, 18)}
                            minimumFontSize={minimumFontSize}
                            allowSameWordBreak={allowSameWordBreak}
                            fitScope="freeText"
                            disableAutoFit
                            containerSelector={`#product-container-${product.id}`}
                            id={handlers.readOnly || !primary ? undefined : `product-name-${product.id}`} data-product-edit-id={product.id} data-placeholder-field="free-text" className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                            style={{ 
                                color: nameStyle.color || style.textColor,
                                ...textContrastFill(`freeText:${product.id}`),
                                ...getTextOutlineStyle(nameStyle.textOutline),
                                fontFamily: nameStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'freeText', nameStyle.fontSize, 18)}px`,
                                fontWeight: nameStyle.fontWeight,
                                fontStyle: nameStyle.italic ? 'italic' : 'normal',
                                textDecoration: nameStyle.underline ? 'underline' : 'none',
                                textTransform: nameStyle.textTransform,
                                letterSpacing: nameStyle.letterSpacing ? `${nameStyle.letterSpacing}px` : undefined
                            }}
                            contentEditable={Boolean(isEditable)} suppressContentEditableWarning onBlur={(e) => {
                                const container = document.getElementById(`product-container-${product.id}`);
                                const pendingWidth = Number(container?.dataset.pendingFreeTextWidth);
                                if (Number.isFinite(pendingWidth) && pendingWidth > 0) {
                                    handlers.updateProduct?.(product.id, 'freeTextWidth', pendingWidth);
                                    delete container?.dataset.pendingFreeTextWidth;
                                }
                                handlers.handleBlur(e, 'product', product.id, 'name');
                            }} onKeyDown={handlers.handleKeyDown} onInput={(e) => {
                                if (!isEditable) return;
                                const container = document.getElementById(`product-container-${product.id}`);
                                if (!container) return;
                                const maximumWidth = getFreeTextMaximumWidth(container);
                                const nextWidth = getFreeTextContentWidth(e.currentTarget, maximumWidth);
                                container.style.width = `${nextWidth}px`;
                                container.dataset.pendingFreeTextWidth = String(nextWidth);
                            }} onFocus={() => handlers.setEditingField?.('freeText', product.id, 'freeText', `product-name-${product.id}`)} onMouseDown={(e) => { if (!isEditable) e.preventDefault(); }} onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }} onClick={event => formattingClick(event, 'freeText', product.id, 'freeText')}
                            />
                    </div>
                ) : (
                <div className={`flex items-start justify-between ${stackImage ? 'flex-col gap-2' : compactControls ? 'gap-2' : 'gap-4'}`}>
                    {renderProductPhoto(product, imageSizePx, stackImage ? '100%' : '42%')}
                    <div className={`flex-grow min-w-0 ${stackImage ? 'w-full' : ''} ${isNameCentered ? 'text-center' : isNameRight ? 'text-right' : 'text-left'}`}>
                         <div
                            data-product-text-row="true"
                            data-product-leader={showProductDivider || undefined}
                            className={`relative flex min-w-0 ${showProductDivider || isNameCentered ? 'items-center' : 'items-start'}`}
                            style={{
                                marginBottom: contentSpacing.productNameToDescription,
                                columnGap: showProductDivider ? 5 : contentSpacing.productNameToPrice,
                                rowGap: 2,
                            }}
                         >
                            <div data-product-title-group className={`flex min-w-0 items-center gap-2 ${isNameCentered ? 'justify-center' : isNameRight ? 'justify-end' : ''}`} style={{ flexGrow: showProductDivider ? 0 : 1 }}>
                                <MenuMarkerGlyph marker={getMarker(style, 'product')} fontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                    index={visibleCatProducts.filter((candidate: Product) => !candidate.isFreeText).findIndex((candidate: Product) => candidate.id === product.id)}
                                    color="var(--template-accent)" />
                                <AutoFitText
                                    as="h3"
                                    text={product.name}
                                    baseFontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                    minimumFontSize={minimumFontSize}
                                    allowSameWordBreak={allowSameWordBreak}
                                    fitScope="productName"
                                    data-divider-title="true"
                                    widthMode="flex"
                                    containerSelector="[data-product-text-row]"
                                    id={handlers.readOnly ? undefined : `product-name-${product.id}`} data-product-edit-id={product.id} data-placeholder-field="product-name" className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                                    style={{ 
                                        color: nameStyle.color || style.textColor,
                                        ...textContrastFill('productName'),
                                        ...getTextOutlineStyle(nameStyle.textOutline),
                                        fontFamily: nameStyle.fontFamily,
                                        fontSize: `${clampFontSize(style, 'productName', nameStyle.fontSize, 18)}px`,
                                        fontWeight: nameStyle.fontWeight,
                                        fontStyle: nameStyle.italic ? 'italic' : 'normal',
                                        textDecoration: nameStyle.underline ? 'underline' : 'none',
                                        textAlign: nameStyle.textAlign,
                                        textTransform: nameStyle.textTransform,
                                        letterSpacing: nameStyle.letterSpacing ? `${nameStyle.letterSpacing}px` : undefined
                                    }}
                                    contentEditable={Boolean(isEditable)} tabIndex={isEditable ? 0 : undefined} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'name')} onKeyDown={handlers.handleKeyDown} onFocus={() => handlers.setEditingField?.('product', product.id, 'name', `product-name-${product.id}`)} onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }} onClick={event => formattingClick(event, 'product', product.id, 'name')}
                                />
                            </div>
                            {showProductDivider && (
                                <CanvasTextDivider preset={productDividerPreset} color={style.textColor} titleEdge="left" product />
                            )}
                            {renderProductPrice(product, Boolean(isEditable))}
                        </div>
                        <AutoFitText
                            as="p"
                            text={product.description}
                            baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                            minimumFontSize={minimumFontSize}
                            allowSameWordBreak={allowSameWordBreak}
                            fitScope="productDescription"
                            widthMode="parent"
                            data-template-description id={handlers.readOnly ? undefined : `product-description-${product.id}`} data-product-edit-id={product.id} data-placeholder-field="product-description" className={`max-w-full opacity-80 break-words [overflow-wrap:anywhere] [word-break:normal] leading-relaxed outline-none rounded ${isEditable ? `min-h-[1.5em] ${editableTextClassName}` : ''}`}
                            style={{ 
                                color: `var(--automenu-preview-text, ${descStyle.color || style.textColor})`,
                                ...textContrastFill('productDescription'),
                                ...getTextOutlineStyle(descStyle.textOutline),
                                fontFamily: descStyle.fontFamily,
                                fontSize: `${clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}px`,
                                fontWeight: descStyle.fontWeight,
                                textAlign: descStyle.textAlign || nameStyle.textAlign,
                                fontStyle: descStyle.italic ? 'italic' : 'normal',
                                textDecoration: descStyle.underline ? 'underline' : 'none'
                            }}
                            contentEditable={Boolean(isEditable)} tabIndex={isEditable ? 0 : undefined} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'description')} onKeyDown={handlers.handleKeyDown} onFocus={() => handlers.setEditingField?.('product', product.id, 'description', `product-description-${product.id}`)} onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }} onClick={event => formattingClick(event, 'product', product.id, 'description')}
                        />
                    </div>
                    </div>
                )}
                </div>
                </div>
        );
    }

    if (item.type === 'free-text-row') {
        return (
            <div data-pagination-item={getPaginationItemKey(item)} className="flex min-w-0 max-w-full flex-wrap items-start gap-2 pointer-events-none">
                {(item.data as Product[]).map((product) => (
                    <MenuItem
                        key={product.id}
                        item={{ type: 'product-item', data: product, category: item.category }}
                        idx={idx}
                        style={style}
                        handlers={handlers}
                        products={products}
                        inGroup={true}
                        columnIndex={columnIndex}
                        categoryColumnCount={renderedCategoryColumnCount}
                    />
                ))}
            </div>
        );
    }

    if (item.type === 'product-row') {
        const productColumnCount = style.columnCount || 1;
        const categoryColumnCount = style.categoryColumnCount || 1;
        const isCardLayout = usesProductCards(style);
        const cardRadius = getProductCardCornerRadii(style, style.borders?.product?.radius ?? getProductCardRadius(style));
        const cardBackgroundColor = style.cardBackgroundColor || '#ffffff';
        const compactControls = categoryColumnCount > 1 || productColumnCount > 1;
        const cardImageHeight = getProductCardImageLimit(style);
        const productGridGap = categoryColumnCount > 1
            ? (productColumnCount > 2 ? 4 : 8)
            : productColumnCount > 2
                ? 8
                : productColumnCount > 1
                    ? 12
                    : 24;
        
        return (
            <div
                key={`row-${idx}`}
                data-pagination-grid="true"
                className="grid"
                style={{
                    gridTemplateColumns: `repeat(${productColumnCount}, minmax(0, 1fr))`,
                    columnGap: `${productGridGap}px`,
                    rowGap: `${contentSpacing.betweenProducts}px`,
                    marginBottom: contentSpacing.betweenProducts,
                }}
            >
                {(item.data as Product[]).map((product, productColumnIndex) => {
                     const isSelected = handlers.isSelected?.('product', product.id) ?? handlers.selectedId === product.id;
                     const nameStyle = style.elementStyles?.productName || {};
                     const priceStyle = style.elementStyles?.productPrice || {};
                     const descStyle = style.elementStyles?.productDescription || {};
                     const productDividerPreset = resolveProductDivider(style, product.id);
                     const showProductDivider = style.showPrices !== false && productDividerPreset !== 'none';
                     const textAlignClass = nameStyle.textAlign === 'left'
                        ? 'text-left'
                        : nameStyle.textAlign === 'right'
                            ? 'text-right'
                            : 'text-center';
                     const hiddenProductIds = new Set(style.hiddenProductIds || []);
                     const visibleCatProducts = (handlers.groupedProducts[item.category] || [])
                        .filter((candidate: Product) => !hiddenProductIds.has(candidate.id));
                     const pIndex = visibleCatProducts.findIndex((candidate: Product) => candidate.id === product.id);
                     const hasMovableSiblings = visibleCatProducts.length > 1 && pIndex >= 0;
                     const canMoveUp = hasMovableSiblings && (productColumnCount > 1 ? pIndex - productColumnCount >= 0 : pIndex > 0);
                     const canMoveDown = hasMovableSiblings && (productColumnCount > 1 ? pIndex + productColumnCount < visibleCatProducts.length : pIndex < visibleCatProducts.length - 1);
                     const renderedProductColumnIndex = productColumnIndex % productColumnCount;
                     const canMoveLeft = hasMovableSiblings && renderedProductColumnIndex > 0;
                     const canMoveRight = hasMovableSiblings && renderedProductColumnIndex < productColumnCount - 1 && productColumnIndex + 1 < item.data.length;
                     const isBeingDragged = handlers.isCanvasObjectDragging?.('product', product.id);
                     const isEditable = !handlers.readOnly && handlers.isReadyToEdit?.('product', product.id);
                     const productAddControls = handlers.getSelectionAddControls?.('product', product.id) || { top: true, bottom: true };
                     return (
                            <div 
                                key={product.id}
                                id={handlers.readOnly ? undefined : `product-container-${product.id}`}
                                data-drag-scope={handlers.dragScope}
                                data-drag-type="product"
                                data-drag-id={product.id}
                                data-canvas-layer={getContentLayer(style)}
                                data-template-product={product.isFreeText ? undefined : true}
                                data-menu-border-surface="product" data-custom-border={getBorderOverride(style, 'product')}
                                data-product-card-surface={isCardLayout || undefined}
                                data-product-card-shape={isCardLayout ? style.productCardShape || 'template' : undefined}
                                data-drag-group={item.category}
                                data-active-canvas-drag={isBeingDragged || undefined}
                                onPointerDown={(e) => handlers.handleDragStart(e, 'product', product.id, item.category)}
                                onDragStart={(e) => e.preventDefault()}
                                onContextMenu={(e) => handlers.openObjectMenu?.(e, { type: 'product', id: product.id })} 
                                onClick={(e) => handleItemClick(e, 'product', product.id)}
                                className={`automenu-drag-item relative group min-w-0 transition-colors pointer-events-auto p-0 ${isEditable ? 'select-text touch-auto cursor-text' : 'select-none touch-auto cursor-grab'} ${isCardLayout ? 'rounded-xl' : 'rounded-lg'} ${isSelected || isEditable ? 'z-[60] bg-indigo-50/30' : 'z-[1] hover:bg-black/5'}`}
                                style={{ zIndex: isBeingDragged ? 65 : getContentLayer(style) * 10 + (isSelected || isEditable ? 1 : 0), borderRadius: isCardLayout ? cardRadius : undefined }}
                            >
                                <BorderDecoration style={style} scope="product" />
                                {isSelected && handlers.selectedId === product.id && !handlers.editingId && !handlers.multiSelectMode && (
                                    <ColumnResizeHandles columnIndex={columnIndex} columnCount={categoryColumnCount}
                                        onResizeStart={handlers.startCategoryColumnResize} />
                                )}
                                {renderFormattingToolbar('product', product.id,
                                    formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle)}
                            {!handlers.readOnly && <ProductControls type="product" id={product.id} catName={item.category} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canMoveLeft={canMoveLeft} canMoveRight={canMoveRight} isFreeText={product.isFreeText} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showTopAddControl={productAddControls.top} showBottomAddControl={productAddControls.bottom} showGridMoveControls={productColumnCount > 1}/>}
                                
                                <div
                                    data-template-card
                                    data-card-layout={isCardLayout || undefined}
                                    data-product-list-card={!isCardLayout || undefined}
                                    data-product-image-editing={isEditable || undefined}
                                    data-card-color-custom={style.cardBackgroundColorOverride || undefined}
                                    data-custom-border={getBorderOverride(style, 'product')}
                                    className={`h-full min-w-0 transition-shadow duration-150 ${isCardLayout ? 'border border-slate-200 shadow-sm group-hover:shadow-md' : 'bg-transparent'}`}
                                    style={{ '--menu-card-fill': getSurfaceFill(style, 'product'), backgroundColor: isCardLayout ? `var(--automenu-preview-cards, ${cardBackgroundColor})` : getSurfaceFill(style, 'product'), borderRadius: cardRadius } as React.CSSProperties}
                                >
                                    <div data-product-card-content className={`h-full min-w-0 flex flex-col ${isCardLayout || hasProductFill || getBorderOverride(style, 'product') ? 'p-1.5' : ''}`}
                                        style={{ borderRadius: 'inherit', '--automenu-background-photo-space': `calc(36px * var(${livePhotoScaleVariable('product')}, ${style.imageScale || 1}))` } as React.CSSProperties}>
                                        {renderProductPhoto(product, cardImageHeight, '100%', true)}
                                        <div data-template-content className={`${isCardLayout ? (categoryColumnCount > 1 || productColumnCount > 2 ? 'p-1.5' : productColumnCount > 1 ? 'p-2' : 'p-4') : 'py-2'} flex min-w-0 flex-col flex-grow ${textAlignClass}`}>
                                            <div
                                                data-product-text-row="true"
                                                data-product-leader={showProductDivider || undefined}
                                                className={`relative flex min-w-0 ${showProductDivider ? 'items-center' : 'items-start'}`}
                                                style={{
                                                    marginBottom: contentSpacing.productNameToDescription,
                                                    columnGap: showProductDivider ? 5 : contentSpacing.productNameToPrice,
                                                    rowGap: 2,
                                                }}
                                            >
                                                <div data-product-title-group className={`flex min-w-0 items-center gap-1 ${nameStyle.textAlign === 'center' ? 'justify-center' : nameStyle.textAlign === 'right' ? 'justify-end' : 'justify-start'}`} style={{ flexGrow: showProductDivider ? 0 : 1 }}>
                                                    <MenuMarkerGlyph marker={getMarker(style, 'product')} fontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                                        index={visibleCatProducts.filter((candidate: Product) => !candidate.isFreeText).findIndex((candidate: Product) => candidate.id === product.id)}
                                                        color="var(--template-accent)" />
                                                    <AutoFitText
                                                        as="h3"
                                                        text={product.name}
                                                        baseFontSize={clampFontSize(style, 'productName', nameStyle.fontSize, 18)}
                                                        minimumFontSize={minimumFontSize}
                                                        allowSameWordBreak={allowSameWordBreak}
                                                        fitScope="productName"
                                                        data-divider-title="true"
                                                        widthMode="flex"
                                                        containerSelector="[data-product-text-row]"
                                                        id={handlers.readOnly ? undefined : `product-name-${product.id}`}
                                                        data-placeholder-field="product-name"
                                                        data-product-edit-id={product.id}
                                                        className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                                                        style={{ ...textContrastFill('productName'), color: `var(--automenu-preview-text, ${nameStyle.color || style.textColor})`, ...getTextOutlineStyle(nameStyle.textOutline), fontFamily: nameStyle.fontFamily, fontSize: clampFontSize(style, 'productName', nameStyle.fontSize, 18), fontWeight: nameStyle.fontWeight, fontStyle: nameStyle.italic ? 'italic' : 'normal', textDecoration: nameStyle.underline ? 'underline' : 'none', textAlign: nameStyle.textAlign, textTransform: nameStyle.textTransform }}
                                                        contentEditable={Boolean(isEditable)}
                                                        suppressContentEditableWarning
                                                        onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'name')}
                                                        onKeyDown={handlers.handleKeyDown}
                                                        onFocus={() => handlers.setEditingField?.('product', product.id, 'name', `product-name-${product.id}`)}
                                                        tabIndex={isEditable ? 0 : undefined}
                                                        onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }}
                                                        onClick={event => formattingClick(event, 'product', product.id, 'name')}
                                                    />
                                                </div>
                                                {showProductDivider && (
                                                    <CanvasTextDivider preset={productDividerPreset} color={style.textColor} titleEdge="left" product />
                                                )}
                                                {renderProductPrice(product, Boolean(isEditable), isCardLayout
                                                    ? `rounded-full bg-white/90 border border-black/5 shadow-sm ${compactControls ? 'px-1.5 py-0.5' : 'px-2.5 py-1'}`
                                                    : undefined)}
                                            </div>
                                            <AutoFitText
                                                as="p"
                                                text={product.description}
                                                baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                                                minimumFontSize={minimumFontSize}
                                                allowSameWordBreak={allowSameWordBreak}
                                                fitScope="productDescription"
                                                widthMode="parent"
                                                data-template-description id={handlers.readOnly ? undefined : `product-description-${product.id}`}
                                                data-placeholder-field="product-description"
                                                data-product-edit-id={product.id}
                                                className={`max-w-full opacity-75 break-words [overflow-wrap:anywhere] [word-break:normal] flex-grow outline-none rounded ${isEditable ? `min-h-[1.5em] ${editableTextClassName}` : 'line-clamp-4'}`}
                                                style={{ ...textContrastFill('productDescription'), color: `var(--automenu-preview-text, ${descStyle.color || style.textColor})`, ...getTextOutlineStyle(descStyle.textOutline), fontFamily: descStyle.fontFamily, fontSize: clampFontSize(style, 'productDescription', descStyle.fontSize, 14), fontWeight: descStyle.fontWeight, fontStyle: descStyle.italic ? 'italic' : 'normal', textDecoration: descStyle.underline ? 'underline' : 'none', textAlign: descStyle.textAlign }}
                                                contentEditable={Boolean(isEditable)}
                                                tabIndex={isEditable ? 0 : undefined}
                                                suppressContentEditableWarning
                                                onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'description')}
                                                onKeyDown={handlers.handleKeyDown}
                                                onFocus={() => handlers.setEditingField?.('product', product.id, 'description', `product-description-${product.id}`)}
                                                onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }}
                                                onClick={event => formattingClick(event, 'product', product.id, 'description')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                     )
                })}
            </div>
        )
    }
    return null;
};
