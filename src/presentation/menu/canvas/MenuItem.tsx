import { getItemFormattingStyle, setItemDivider } from '../../../domain/menu/itemFormatting';
import { Edit3, CopyCheck, MoreHorizontal, Trash2 } from 'lucide-react';
import { CanvasActionGroup, canvasActionButtonClass } from './CanvasControls';
import { CanvasScaleHandles, CanvasRotationHandle } from './CanvasTransformHandles';
import { headingElementId, headingSelectionId, headingMeasurementKey, type MenuHeadingField } from '../../../domain/menu/menuHeadings';
import { getTextOutlineStyle } from './textOutlineStyle';
import { MenuMarkerGlyph } from './MenuMarkerGlyph';
import { getContentLayer, getFreeTextLayer } from '../../../domain/menu/imageLayers';
import { getSurfaceFill } from '../designer/Decorations';
import { categoryName } from '../../../domain/menu/categoryName';
import type { MenuStyle, Product, ElementStyle, FontSizeLimitKey, MenuBorderScope, PriceDecimalPlaces } from '../../../domain/menu/model';
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
import { getProductCardRadius, getProductPhotoFrameRadius, getProductCardCornerRadii, templateFontStack } from './templateStyles';
import { AutoFitText } from './AutoFitText';
import { CanvasTextDivider } from './CanvasTextDivider';
import { isHeadingTextHit } from './menuHeadingHit';
import { getPaginationItemKey, getProductGridGap, getProductCardImageLimit, getProductListImageLimit, getCategoryPhotoSizing } from '../../../domain/menu/menuPagination';
import { ProductControls, FreeTextResizeHandles, getFreeTextMaximumWidth, getFreeTextContentWidth } from './ProductCanvasControls';
import { DEFAULT_MENU_CONTENT_SPACING } from '../../../domain/menu/defaults';
import { FREE_TEXT_PREFIX } from '../../../domain/menu/flow';
import { resolveMenuPageDimensions } from '../../../domain/menu/pageSetup';
import { ColumnResizeHandles } from './ColumnResizeHandles';
import { formatMenuPriceValue, getMenuPriceSymbol, normalizePriceInput } from '../../../domain/menu/price';
import { PriceFormatSettings } from '../designer/PriceFormatSettings';

interface MenuItemProps {
    item: any;
    idx: number;
    pageIndex?: number;
    style: MenuStyle;
    priceDecimalPlaces: PriceDecimalPlaces;
    handlers: any; // Return type of useMenuInteractions
    products: Product[];
    inGroup: boolean;
    columnIndex?: number;
    categoryColumnCount?: number;
    backgroundText?: { pageIndex: number; primary: boolean; selected: boolean };
}

function productTextRowStyle(spacing: ReturnType<typeof resolveMenuContentSpacing>): React.CSSProperties {
    const gap = spacing.productNameToPrice;
    return {
        marginBottom: spacing.productNameToDescription,
        columnGap: gap,
        rowGap: 2,
        '--product-price-gap': `${gap}px`,
        '--product-price-space-share': gap / DEFAULT_MENU_CONTENT_SPACING.productNameToPrice,
    } as React.CSSProperties;
}

const editableTextClassName = 'bg-indigo-500/15 ring-2 ring-blue-500 cursor-text select-text touch-auto pointer-events-auto';



