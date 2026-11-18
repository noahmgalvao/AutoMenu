
import React, { useState, useRef } from 'react';
import type { Product, MenuStyle, SortOption } from '../../domain/menu/model';
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
    mergePricePropagationRequest,
    type PricePropagationRequest,
} from '../../domain/menu/pricePropagation';

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
    productsCanChangeCategory
}: UseProductDesignerLogicProps) => {
    const { assets: { uploadFileAsset }, prepareMenuImport } = useAppServices();
    // --- STATE ---
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [editModeId, setEditModeId] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [showInsights, setShowInsights] = useState(false);
    const [bulkPercentage, setBulkPercentage] = useState<number | string>(10);
    const [bulkAdjustmentMode, setBulkAdjustmentMode] = useState<'percentage' | 'integer'>('percentage');
    const [pendingPricePropagation, setPendingPricePropagation] = useState<PricePropagationRequest | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Draft State
    const [newItemDraft, setNewItemDraft] = useState<{ categoryId: string, type: 'product' | 'category', value: Partial<Product> } | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<Product>>({});
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

    const handleCommitProductOrder = (category: string, newOrder: string[]) => {
        setStyle(prev => ({
            ...prev,
            customProductOrder: { ...prev.customProductOrder, [category]: newOrder },
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
            setProducts(prev => prev.map(p => p.id === targetId ? { ...p, image: url, imageAssetId: asset.id } : p));
            if (editModeId === targetId) {
                setFormData(previous => ({ ...previous, image: url, imageAssetId: asset.id }));
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
        setProducts(prev => prev.map(p => p.id === id ? { ...p, image: '', imageAssetId: null } : p));
        if (editModeId === id) {
            setFormData(previous => ({ ...previous, image: '', imageAssetId: null }));
        }
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
            const scale = 40 / Math.max(1, imageDimensions.width, imageDimensions.height);
            setStyle(prev => ({
                ...prev,
                name: 'Custom',
                categoryImages: {
                    ...(prev.categoryImages || {}),
                    [targetCategory]: {
                        url,
                        assetId: asset.id,
                        width: Math.max(12, Math.round(imageDimensions.width * scale)),
                        height: Math.max(12, Math.round(imageDimensions.height * scale)),
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

    const startEdit = (id: string, initialData: Partial<Product>) => {
        const product = products.find(candidate => candidate.id === id);
        handlers.handleSelection(
            handlers.sortedCategories.includes(id) ? 'category' : getProductSelectionType(product),
            id
        );
        setEditModeId(id);
        setFormData(initialData);
        setMenuOpenId(null);
    };

    const cancelEdit = () => {
        setEditModeId(null);
        setNewItemDraft(null);
        setFormData({});
    };

    const initiateAdd = (categoryId: string, type: 'product' | 'category') => {
        setNewItemDraft({ categoryId, type, value: {} });
        setEditModeId('DRAFT');
        setFormData({ name: type === 'category' ? '' : '', price: 0, description: '' });
    };

    const saveEdit = () => {
        if (!editModeId) return;

        if (newItemDraft) {
            if (newItemDraft.type === 'product') {
                const newProd: Product = {
                    id: crypto.randomUUID(),
                    name: formData.name || 'Novo item',
                    price: roundPrice(formData.price),
                    description: formData.description || '',
                    category: newItemDraft.categoryId,
                    categoryId: resolveCategoryId(newItemDraft.categoryId),
                    image: ''
                };
                setProducts(prev => [...prev, newProd]);
                setStyle(prev => {
                    const current = prev.customProductOrder?.[newProd.category] || (handlers.groupedProducts[newProd.category] || []).map(p => p.id);
                    return {
                        ...prev,
                        customProductOrder: { ...prev.customProductOrder, [newProd.category]: [...current, newProd.id] },
                        name: 'Custom'
                    };
                });
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
            setNewItemDraft(null);
        } else {
            const editedProduct = products.find((product) => product.id === editModeId && !product.isFreeText);
            const nextEditedPrice = roundPrice(formData.price ?? editedProduct?.price ?? 0);
            setProducts(prev => prev.map(p => {
                if (p.id === editModeId) {
                    return editedProduct
                        ? { ...p, ...formData, price: nextEditedPrice } as Product
                        : { ...p, ...formData } as Product;
                }
                return p;
            }));
            if (editedProduct && editedProduct.price !== nextEditedPrice) {
                const request = createPricePropagationRequest({
                    productId: editedProduct.id,
                    productName: editedProduct.name,
                    previousPrice: editedProduct.price,
                    nextPrice: nextEditedPrice,
                });
                setPendingPricePropagation((current) => mergePricePropagationRequest(current, request));
            }
            if (handlers.sortedCategories.includes(editModeId)) {
                const oldName = editModeId;
                const newName = formData.name;
                if (newName && newName !== oldName) {
                    setProducts(prev => prev.map(p => p.category === oldName ? { ...p, category: newName } : p));
                    setStyle(prev => {
                        const currentOrder = prev.customCategoryOrder && prev.customCategoryOrder.length > 0
                            ? [...prev.customCategoryOrder]
                            : [...handlers.sortedCategories];
                        handlers.sortedCategories.forEach(category => {
                            if (!currentOrder.includes(category)) currentOrder.push(category);
                        });
                        const newOrder = currentOrder.map(c => c === oldName ? newName : c);
                        const newProdOrder = { ...prev.customProductOrder };
                        if (newProdOrder[oldName]) {
                            newProdOrder[newName] = newProdOrder[oldName];
                            delete newProdOrder[oldName];
                        }
                        const categoryImages = { ...(prev.categoryImages || {}) };
                        if (categoryImages[oldName]) {
                            categoryImages[newName] = categoryImages[oldName];
                            delete categoryImages[oldName];
                        }
                        return { ...prev, customCategoryOrder: newOrder, customProductOrder: newProdOrder, categoryImages, name: 'Custom' };
                    });
                }
            }
        }
        setEditModeId(null);
        setFormData({});
    };

    const applyPricePropagation = () => {
        if (!pendingPricePropagation) return;
        const sourceIds = getPricePropagationSourceIds(pendingPricePropagation);
        setProducts(previous => previous.map(product => {
            if (product.isFreeText || sourceIds.has(product.id)) return product;
            return { ...product, price: applyPriceOperations(product.price, pendingPricePropagation.operations) };
        }));
        setPendingPricePropagation(null);
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
        editModeId,
        menuOpenId,
        showInsights,
        bulkPercentage,
        bulkAdjustmentMode,
        pendingPricePropagation,
        isUploading,
        newItemDraft,
        formData,
        productImageUpload,
        categoryImageUpload,

        // Setters
        setMenuOpenId,
        setShowInsights,
        setBulkPercentage,
        setBulkAdjustmentMode,
        setFormData,

        // Refs
        productFileInputRef,
        categoryFileInputRef,

        // Handlers
        handlers,
        toggleCollapse,
        handleBulkAdjust,
        applyPricePropagation,
        dismissPricePropagation: () => setPendingPricePropagation(null),
        handleProductImageUpload,
        onProductImageClick,
        onRemoveProductImage,
        handleCategoryImageUpload,
        onCategoryImageClick,
        onRemoveCategoryImage,
        startEdit,
        cancelEdit,
        initiateAdd,
        saveEdit,
        remove,
        handleToggleVisibility,
        prepareAIImport,
        commitAIImport
    };
};
