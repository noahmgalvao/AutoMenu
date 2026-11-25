import { getCategoryFitRegression } from '../../domain/menu/menuPagination';
import { categoryKey, categoryName } from '../../domain/menu/categoryName';

import React, { useState, useRef } from 'react';
import type { CategoryDividerStyle, Product, MenuStyle, SortOption } from '../../domain/menu/model';
import type { MenuImportMode } from '../../domain/imports/model';
import { useMenuInteractions } from '../menu/interactions/useMenuInteractions';
import type { FinalizedMenuImport, ProcessedMenuImport } from '../../application/imports/importReview';
import { useAppServices } from '../app/AppServicesProvider';
import { roundPrice } from '../../domain/menu/price';
import { optimizeImageForUpload, preloadImage } from '../../infrastructure/browser/imageUpload';
import { getImageDimensions } from '../../infrastructure/browser/imageProcessor';
import {
    applyPriceOperations,
    createPricePropagationRequest,
    getPricePropagationSourceIds,
    type PricePropagationRequest,
} from '../../domain/menu/pricePropagation';

type EditSession = {
    changes: Record<string, Partial<Product>>;
    dividers: { id: string; preset: CategoryDividerStyle }[];
    closed?: { cancelledId?: string };
    savedIds: Set<string>;
};

interface UseProductDesignerLogicProps {
    products: Product[];
    setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    setTemplates?: React.Dispatch<React.SetStateAction<MenuStyle[]>>;
    sortOption: SortOption;
    workspaceId: string;
    currentUserId: string;
    currentMenuId: string;
    productsCanChangeCategory?: boolean;
    onProductAdded?: (id: string) => void;
}