const focusCanvasFieldAtClick = (event: React.MouseEvent<HTMLElement>) => {
    const field = event.currentTarget;
    if (!field.isContentEditable || field === document.activeElement) return;
    field.focus({ preventScroll: true });
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
    pageIndex = 0,
    style: menuStyle,
    priceDecimalPlaces,
    handlers,
    products,
    inGroup,
    columnIndex = 0,
    categoryColumnCount: renderedCategoryColumnCount,
    backgroundText,
}) => {
    const style = menuStyle;
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
    const contentSpacing = resolveMenuContentSpacing(style);
    const replacePriceOnNextInputRef = React.useRef(new Set<string>());
    const editedPricesRef = React.useRef(new Set<string>());
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
        const nextText = normalizePriceInput(text);
        if (!nextText) return;
        element.innerText = nextText;
        editedPricesRef.current.add(productId);
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
        const nextText = normalizePriceInput(inputEvent.data);
        if (!nextText) return;
        event.preventDefault();
        replacePriceText(event.currentTarget, productId, nextText);
    };
    const handlePricePaste = (event: React.ClipboardEvent<HTMLElement>, productId: string) => {
        event.preventDefault();
        const text = normalizePriceInput(event.clipboardData.getData('text/plain'));
        if (!text) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount || !event.currentTarget.contains(selection.anchorNode)) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const inserted = document.createTextNode(text);
        range.insertNode(inserted);
        selection.collapse(inserted, text.length);
        editedPricesRef.current.add(productId);
        replacePriceOnNextInputRef.current.delete(productId);
        const value = event.currentTarget.innerText;
        const normalized = normalizePriceInput(value);
        if (normalized !== value) replacePriceText(event.currentTarget, productId, normalized);
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

    const renderFormattingToolbar = (type: 'product' | 'category' | 'freeText' | 'menuTitle' | 'menuSubtitle', id: string, value: ElementStyle, style = menuStyle) => {
        if (formattingTarget?.type !== type || formattingTarget.id !== id) return null;
        const fontKey: FontSizeLimitKey = type !== 'product' ? type : formattingTarget.field === 'price' ? 'productPrice'
            : formattingTarget.field === 'description' ? 'productDescription' : 'productName';
        const fallbackSize = fontKey === 'menuTitle' ? 48 : fontKey === 'category' ? 24 : fontKey === 'productDescription' ? 14 : 18;
        const scope: MenuBorderScope = type === 'menuTitle' || type === 'menuSubtitle' ? 'header' :
            type === 'category' ? 'category' : type === 'freeText' ? 'freeText' :
            formattingTarget.field === 'price' ? 'price' : 'product';
        const border = scope === 'freeText' ? style.freeTextBorders?.[id] : style.borders?.[scope];
        const kind = type === 'category' || type === 'product' ? type : null;
        const updateDecoration = kind && handlers.updateItemFormatting
            ? (recipe: (previous: MenuStyle) => MenuStyle) => handlers.updateItemFormatting(kind, id, recipe)
            : handlers.updateStyle;
        const dividerLabel = kind === 'product' ? 'Linha do produto' : 'Linha da categoria';
        const divider = kind ? {
            label: dividerLabel,
            picker: <CategoryDividerPicker compact label={dividerLabel}
                value={kind === 'category' ? resolveCategoryDivider(style, id) : resolveProductDivider(style, id)}
                color={kind === 'category' ? style.primaryColor : style.textColor}
                onChange={preset => updateDecoration?.((previous: MenuStyle) => kind === 'product' && !handlers.updateItemFormatting
                    ? { ...previous, productDividerStyle: preset, name: 'Custom' }
                    : setItemDivider(previous, kind, id, preset))}
            />,
        } : undefined;
        return <InlineStyleToolbar
                targetElementId={formattingTarget.elementId}
                priceAlignment={type === 'product' && formattingTarget.field === 'price'}
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
                decoration={updateDecoration ? (formatButtons, onGroupBorderPanelChange) => (
                    <DecorationControls key={scope} style={style} setStyle={updateDecoration} id={id} scope={scope} targetElementId={formattingTarget.elementId} divider={divider}
                        onGroupBorderPanelChange={type === 'category' ? onGroupBorderPanelChange : undefined}>
                        {formatButtons}
                    </DecorationControls>
                ) : undefined}
                onAdjustPrice={type === 'product' && formattingTarget.field === 'price'
                    ? (direction: 1 | -1, amount: number, mode: PriceAdjustmentMode) => handlers.adjustProductPrice?.(id, direction, amount, mode)
                    : undefined}
                priceFormatHeader={type === 'product' && formattingTarget.field === 'price' && handlers.updateStyle
                    ? <PriceFormatSettings compact style={style} setStyle={handlers.updateStyle}>Alterar valor</PriceFormatSettings>
                    : undefined}
                priceAdjustmentCurrency={getMenuPriceSymbol(style)}
            />;
    };
    const textContrastFill = (key: string): React.CSSProperties | undefined => {
        const backgroundColor = style.textContrastFills?.[key];
        return backgroundColor ? { backgroundColor, opacity: 1 } : undefined;
    };
    const renderProductPrice = (style: MenuStyle, product: Product, isEditable: boolean, badgeClass = '') => {
        if (style.showPrices === false) return null;
        const priceStyle = style.elementStyles?.productPrice || {};
        const baseSize = clampFontSize(style, 'productPrice', priceStyle.fontSize, 18);
        const currency = getMenuPriceSymbol(style);
        const alignment = priceStyle.textAlign || 'right';
        return <div data-product-price-slot data-price-alignment={alignment}>
        <div data-template-price data-price-base-size={baseSize}
            data-menu-border-surface="price" data-price-alignment={priceStyle.textAlign} data-custom-border={getBorderOverride(style, 'price')}
            className={`relative flex min-w-0 items-center gap-1 whitespace-nowrap ${badgeClass}`}
            style={{
                background: getSurfaceFill(style, 'price'), borderRadius: style.borders?.price?.radius,
                ...textContrastFill('productPrice'),
                color: `var(--automenu-preview-text, ${priceStyle.color || style.textColor})`,
                ...getTextOutlineStyle(priceStyle.textOutline),
                fontFamily: templateFontStack(style, priceStyle.fontFamily),
                fontSize: `var(--automenu-price-fit-size, ${baseSize}px)`,
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
                    handlers.handleBlur(event, 'product', product.id, 'price', editedPricesRef.current.delete(product.id));
                }}
                onKeyDown={event => handlePriceKeyDown(event, product.id)}
                onBeforeInput={event => handlePriceBeforeInput(event, product.id)}
                onPaste={event => handlePricePaste(event, product.id)}
                onInput={event => {
                    editedPricesRef.current.add(product.id);
                    const input = event.currentTarget;
                    const normalized = normalizePriceInput(input.innerText);
                    if (normalized !== input.innerText) replacePriceText(input, product.id, normalized);
                }}
                onFocus={event => handlePriceFocus(event, product.id)}
                onPointerDown={event => { if (isEditable) event.stopPropagation(); }}
                onClick={event => formattingClick(event, 'product', product.id, 'price')}
            >{formatMenuPriceValue(product.price, { priceDecimalPlaces, priceDecimalSeparator: style.priceDecimalSeparator })}</span>
        </div></div>;
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
            type={type} updateStyle={handlers.updateStyle}
            alignment={(type === 'product' ? style.productPhotoAlignments?.[id] ?? style.productPhotoAlignmentDefault : style.categoryImages?.[id]?.alignment ?? style.categoryPhotoAlignmentDefault) || 'left'} />
    );
    const renderProductPhoto = (style: MenuStyle, product: Product, limit: number, maxWidth: string, inRow = false) => {
        const isEditable = !handlers.readOnly && handlers.isReadyToEdit?.('product', product.id);
        const loading = handlers.photoIsLoading?.('product', product.id);
        if (!style.showImages || (!product.image && !loading && !(isEditable && imageMenuProductId === product.id))) return null;
        const crop = style.productPhotoCrops?.[product.id] || { x: product.imageAlignment === 'left' ? 0 : product.imageAlignment === 'right' ? 100 : 50, y: 50 };
        const frame = resolveProductImageFrame(style, inRow);
        const hasFrame = frame !== 'template';
        const shaped = hasFrame && frame !== 'fill';
        const alignment = style.productPhotoAlignments?.[product.id] ?? style.productPhotoAlignmentDefault;
        const background = inRow && style.design?.image === 'background' && !hasFrame && !alignment;
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
                data-photo-positioned={alignment || undefined}
                data-menu-border-surface="productImage"
                data-custom-border={getBorderOverride(style, 'productImage')}
                data-product-image-surface={product.id}
                data-product-photo-frame={hasFrame ? frame : undefined}
                className={`relative shrink-0 bg-slate-100 select-none ${isEditable ? 'cursor-pointer ring-2 ring-inset ring-indigo-400' : ''}`}
                style={{
                    ...photoDimensions('product', style.imageScale || 1, limit, maxWidth, frame, 1, style.productPhotoRatio),
                    marginInline: alignment === 'center' ? 'auto' : undefined,
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
        const hasTitle = item.title ?? true;
        const hasSubtitle = item.subtitle ?? Boolean(style.menuSubtitle?.trim());
        const titleId = headingElementId('menuTitle', pageIndex);
        const editingNewSubtitle = !hasSubtitle && formattingTarget?.elementId === headingElementId('menuSubtitle', pageIndex);
        const showSubtitleDraft = !hasSubtitle && !handlers.readOnly &&
            (editingNewSubtitle || !style.menuSubtitle?.trim() && formattingTarget?.elementId === titleId);
        const showSubtitle = hasSubtitle || showSubtitleDraft;
        const selectedTitle = handlers.isSelected?.('menuTitle', headingSelectionId('menuTitle', pageIndex));
        const selectedSubtitle = handlers.isSelected?.('menuSubtitle', headingSelectionId('menuSubtitle', pageIndex));
        const selected = !handlers.readOnly && (selectedTitle || selectedSubtitle);
        const activeField: MenuHeadingField = formattingTarget?.elementId === titleId ? 'menuTitle'
            : selectedSubtitle || !hasTitle || formattingTarget?.elementId === headingElementId('menuSubtitle', pageIndex)
                ? 'menuSubtitle' : 'menuTitle';
        const activeTarget = { type: activeField, id: headingSelectionId(activeField, pageIndex) };
        const activeLabel = activeField === 'menuTitle' ? 'título' : 'subtítulo';
        const heroImage = hasTitle && style.design?.header === 'hero' && style.showImages && style.design.image !== 'none'
            ? products.find(product => product.image && !product.isFreeText && !style.hiddenProductIds.includes(product.id))?.image : undefined;

        const renderHeading = (field: MenuHeadingField, fieldStyle: ElementStyle) => {
            const title = field === 'menuTitle';
            const id = headingSelectionId(field, pageIndex);
            const elementId = headingElementId(field, pageIndex);
            const target = { type: field, id };
            const editing = !handlers.readOnly && formattingTarget?.elementId === elementId;
            const draft = !title && showSubtitleDraft;
            const fontSize = clampFontSize(style, field, fieldStyle.fontSize, title ? 48 : 18);
            return (
                <div data-menu-heading-frame={title ? 'title' : 'subtitle'}
                    className={draft ? 'absolute inset-x-0 top-full z-10 min-w-0' : 'relative min-w-0'}
                    style={{ marginBottom: draft ? 0 : hasSubtitle && title ? fieldStyle.marginBottom ?? 10 : contentSpacing.headerToContent }}
                >
                    <AutoFitText
                        as={title ? 'h1' : 'p'}
                        text={title ? style.menuTitle ?? 'MENU' : hasSubtitle ? style.menuSubtitle : ''}
                        baseFontSize={fontSize}
                        minimumFontSize={minimumFontSize}
                        fitScope={field}
                        widthMode="parent"
                        id={handlers.readOnly ? undefined : elementId}
                        tabIndex={handlers.readOnly ? undefined : 0}
                        data-menu-heading={title ? 'title' : 'subtitle'}
                        data-subtitle-placeholder={draft && !editing ? 'Adicionar subtítulo' : undefined}
                        data-print-control={draft ? 'true' : undefined}
                        aria-label={draft ? 'Adicionar subtítulo' : undefined}
                        className={`outline-none ${title ? 'tracking-tight' : 'opacity-90'} ${editing ? 'cursor-text select-text' : 'cursor-default select-none'} ${draft ? `min-w-px w-fit ${fieldStyle.textAlign === 'left' ? 'mr-auto' : fieldStyle.textAlign === 'right' ? 'ml-auto' : 'mx-auto'}` : ''} empty:before:opacity-50 empty:before:content-[attr(data-subtitle-placeholder)]`}
                        style={{
                            color: `var(--automenu-preview-primary, ${fieldStyle.color || (title ? style.primaryColor : style.textColor)})`,
                            ...textContrastFill(field),
                            ...getTextOutlineStyle(fieldStyle.textOutline),
                            fontFamily: templateFontStack(style, fieldStyle.fontFamily || style.fontFamily),
                            fontWeight: fieldStyle.fontWeight || (title ? '700' : undefined),
                            fontStyle: fieldStyle.italic ? 'italic' : 'normal',
                            textDecoration: fieldStyle.underline ? 'underline' : 'none',
                            textAlign: fieldStyle.textAlign || (!title && style.design?.header === 'split' ? 'right' : undefined),
                            textTransform: fieldStyle.textTransform,
                            letterSpacing: fieldStyle.letterSpacing ? `${fieldStyle.letterSpacing}px` : undefined,
                        }}
                        onPointerDown={handlers.readOnly ? undefined : event => {
                            if (!editing) event.preventDefault();
                            else if (!draft && !isMenuHeadingTextHit(event)) {
                                preventHeadingFocusOutsideText(event);
                                handlers.setFormattingTarget?.(null);
                            }
                        }}
                        onContextMenu={handlers.readOnly ? undefined : event => {
                            if (isMenuHeadingTextHit(event)) handlers.openObjectMenu?.(event, target);
                        }}
                        onClick={handlers.readOnly ? undefined : event => {
                            if (!isMenuHeadingTextHit(event)) return;
                            event.stopPropagation();
                            if ((selected || draft) && !handlers.multiSelectMode && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                                if (!editing) handlers.editHeading?.(field, pageIndex);
                                focusCanvasFieldAtClick(event);
                            } else {
                                const target = selected && (handlers.multiSelectMode || event.ctrlKey || event.metaKey)
                                    ? activeTarget : { type: field, id };
                                handlers.handleSelection(target.type, target.id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey });
                            }
                        }}
                        onFocus={handlers.readOnly ? undefined : () => {
                            if (!editing && !handlers.multiSelectMode) {
                                handlers.handleSelection(field, id);
                                handlers.startMenuTextEditing?.(field, elementId, id);
                            }
                        }}
                        contentEditable={editing || undefined}
                        suppressContentEditableWarning
                        onBlur={handlers.readOnly ? undefined : event => draft && editing ? handlers.commitSubtitleDraft?.(pageIndex, event.currentTarget.innerText) : handlers.handleBlur(event, 'menu', id, field)}
                        onKeyDown={event => {
                            handlers.handleKeyDown?.(event);
                            if (event.key === 'Enter' && !event.shiftKey || event.key === 'Escape') {
                                event.currentTarget.blur();
                                handlers.setFormattingTarget?.(null);
                            }
                        }}
                    />
                    {renderFormattingToolbar(field, id, fieldStyle)}
                </div>
            );
        };

        return (
            <header data-block-id="main-header" data-pagination-item="main-header"
                data-heading-measurement={headingMeasurementKey(hasTitle, hasSubtitle)}
                data-heading-draft={showSubtitleDraft || undefined}
                data-template-header data-header-page={pageIndex} data-menu-border-surface="header" data-custom-border={getBorderOverride(style, 'header')}
                className={`relative flow-root text-center pointer-events-auto ${selected ? 'ring-2 ring-indigo-500 bg-indigo-50/10' : ''}`}
                style={{ zIndex: showSubtitleDraft ? 65 : 20, background: getSurfaceFill(style, 'header'), borderRadius: style.borders?.header?.radius }}>
                <BorderDecoration style={style} scope="header" />
                {heroImage && <img src={heroImage} data-template-hero-image alt="" draggable={false} onError={event => { event.currentTarget.hidden = true; }} />}
                {hasTitle && renderHeading('menuTitle', titleStyle)}
                {showSubtitle && renderHeading('menuSubtitle', subStyle)}
                {selected && !showSubtitleDraft && handlers.startCanvasScale && (
                    <CanvasScaleHandles edges={handlers.getSelectionControlEdges?.(activeTarget.type, activeTarget.id)} target={{ ...activeTarget, headingFields: [
                        ...(hasTitle ? ['menuTitle' as const] : []),
                        ...(hasSubtitle ? ['menuSubtitle' as const] : []),
                    ] }} start={handlers.startCanvasScale} />
                )}
                {selected && (
                    <CanvasActionGroup direction="top" kind="quick">
                        <button type="button" className={canvasActionButtonClass} aria-label={`Editar ${activeLabel}`} title={`Editar ${activeLabel}`}
                            onClick={() => handlers.editHeading?.(activeField, pageIndex)}><Edit3 size={14} /></button>
                        <button type="button" className={canvasActionButtonClass} aria-label="Seleção múltipla" title="Seleção múltipla"
                            aria-pressed={handlers.multiSelectMode} onClick={() => handlers.setMultiSelectMode(!handlers.multiSelectMode)}><CopyCheck size={14} /></button>
                        <button type="button" className={`${canvasActionButtonClass} !text-red-600`} aria-label="Remover cabeçalho" title="Remover cabeçalho"
                            onClick={() => handlers.removeHeading?.(pageIndex)}><Trash2 size={14} /></button>
                        <button type="button" className={canvasActionButtonClass} aria-label="Mais ações" title="Mais ações"
                            data-open-object-menu="true" data-object-menu-type={activeField} data-object-menu-id={activeTarget.id}
                            onClick={event => handlers.openObjectMenu?.(event, activeTarget)}><MoreHorizontal size={16} /></button>
                    </CanvasActionGroup>
                )}
            </header>
        );
    }

    if (item.type === 'category-header') {
        const style = getItemFormattingStyle(menuStyle, 'category', item.data);
        const isSelected = handlers.isSelected?.('category', item.data) ?? handlers.selectedId === item.data;
        const catStyle = style.elementStyles?.category || {};
        const isEditable = !handlers.readOnly && handlers.isReadyToEdit?.('category', item.data);
        const elementId = `text-${item.data}`;
        const isBeingDragged = handlers.isCanvasObjectDragging?.('category', item.data);
        const compactControls = (style.categoryColumnCount || 1) > 1;
        const categoryAlign = catStyle.textAlign || 'left';
        const categoryImage = style.categoryImages?.[item.data];
        const categoryImageScale = style.categoryImageScale || 1;
        const photoAlignment = categoryImage?.alignment || style.categoryPhotoAlignmentDefault || 'left';
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
                {renderFormattingToolbar('category', item.data, catStyle, style)}
            {!handlers.readOnly && <ProductControls type="category" catName={item.data} canMoveUp={false} canMoveDown={false} canMoveLeft={false} canMoveRight={false} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showSelectionOutline={false} showAddControls={false} showGridMoveControls={false}/>}
                <div data-template-category data-menu-border-surface="category" data-custom-border={getBorderOverride(style, 'category')} style={{ background: getSurfaceFill(style, 'category'), borderRadius: style.borders?.category?.radius }} className={`relative flex w-full max-w-full min-w-0 items-center gap-1 ${getSurfaceFill(style, 'category') || getBorderOverride(style, 'category') ? 'py-1' : ''} ${compactControls ? 'px-1' : 'px-2'} ${categoryAlign === 'center' ? 'justify-center' : categoryAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <BorderDecoration style={style} scope="category" />
                    {style.showCategoryImages !== false && (categoryImage?.url || handlers.photoIsLoading?.('category', item.data) || (isEditable && imageMenuProductId === item.data)) && (
                        <div id={handlers.readOnly ? undefined : `category-image-${item.data}`} data-product-image-surface={item.data}
                            data-auto-photo-ratio data-category-photo-align={photoAlignment}
                            className="relative shrink-0"
                            onClick={event => handlePhotoClick(event, 'category', item.data)}
                            style={photoDimensions('category', categoryImageScale, photoLimit,
                                photoAlignment === 'center' ? '100%' : `min(${widthFraction * 100}%, max(0px, calc(100% - ${titleReserve}px)))`, undefined, (categoryImage?.width || 1) / (categoryImage?.height || 1), style.categoryPhotoRatio)}>
                            {categoryImage?.url && <MenuPhoto showLoading={!handlers.readOnly && !handlers.photoIsLoading?.('category', item.data)} src={categoryImage.url} alt="" draggable={false} className="h-full w-full object-cover"
                                style={{ objectPosition: `${categoryImage.crop?.x ?? 50}% ${categoryImage.crop?.y ?? 50}%`,
                                    transform: `scale(${categoryImage.horizontal ? -1 : 1}, ${categoryImage.vertical ? -1 : 1})` }} />}
                            {handlers.photoIsLoading?.('category', item.data) && <PhotoLoading />}
                            {isEditable && photoControls('category', item.data, Boolean(categoryImage?.url), categoryImage?.crop || { x: 50, y: 50 }, categoryImage)}
                        </div>
                    )}
                    <div data-category-copy className={`relative flex min-w-0 flex-1 items-center gap-1 ${categoryAlign === 'center' ? 'justify-center' : categoryAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <MenuMarkerGlyph marker={getMarker(style, 'category')} fontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        index={handlers.sortedCategories.filter((id: string) => !id.startsWith(FREE_TEXT_PREFIX)).indexOf(item.data)} color="var(--template-accent)" />
                    {(categoryAlign === 'center' || categoryAlign === 'right') && renderCategoryDivider('before')}
                    <AutoFitText
                        as="h2"
                        text={categoryName(item.data)}
                        baseFontSize={clampFontSize(style, 'category', catStyle.fontSize, 24)}
                        minimumFontSize={minimumFontSize}
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
                            fontFamily: templateFontStack(style, catStyle.fontFamily),
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
            </div>
        );
    }

    if (item.type === 'product-item') {
        const product = item.data as Product;
        const style = product.isFreeText ? menuStyle : getItemFormattingStyle(menuStyle, 'product', product.id);
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
        const rotation = handlers.liveTextRotation?.id === product.id ? handlers.liveTextRotation.rotation : product.rotation;
        const fill = getSurfaceFill(style, 'product');
        const hasProductFill = Boolean(fill && fill !== 'transparent');
        const nameStyle = product.isFreeText && product.styles ? product.styles : (style.elementStyles?.productName || {});
        const priceStyle = style.elementStyles?.productPrice || {};
        const descStyle = style.elementStyles?.productDescription || {};
        const productDividerPreset = resolveProductDivider(style, product.id);
        const showProductDivider = style.showPrices !== false && productDividerPreset !== 'none';
        const isNameCentered = nameStyle.textAlign === 'center';
        const isNameRight = nameStyle.textAlign === 'right';
        const verticalPadding = inGroup && !isSelected && !hasProductFill && !getBorderOverride(style, 'product')
            ? 0 : Math.min(8, contentSpacing.betweenProducts);
        
        const categoryColumnCount = style.categoryColumnCount || 1;
        const productColumnCount = style.columnCount || 1;
        const photoAlignment = style.productPhotoAlignments?.[product.id] ?? style.productPhotoAlignmentDefault ?? 'left';
        const stackImage = photoAlignment === 'center' || categoryColumnCount >= 3 && !style.productPhotoAlignments?.[product.id] && !style.productPhotoAlignmentDefault;
        const imageSizePx = getProductListImageLimit(categoryColumnCount);
        const rawCustomMarginTop = Number(product.customMarginTop);
        const isFreeTextGhost = product.isFreeText && item.category?.startsWith(FREE_TEXT_PREFIX);
        const pageHeight = resolveMenuPageDimensions(style).heightPx;
        const customMarginTop = Number.isFinite(rawCustomMarginTop)
            ? Math.max(0, Math.min(pageHeight, rawCustomMarginTop))
            : 0;
        const productControlEdges = handlers.getSelectionControlEdges?.(productSelectionType, product.id) || { top: true, bottom: true };
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
                        rotate: product.isFreeText && rotation ? rotation + 'deg' : undefined,
                        touchAction: product.isFreeText && !isEditable && !backgroundText && !handlers.readOnly ? 'none' : undefined,
                        marginTop: customMarginTop,
                        marginBottom: isFreeTextGhost
                            ? -customMarginTop
                            : product.isFreeText
                                ? undefined
                                : contentSpacing.betweenProducts,
                        paddingBlock: product.isFreeText ? undefined : verticalPadding,
                    }}
                >
                <BorderDecoration style={style} scope={product.isFreeText ? 'freeText' : 'product'} id={product.id} />
                {isSelected && !product.isFreeText && handlers.selectedId === product.id && !handlers.editingId && !handlers.multiSelectMode && (
                    <ColumnResizeHandles
                        columnIndex={columnIndex}
                        columnCount={renderedCategoryColumnCount || categoryColumnCount}
                        onResizeStart={handlers.startCategoryColumnResize}
                    />
                )}
                {!handlers.readOnly && primary && !product.isFreeText && isSelected && !isBeingDragged && !handlers.editingId
                    && handlers.startCanvasScale && (
                    <CanvasScaleHandles edges={productControlEdges} target={{ type: productSelectionType, id: product.id }} start={handlers.startCanvasScale} />
                )}
                {!handlers.readOnly && primary && product.isFreeText && isSelected && !isBeingDragged && !handlers.editingId
                    && !handlers.multiSelectMode && handlers.rotateCanvasText && (
                    <CanvasRotationHandle rotation={product.rotation ?? 0} snapRightAngles guideFollowsRotation
                        onRotate={(rotation, commit) => handlers.rotateCanvasText(product.id, rotation, commit)} />
                )}
                {product.isFreeText && isSelected && !handlers.isResizingCategoryColumns && (
                    <FreeTextResizeHandles product={product} style={style} handlers={handlers} />
                )}
                {primary && (product.isFreeText
                    ? renderFormattingToolbar('freeText', product.id, product.styles || {})
                    : renderFormattingToolbar('product', product.id,
                        formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle, style))}
                {!handlers.readOnly && (primary || isSelected) && <ProductControls type="product" id={product.id} catName={item.category} canMoveUp={!backgroundText && canMoveUp} canMoveDown={!backgroundText && canMoveDown} canMoveLeft={false} canMoveRight={false} isFreeText={product.isFreeText} handlers={handlers} outlineOnly={!primary} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showTopControl={productControlEdges.top} showBottomControl={productControlEdges.bottom} showGridMoveControls={productColumnCount > 1}/>}
                
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
                            fitScope="freeText"
                            containerSelector={`#product-container-${product.id}`}
                            id={handlers.readOnly || !primary ? undefined : `product-name-${product.id}`} data-product-edit-id={product.id} data-placeholder-field="free-text" className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                            style={{ 
                                color: nameStyle.color || style.textColor,
                                ...textContrastFill(`freeText:${product.id}`),
                                ...getTextOutlineStyle(nameStyle.textOutline),
                                fontFamily: templateFontStack(style, nameStyle.fontFamily),
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
                <div data-product-flow data-photo-flow={stackImage ? 'stack' : photoAlignment}
                    className={`flow-root min-w-0 ${isNameCentered ? 'text-center' : isNameRight ? 'text-right' : 'text-left'}`}>
                    {renderProductPhoto(style, product, imageSizePx, stackImage ? '100%' : '42%')}
                         <div
                            data-product-text-row="true"
                            data-product-leader={showProductDivider || undefined}
                            data-compact-price-gap={style.showPrices !== false && contentSpacing.productNameToPrice < DEFAULT_MENU_CONTENT_SPACING.productNameToPrice
                                ? isNameRight ? 'start' : 'end' : undefined}
                            className={`relative flex min-w-0 ${showProductDivider || isNameCentered ? 'items-center' : 'items-start'}`}
                            style={productTextRowStyle(contentSpacing)}
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
                                    fitScope="productName"
                                    data-divider-title="true"
                                    widthMode="flex"
                                    containerSelector="[data-product-text-row]"
                                    id={handlers.readOnly ? undefined : `product-name-${product.id}`} data-product-edit-id={product.id} data-placeholder-field="product-name" className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                                    style={{ 
                                        color: nameStyle.color || style.textColor,
                                        ...textContrastFill('productName'),
                                        ...getTextOutlineStyle(nameStyle.textOutline),
                                        fontFamily: templateFontStack(style, nameStyle.fontFamily),
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
                            {renderProductPrice(style, product, Boolean(isEditable))}
                        </div>
                        <AutoFitText
                            as="p"
                            text={product.description}
                            baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                            minimumFontSize={minimumFontSize}
                            fitScope="productDescription"
                            widthMode="parent"
                            data-template-description id={handlers.readOnly ? undefined : `product-description-${product.id}`} data-product-edit-id={product.id} data-placeholder-field="product-description" className={`max-w-full opacity-80 break-words [overflow-wrap:anywhere] [word-break:normal] leading-relaxed outline-none rounded ${isEditable ? `min-h-[1.5em] ${editableTextClassName}` : ''}`}
                            style={{ 
                                color: `var(--automenu-preview-text, ${descStyle.color || style.textColor})`,
                                ...textContrastFill('productDescription'),
                                ...getTextOutlineStyle(descStyle.textOutline),
                                fontFamily: templateFontStack(style, descStyle.fontFamily),
                                fontSize: `${clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}px`,
                                lineHeight: descStyle.lineHeight,
                                fontWeight: descStyle.fontWeight,
                                textAlign: descStyle.textAlign || nameStyle.textAlign,
                                fontStyle: descStyle.italic ? 'italic' : 'normal',
                                textDecoration: descStyle.underline ? 'underline' : 'none'
                            }}
                            contentEditable={Boolean(isEditable)} tabIndex={isEditable ? 0 : undefined} suppressContentEditableWarning onBlur={(e) => handlers.handleBlur(e, 'product', product.id, 'description')} onKeyDown={handlers.handleKeyDown} onFocus={() => handlers.setEditingField?.('product', product.id, 'description', `product-description-${product.id}`)} onPointerDown={(e) => { if (isEditable) e.stopPropagation(); }} onClick={event => formattingClick(event, 'product', product.id, 'description')}
                        />
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
                        priceDecimalPlaces={priceDecimalPlaces}
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
        const cardTextPadding = isCardLayout
            ? (categoryColumnCount > 1 || productColumnCount > 2 ? 6 : productColumnCount > 1 ? 8 : 16)
            : 8;
        const compactControls = categoryColumnCount > 1 || productColumnCount > 1;
        const cardImageHeight = getProductCardImageLimit(style);
        const productGridGap = getProductGridGap(style);
        
        return (
            <div
                key={`row-${idx}`}
                data-pagination-grid="true" data-pagination-columns={productColumnCount}
                className="grid"
                style={{
                    gridTemplateColumns: `repeat(${productColumnCount}, minmax(0, 1fr))`,
                    columnGap: `${productGridGap}px`,
                    rowGap: `${contentSpacing.betweenProducts}px`,
                    marginBottom: contentSpacing.betweenProducts,
                }}
            >
                {(item.data as Product[]).map((product, productColumnIndex) => {
                     const style = getItemFormattingStyle(menuStyle, 'product', product.id);
                     const fill = getSurfaceFill(style, 'product');
                     const hasProductFill = Boolean(fill && fill !== 'transparent');
                     const cardRadius = getProductCardCornerRadii(style, style.borders?.product?.radius ?? getProductCardRadius(style));
                     const cardBackgroundColor = style.cardBackgroundColor || '#ffffff';
                     const isSelected = handlers.isSelected?.('product', product.id) ?? handlers.selectedId === product.id;
                     const photoAlignment = style.productPhotoAlignments?.[product.id] ?? style.productPhotoAlignmentDefault;
                     const sidePhoto = photoAlignment === 'left' || photoAlignment === 'right';
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
                     const productControlEdges = handlers.getSelectionControlEdges?.('product', product.id) || { top: true, bottom: true };
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
                                {!handlers.readOnly && isSelected && !isBeingDragged && !handlers.editingId
                                    && handlers.startCanvasScale && (
                                    <CanvasScaleHandles edges={productControlEdges} target={{ type: 'product', id: product.id }} start={handlers.startCanvasScale} />
                                )}
                                {isSelected && handlers.selectedId === product.id && !handlers.editingId && !handlers.multiSelectMode && (
                                    <ColumnResizeHandles columnIndex={columnIndex} columnCount={categoryColumnCount}
                                        onResizeStart={handlers.startCategoryColumnResize} />
                                )}
                                {renderFormattingToolbar('product', product.id,
                                    formattingTarget?.field === 'price' ? priceStyle : formattingTarget?.field === 'description' ? descStyle : nameStyle, style)}
                            {!handlers.readOnly && <ProductControls type="product" id={product.id} catName={item.category} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canMoveLeft={canMoveLeft} canMoveRight={canMoveRight} isFreeText={product.isFreeText} handlers={handlers} isDragging={isBeingDragged || handlers.isResizingCategoryColumns} showTopControl={productControlEdges.top} showBottomControl={productControlEdges.bottom} showGridMoveControls={productColumnCount > 1}/>}
                                
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
                                    <div data-product-card-content data-product-flow data-photo-flow={photoAlignment ?? 'template'}
                                        className={`h-full min-w-0 ${sidePhoto ? 'flow-root' : 'flex flex-col'} ${isCardLayout || hasProductFill || getBorderOverride(style, 'product') ? 'p-1.5' : ''}`}
                                        style={{ borderRadius: 'inherit',
                                            paddingBlock: isCardLayout || hasProductFill || getBorderOverride(style, 'product')
                                                ? Math.min(6, contentSpacing.betweenProducts) : undefined,
                                            '--automenu-background-photo-space': `calc(36px * var(${livePhotoScaleVariable('product')}, ${style.imageScale || 1}))` } as React.CSSProperties}>
                                        {renderProductPhoto(style, product, cardImageHeight, sidePhoto ? '42%' : '100%', true)}
                                        <div data-template-content className={`${sidePhoto ? 'block' : 'flex flex-col flex-grow'} min-w-0 ${textAlignClass}`}
                                            style={{
                                                paddingInline: isCardLayout ? cardTextPadding : undefined,
                                                paddingBlock: Math.min(cardTextPadding, contentSpacing.betweenProducts),
                                            }}>
                                            <div
                                                data-product-text-row="true"
                                                data-product-leader={showProductDivider || undefined}
                                                data-compact-price-gap={style.showPrices !== false && contentSpacing.productNameToPrice < DEFAULT_MENU_CONTENT_SPACING.productNameToPrice
                                                    ? nameStyle.textAlign === 'right' ? 'start' : 'end' : undefined}
                                                className={`relative flex min-w-0 ${showProductDivider ? 'items-center' : 'items-start'}`}
                                                style={productTextRowStyle(contentSpacing)}
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
                                                        fitScope="productName"
                                                        data-divider-title="true"
                                                        widthMode="flex"
                                                        containerSelector="[data-product-text-row]"
                                                        id={handlers.readOnly ? undefined : `product-name-${product.id}`}
                                                        data-placeholder-field="product-name"
                                                        data-product-edit-id={product.id}
                                                        className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:normal] leading-snug outline-none rounded ${isEditable ? editableTextClassName : ''}`}
                                                        style={{ ...textContrastFill('productName'), color: `var(--automenu-preview-text, ${nameStyle.color || style.textColor})`, ...getTextOutlineStyle(nameStyle.textOutline), fontFamily: templateFontStack(style, nameStyle.fontFamily), fontSize: clampFontSize(style, 'productName', nameStyle.fontSize, 18), fontWeight: nameStyle.fontWeight, fontStyle: nameStyle.italic ? 'italic' : 'normal', textDecoration: nameStyle.underline ? 'underline' : 'none', textAlign: nameStyle.textAlign, textTransform: nameStyle.textTransform }}
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
                                                {renderProductPrice(style, product, Boolean(isEditable), isCardLayout
                                                    ? `rounded-full bg-white/90 border border-black/5 shadow-sm ${compactControls ? 'px-1.5 py-0.5' : 'px-2.5 py-1'}`
                                                    : undefined)}
                                            </div>
                                            <AutoFitText
                                                as="p"
                                                text={product.description}
                                                baseFontSize={clampFontSize(style, 'productDescription', descStyle.fontSize, 14)}
                                                minimumFontSize={minimumFontSize}
                                                fitScope="productDescription"
                                                widthMode="parent"
                                                data-template-description id={handlers.readOnly ? undefined : `product-description-${product.id}`}
                                                data-placeholder-field="product-description"
                                                data-product-edit-id={product.id}
                                                className={`max-w-full opacity-75 break-words [overflow-wrap:anywhere] [word-break:normal] flex-grow outline-none rounded ${isEditable ? `min-h-[1.5em] ${editableTextClassName}` : 'line-clamp-4'}`}
                                                style={{ ...textContrastFill('productDescription'), color: `var(--automenu-preview-text, ${descStyle.color || style.textColor})`, ...getTextOutlineStyle(descStyle.textOutline), fontFamily: templateFontStack(style, descStyle.fontFamily), fontSize: clampFontSize(style, 'productDescription', descStyle.fontSize, 14), lineHeight: descStyle.lineHeight, fontWeight: descStyle.fontWeight, fontStyle: descStyle.italic ? 'italic' : 'normal', textDecoration: descStyle.underline ? 'underline' : 'none', textAlign: descStyle.textAlign }}
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