export const useProductDesignerLogic = ({
    products,
    setProducts,
    style,
    setStyle,
    setTemplates,
    sortOption,
    workspaceId,
    currentUserId,
    currentMenuId,
    productsCanChangeCategory,
    onProductAdded,
}: UseProductDesignerLogicProps) => {
    const { assets: { uploadFileAsset }, prepareMenuImport } = useAppServices();
    // --- STATE ---
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [editModeId, setEditModeId] = useState<string | null>(null);
    const [savedEditIds, setSavedEditIds] = useState<ReadonlySet<string>>(new Set());
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [showInsights, setShowInsights] = useState(false);
    const [bulkPercentage, setBulkPercentage] = useState<number | string>(10);
    const [bulkAdjustmentMode, setBulkAdjustmentMode] = useState<'percentage' | 'integer'>('percentage');
    const [priceRequests, setPriceRequests] = useState<PricePropagationRequest[]>([]);
    const pendingPricePropagation = priceRequests[0] || null;
    const [isUploading, setIsUploading] = useState(false);

    // Draft State
    const [newItemDraft, setNewItemDraft] = useState<{ categoryId: string, type: 'product' | 'category'; position?: 'first' | 'last' | { after: string } } | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<Product>>({});
    const [existingEdits, setExistingEdits] = useState<Record<string, Partial<Product>>>({});
    const [pendingDivider, setPendingDivider] = useState<CategoryDividerStyle>();
    const editSessionRef = useRef<EditSession | null>(null);
    const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
    const [categoryUploadTarget, setCategoryUploadTarget] = useState<string | null>(null);
    const [productImageUpload, setProductImageUpload] = useState<{ id: string; previewUrl: string } | null>(null);
    const [categoryImageUpload, setCategoryImageUpload] = useState<{ id: string; previewUrl: string } | null>(null);

    // Refs
    const productFileInputRef = useRef<HTMLInputElement>(null);
    const categoryFileInputRef = useRef<HTMLInputElement>(null);

    const resolveCategoryId = (categoryName: string) => {
        return products.find((product) => !product.isFreeText && product.category === categoryName)?.categoryId || crypto.randomUUID();
    };

    // --- INTERACTION HANDLERS ---
    const handleCommitCategoryOrder = (newOrder: string[]) => {
        setStyle(prev => ({ ...prev, customCategoryOrder: newOrder, name: 'Custom' }));
    };

    const handleCommitProductOrder = (category: string, newOrder: string[], manuallyChanged: boolean) => {
        setStyle(prev => ({
            ...prev,
            customProductOrder: { ...prev.customProductOrder, [category]: newOrder },
            manualProductOrder: manuallyChanged || prev.manualProductOrder,
            name: 'Custom'
        }));
    };

    const handleUpdateProducts = (updates: { id: string, field: keyof Product, value: any }[]) => {
        setProducts(prev => {
            const updateMap = new Map<string, Record<string, any>>();
            updates.forEach(u => {
                const existing = updateMap.get(u.id) || {};
                existing[u.field] = u.value;
                updateMap.set(u.id, existing);
            });
            return prev.map(p => {
                if (updateMap.has(p.id)) return { ...p, ...updateMap.get(p.id) };
                return p;
            });
        });
    };

    const handleToggleVisibility = (id: string, visible: boolean) => {
        const targets = getBatchTargets(id);

        setStyle(prev => {
            const currentHidden = new Set(prev.hiddenProductIds || []);

            targets.forEach((target) => {
                if (target.type === 'category') {
                    products.filter(p => p.category === target.id).forEach(p => {
                        if (visible) currentHidden.delete(p.id);
                        else currentHidden.add(p.id);
                    });
                    return;
                }

                if (target.type === 'product' || target.type === 'freeText') {
                    if (visible) currentHidden.delete(target.id);
                    else currentHidden.add(target.id);
                }
            });

            return { ...prev, hiddenProductIds: Array.from(currentHidden), name: 'Custom' };
        });
        // Do not close menu immediately to allow user to see change, or close it if preferred.
        // setMenuOpenId(null); 
    };

    const handlers = useMenuInteractions({
        products,
        style,
        sortOption,
        onCommitCategoryOrder: handleCommitCategoryOrder,
        onCommitProductOrder: handleCommitProductOrder,
        onUpdateProducts: handleUpdateProducts,
        onToggleProductVisibility: handleToggleVisibility,
        productsCanChangeCategory
    });

    const getProductSelectionType = (product?: Product) => product?.isFreeText ? 'freeText' : 'product';

    const getBatchTargets = (id: string, type?: 'product' | 'category') => {
        const clickedProduct = products.find(product => product.id === id);
        const clickedTarget = {
            type: type === 'category' || handlers.sortedCategories.includes(id)
                ? 'category'
                : getProductSelectionType(clickedProduct),
            id,
        };
        const selectedItems = handlers.selectedItems || [];
        const isClickedSelected = selectedItems.some((item: any) => item.id === id);

        return isClickedSelected && selectedItems.length > 1 ? selectedItems : [clickedTarget];
    };

    // --- LOCAL HANDLERS ---

    const toggleCollapse = (cat: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const handleBulkAdjust = (direction: 1 | -1) => {
        const rawAmount = Number(bulkPercentage);
        const amount = bulkAdjustmentMode === 'integer' ? Math.round(rawAmount) : rawAmount;
        if (!amount) return;
        setProducts(prev => prev.map(p => {
            if (p.isFreeText) return p;
            const nextPrice = bulkAdjustmentMode === 'percentage'
                ? p.price * (1 + (direction * (amount / 100)))
                : p.price + (direction * amount);
            return { ...p, price: roundPrice(nextPrice) };
        }));
    };

    const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadTargetId) return;
        const targetId = uploadTargetId;
        const session = editSessionRef.current;
        const previewUrl = URL.createObjectURL(file);
        setProductImageUpload({ id: targetId, previewUrl });
        try {
            const optimizedFile = await optimizeImageForUpload(file, 1400);
            const { asset, url } = await uploadFileAsset({
                workspaceId,
                userId: currentUserId,
                bucket: 'product-images',
                assetType: 'product_image',
                file: optimizedFile,
                metadata: { product_id: targetId }
            });
            const image = { image: url, imageAssetId: asset.id };
            if (session && !session.closed && !session.savedIds.has(targetId)) {
                updateExistingEdit(targetId, previous => ({ ...previous, ...image }));
            } else if (session?.closed?.cancelledId !== targetId) {
                setProducts(prev => prev.map(p => p.id === targetId ? { ...p, ...image } : p));
                setStyle(prev => prev.showImages ? prev : { ...prev, showImages: true, name: 'Custom' });
            }
            await preloadImage(url);
        } catch (err) {
            console.error(err);
        } finally {
            setProductImageUpload(current => current?.id === targetId ? null : current);
            URL.revokeObjectURL(previewUrl);
            setUploadTargetId(null);
            if (productFileInputRef.current) productFileInputRef.current.value = '';
        }
    };

    const onProductImageClick = (id: string) => {
        setUploadTargetId(id);
        productFileInputRef.current?.click();
    };

    const onRemoveProductImage = (id: string) => {
        const image = { image: '', imageAssetId: null };
        if (editSessionRef.current && !editSessionRef.current.savedIds.has(id)) updateExistingEdit(id, previous => ({ ...previous, ...image }));
        else setProducts(prev => prev.map(p => p.id === id ? { ...p, ...image } : p));
    };

    const handleCategoryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !categoryUploadTarget) return;
        const targetCategory = categoryUploadTarget;
        const previewUrl = URL.createObjectURL(file);
        setCategoryImageUpload({ id: targetCategory, previewUrl });
        try {
            const optimizedFilePromise = optimizeImageForUpload(file, 900);
            const imageDimensionsPromise = getImageDimensions(file);
            const optimizedFile = await optimizedFilePromise;
            const [imageDimensions, { asset, url }] = await Promise.all([
                imageDimensionsPromise,
                uploadFileAsset({
                    workspaceId,
                    userId: currentUserId,
                    bucket: 'menu-assets',
                    assetType: 'added_image',
                    file: optimizedFile,
                    metadata: {
                        menu_id: currentMenuId,
                        category_name: targetCategory,
                        role: 'category_image',
                    },
                }),
            ]);
            setStyle(prev => ({
                ...prev,
                name: 'Custom',
                showCategoryImages: true,
                categoryImages: {
                    ...(prev.categoryImages || {}),
                    [targetCategory]: {
                        url,
                        assetId: asset.id,
                        width: imageDimensions.width,
                        height: imageDimensions.height,
                    },
                },
            }));
            await preloadImage(url);
        } catch (err) {
            console.error(err);
        } finally {
            setCategoryImageUpload(current => current?.id === targetCategory ? null : current);
            URL.revokeObjectURL(previewUrl);
            setCategoryUploadTarget(null);
            if (categoryFileInputRef.current) categoryFileInputRef.current.value = '';
        }
    };

    const onCategoryImageClick = (category: string) => {
        setCategoryUploadTarget(category);
        categoryFileInputRef.current?.click();
    };

    const onRemoveCategoryImage = (category: string) => {
        setStyle(prev => {
            const categoryImages = { ...(prev.categoryImages || {}) };
            delete categoryImages[category];
            return { ...prev, categoryImages, name: 'Custom' };
        });
    };

    const startEdit = (id: string) => {
        const product = products.find(candidate => candidate.id === id);
        handlers.handleSelection(
            handlers.sortedCategories.includes(id) ? 'category' : getProductSelectionType(product),
            id
        );
        const session = editSessionRef.current ?? { changes: {}, dividers: [], savedIds: new Set<string>() };
        editSessionRef.current = session;
        session.savedIds.delete(id);
        setSavedEditIds(new Set(session.savedIds));
        setEditModeId(id);
        setMenuOpenId(null);
    };

    const updateExistingEdit = (id: string, update: React.SetStateAction<Partial<Product>>) => {
        const session = editSessionRef.current;
        if (!session) return;
        const original: Partial<Product> = products.find(product => product.id === id) || { name: categoryName(id) };
        const previous = { ...original, ...session.changes[id] };
        const next = typeof update === 'function' ? update(previous) : update;
        const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
            original[key as keyof Product] !== value));
        session.changes = { ...session.changes, [id]: changes };
        setExistingEdits(session.changes);
    };

    const updateProductDivider = (id: string, preset: CategoryDividerStyle) => {
        const session = editSessionRef.current;
        if (!session) return;
        session.dividers = [...session.dividers.filter(change => change.id !== id), { id, preset }];
        setPendingDivider(preset);
    };

    const initiateAdd = (categoryId: string, type: 'product' | 'category', position?: 'first' | 'last' | { after: string }) => {
        if (editSessionRef.current) finishEditing();
        if (type === 'product') setCollapsedCategories(previous => new Set([...previous].filter(id => id !== categoryId)));
        setNewItemDraft({ categoryId, type, position });
        setEditModeId('DRAFT');
        setFormData({ name: '', price: 0, description: '' });
    };

    const saveNewItem = () => {
        if (!newItemDraft) return;
        if (newItemDraft.type === 'product') {
            const newProd: Product = {
                id: crypto.randomUUID(),
                name: formData.name || 'Novo item',
                price: roundPrice(formData.price),
                priceEnteredWithDecimals: formData.priceEnteredWithDecimals,
                description: formData.description || '',
                category: newItemDraft.categoryId,
                categoryId: resolveCategoryId(newItemDraft.categoryId),
                image: ''
            };
            const current = (handlers.groupedProducts[newProd.category] || []).map(p => p.id);
            const position = newItemDraft.position;
            const after = typeof position === 'object' ? current.indexOf(position.after) : -1;
            current.splice(position === 'first' ? 0 : after >= 0 ? after + 1 : current.length, 0, newProd.id);
            const nextStyle = {
                ...style,
                manualProductOrder: true,
                customProductOrder: { ...style.customProductOrder, [newProd.category]: current },
                name: 'Custom',
            };
            const blocked = getCategoryFitRegression(products, style, [...products, newProd], nextStyle, sortOption);
            if (blocked) {
                window.dispatchEvent(new CustomEvent('menu-category-limit-reached', { detail: { category: blocked } }));
                return false;
            }
            setProducts(prev => [...prev, newProd]);
            onProductAdded?.(newProd.id);
            setStyle(previous => ({ ...previous, manualProductOrder: true, name: 'Custom',
                customProductOrder: { ...previous.customProductOrder, [newProd.category]: current },
            }));
        } else if (newItemDraft.type === 'category') {
            const newCatName = formData.name || 'Nova categoria';
            if (!newCatName) return;

            // Add to custom order
            setStyle(prev => {
                const currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0 ? [...prev.customCategoryOrder] : [...handlers.sortedCategories];
                const refIdx = currentOrder.indexOf(newItemDraft.categoryId);
                if (refIdx !== -1) currentOrder.splice(refIdx + 1, 0, newCatName);
                else currentOrder.push(newCatName);
                return { ...prev, customCategoryOrder: currentOrder, name: 'Custom' };
            });

            const newId = crypto.randomUUID();
            const placeholderProd: Product = {
                id: newId,
                name: 'Novo item',
                price: 0,
                description: 'Descrição',
                category: newCatName,
                categoryId: crypto.randomUUID(),
                image: ''
            };
            setProducts(prev => [...prev, placeholderProd]);
        }
    };

    const saveExistingEdits = (session: EditSession, cancelledId?: string) => {
        const changes = Object.entries(session.changes).filter(([id]) => id !== cancelledId);
        const productsById = new Map(products.map(product => [product.id, product]));
        const productChanges = new Map<string, Partial<Product>>();
        const renames = new Map<string, string>();
        const divider = [...session.dividers].reverse().find(change => change.id !== cancelledId)?.preset;
        const newPriceRequests: PricePropagationRequest[] = [];
        for (const [id, fields] of changes) {
            const product = productsById.get(id);
            if (product) {
                if (!Object.keys(fields).length) continue;
                if (fields.price !== undefined && !product.isFreeText) {
                    fields.price = roundPrice(fields.price);
                    const previousPrice = roundPrice(product.price);
                    if (previousPrice !== 0 && fields.price !== previousPrice) {
                        newPriceRequests.push(createPricePropagationRequest({
                            productId: id,
                            productName: fields.name || product.name,
                            previousPrice,
                            nextPrice: fields.price,
                        }));
                    }
                }
                productChanges.set(id, fields);
            } else if (fields.name && fields.name !== categoryName(id) && handlers.sortedCategories.includes(id)) {
                renames.set(id, categoryKey(fields.name, [...handlers.sortedCategories, ...renames.values()], id));
            }
        }

        if (productChanges.size || renames.size) {
            setProducts(previous => previous.map(product => {
                const fields = productChanges.get(product.id);
                const category = renames.get(product.category);
                return fields || category ? { ...product, ...fields, category: category ?? product.category } : product;
            }));
        }
        const hasAddedProductPhoto = [...productChanges.values()].some(fields => Boolean(fields.image));
        if (renames.size || divider !== undefined || (hasAddedProductPhoto && !style.showImages)) {
            const rename = (category: string) => renames.get(category) ?? category;
            setStyle(previous => {
                const order = [...new Set([...(previous.customCategoryOrder || []), ...handlers.sortedCategories])];
                return {
                    ...previous,
                    showImages: hasAddedProductPhoto || previous.showImages,
                    customCategoryOrder: renames.size ? [...new Set(order.map(rename))] : previous.customCategoryOrder,
                    customProductOrder: renames.size ? Object.fromEntries(Object.entries(previous.customProductOrder || {})
                        .map(([category, order]) => [rename(category), order])) : previous.customProductOrder,
                    categoryImages: renames.size ? Object.fromEntries(Object.entries(previous.categoryImages || {})
                        .map(([category, image]) => [rename(category), image])) : previous.categoryImages,
                    productDividerStyle: divider ?? previous.productDividerStyle,
                    name: 'Custom',
                };
            });
        }
        if (newPriceRequests.length) setPriceRequests(previous => [...previous, ...newPriceRequests]);
    };

    const finishEditing = (cancelledId?: string, explicit = false) => {
        const session = editSessionRef.current;
        if (session) {
            session.closed = { cancelledId };
            editSessionRef.current = null;
            saveExistingEdits(session, cancelledId);
            setExistingEdits({});
            setPendingDivider(undefined);
        } else if (newItemDraft && !cancelledId && (explicit || formData.name || formData.description || formData.price)) {
            if (saveNewItem() === false && explicit) return;
        }
        setEditModeId(null);
        setSavedEditIds(new Set());
        setNewItemDraft(null);
        setFormData({});
    };

    const saveEdit = (id?: string) => {
        const session = editSessionRef.current;
        if (!id || !session) return finishEditing(undefined, true);
        const changes = session.changes[id];
        const dividers = session.dividers.filter(change => change.id === id);
        saveExistingEdits({ changes: changes ? { [id]: changes } : {}, dividers, savedIds: session.savedIds });
        const newKey = changes?.name && handlers.sortedCategories.includes(id)
            ? categoryKey(changes.name, handlers.sortedCategories, id) : id;
        session.savedIds.add(id);
        session.savedIds.add(newKey);
        delete session.changes[id];
        session.dividers = session.dividers.filter(change => change.id !== id);
        setPendingDivider(session.dividers[session.dividers.length - 1]?.preset);
        setExistingEdits({ ...session.changes });
        setSavedEditIds(new Set(session.savedIds));
    };
    const saveOnExit = () => finishEditing();
    const cancelEdit = (id: string) => finishEditing(id);

    const applyPricePropagation = () => {
        if (!pendingPricePropagation) return;
        const sourceIds = getPricePropagationSourceIds(pendingPricePropagation);
        setProducts(previous => previous.map(product => {
            if (product.isFreeText || sourceIds.has(product.id)) return product;
            return { ...product, price: applyPriceOperations(product.price, pendingPricePropagation.operations) };
        }));
        setPriceRequests(previous => previous.slice(1));
    };

    const remove = (id: string, type: 'product' | 'category') => {
        // This function permanently deletes items from the database
        const targets = getBatchTargets(id, type);
        const confirmLabel = targets.length > 1 ? `${targets.length} selected items` : `this ${type}`;

        if (window.confirm(`Permanently delete ${confirmLabel}?`)) {
            const categoriesToDelete = new Set<string>();
            const productIdsToDelete = new Set<string>();

            targets.forEach((target: any) => {
                if (target.type === 'category') {
                    categoriesToDelete.add(target.id);
                } else {
                    productIdsToDelete.add(target.id);
                }
            });

            setProducts(prev => prev.filter(product => (
                !productIdsToDelete.has(product.id) && !categoriesToDelete.has(product.category)
            )));

            setStyle(prev => {
                const deletedProductIds = new Set(productIdsToDelete);
                products.forEach(product => {
                    if (categoriesToDelete.has(product.category)) deletedProductIds.add(product.id);
                });

                const newHidden = (prev.hiddenProductIds || []).filter(hiddenId => !deletedProductIds.has(hiddenId));
                const newCatOrder = (prev.customCategoryOrder || []).filter(category => !categoriesToDelete.has(category));
                const newProdOrder = { ...prev.customProductOrder };
                const categoryImages = { ...(prev.categoryImages || {}) };
                categoriesToDelete.forEach(category => delete categoryImages[category]);
                Object.keys(newProdOrder).forEach(category => {
                    if (categoriesToDelete.has(category)) {
                        delete newProdOrder[category];
                    } else if (newProdOrder[category]) {
                        newProdOrder[category] = newProdOrder[category].filter(productId => !deletedProductIds.has(productId));
                    }
                });

                return {
                    ...prev,
                    hiddenProductIds: newHidden,
                    customCategoryOrder: newCatOrder,
                    customProductOrder: newProdOrder,
                    categoryImages,
                    name: 'Custom'
                };
            });
        }
        setMenuOpenId(null);
    };

    // --- AI IMPORT LOGIC ---
    const prepareAIImport = async (
        files: File[],
        importMode: MenuImportMode
    ): Promise<ProcessedMenuImport> => {
        if (files.length === 0) throw new Error('Nenhuma página foi selecionada.');
        setIsUploading(true);

        try {
            return await prepareMenuImport({
                files,
                importMode,
                currentProducts: products,
                currentStyle: style,
                workspaceId,
                userId: currentUserId,
                menuId: currentMenuId,
            });

        } catch (error) {
            console.error(error);
            throw new Error('Erro ao importar cardápio. Tente novamente.');
        } finally {
            setIsUploading(false);
        }
    };

    const commitAIImport = (
        imported: ProcessedMenuImport,
        finalized: FinalizedMenuImport,
    ) => {
        if (imported.products) {
            setProducts(finalized.products);
        }

        if (imported.style || imported.orderStyle) {
            setStyle(finalized.style);
        }

        if (imported.style && setTemplates) {
            setTemplates((previousTemplates) => [finalized.style, ...previousTemplates]);
        }
    };

    return {
        // State
        collapsedCategories,
        editModeId, savedEditIds,
        menuOpenId,
        showInsights,
        bulkPercentage,
        bulkAdjustmentMode,
        pendingPricePropagation,
        isUploading,
        newItemDraft,
        formData, existingEdits, pendingDivider,
        productImageUpload,
        categoryImageUpload,

        // Setters
        setMenuOpenId,
        setShowInsights,
        setBulkPercentage,
        setBulkAdjustmentMode,
        setFormData, updateExistingEdit, updateProductDivider,

        // Refs
        productFileInputRef,
        categoryFileInputRef,

        // Handlers
        handlers,
        toggleCollapse,
        handleBulkAdjust,
        applyPricePropagation,
        dismissPricePropagation: () => setPriceRequests(previous => previous.slice(1)),
        handleProductImageUpload,
        onProductImageClick,
        onRemoveProductImage,
        handleCategoryImageUpload,
        onCategoryImageClick,
        onRemoveCategoryImage,
        startEdit,
        cancelEdit,
        initiateAdd,
        saveEdit, saveOnExit,
        remove,
        handleToggleVisibility,
        prepareAIImport,
        commitAIImport
    };
};
