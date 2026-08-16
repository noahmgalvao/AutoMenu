
import React, { useState, useRef } from 'react';
import {
    Product,
    MenuStyle,
    SortOption,
    AddedImage,
    BoundingBox,
    ExtractedImage,
    MenuImportMode,
} from '../types';
import { useMenuInteractions } from '../hooks/useMenuInteractions';
import { analyzeMenuImage, fileToGenerativePart } from '../services/geminiService';
import {
    createCleanBackground,
    getImageDimensions,
    processDecoration,
    sortMenuElements,
    sortSpatialElements,
} from '../utils/imageProcessor';
import { createAiImportJob } from '../services/workspaceService';
import { uploadDataUrlAsset, uploadFileAsset } from '../services/storageService';
import {
    FinalizedMenuImport,
    ProcessedMenuImport,
    processMenuImport,
} from '../services/menuImportService';
import { roundPrice } from '../utils/price';

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
    // --- STATE ---
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [editModeId, setEditModeId] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [showInsights, setShowInsights] = useState(false);
    const [bulkPercentage, setBulkPercentage] = useState<number | string>('');
    const [bulkAdjustmentMode, setBulkAdjustmentMode] = useState<'percentage' | 'integer'>('percentage');
    const [isUploading, setIsUploading] = useState(false);

    // Draft State
    const [newItemDraft, setNewItemDraft] = useState<{ categoryId: string, type: 'product' | 'category', value: Partial<Product> } | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<Product>>({});
    const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const productFileInputRef = useRef<HTMLInputElement>(null);

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
        try {
            const { asset, url } = await uploadFileAsset({
                workspaceId,
                userId: currentUserId,
                bucket: 'product-images',
                assetType: 'product_image',
                file,
                metadata: { product_id: uploadTargetId }
            });
            setProducts(prev => prev.map(p => p.id === uploadTargetId ? { ...p, image: url, imageAssetId: asset.id } : p));
        } catch (err) {
            console.error(err);
        } finally {
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
            setProducts(prev => prev.map(p => {
                if (p.id === editModeId) return { ...p, ...formData } as Product;
                return p;
            }));
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
                        return { ...prev, customCategoryOrder: newOrder, customProductOrder: newProdOrder, name: 'Custom' };
                    });
                }
            }
        }
        setEditModeId(null);
        setFormData({});
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
                    name: 'Custom'
                };
            });
        }
        setMenuOpenId(null);
    };

    // --- AI IMPORT LOGIC ---
    const handleLegacyAIImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const sourceUpload = await uploadFileAsset({
                workspaceId,
                userId: currentUserId,
                bucket: 'ai-imports',
                assetType: 'ai_source_image',
                file,
                metadata: { menu_id: currentMenuId }
            });
            const base64 = await fileToGenerativePart(file);
            const originalImageBase64 = `data:${file.type || 'image/png'};base64,${base64}`;
            const imageDimensions = await getImageDimensions(originalImageBase64);
            const res = await analyzeMenuImage(
                base64,
                file.type || 'image/png',
                imageDimensions,
            );
            const aiStyle = res.styleSuggestion || {};
            const colors = aiStyle.globalColors || {};
            const layout = aiStyle.layout || {};
            const typo = aiStyle.typography || {};
            const spacing = aiStyle.spacing || {};
            const freeTextElements = Array.isArray(aiStyle.freeTextElements)
                ? aiStyle.freeTextElements
                : [];

            const isBoundingBox = (value: any): value is BoundingBox => (
                value
                && [value.x, value.y, value.width, value.height].every((coordinate) => (
                    Number.isFinite(Number(coordinate))
                ))
                && Number(value.width) > 0
                && Number(value.height) > 0
            );

            const allBoundingBoxes: BoundingBox[] = [
                ...res.categories.flatMap((category) => [
                    category.boundingBox,
                    ...category.products.map((product) => product.boundingBox),
                ]),
                ...res.extractedImages.map((image) => image.boundingBox),
                typo.mainTitle?.boundingBox,
                typo.subtitle?.exists ? typo.subtitle?.boundingBox : undefined,
                ...freeTextElements.map((element: any) => element.boundingBox),
            ].filter(isBoundingBox);

            const cleanedBackgroundBase64 = await createCleanBackground(
                originalImageBase64,
                allBoundingBoxes,
            );
            const sortedCategories = sortMenuElements(
                res.categories,
                Number(res.styleSuggestion?.layout?.categoryColumnCount) || 1,
            );
            const sortedImages = sortSpatialElements(res.extractedImages);
            const sortedFreeTextElements = sortSpatialElements(freeTextElements);

            const A4_WIDTH = 794;
            const A4_HEIGHT = 1123;
            const processedImages = (await Promise.all(sortedImages.map(async (image) => {
                const boundingBox = image.boundingBox;
                if (!boundingBox) return null;

                try {
                    const cropBase64 = await processDecoration(file, boundingBox, {
                        foregroundType: image.type,
                        exclusionBoxes: allBoundingBoxes.filter((candidate) => candidate !== boundingBox),
                    });
                    const uploadedCrop = await uploadDataUrlAsset({
                        workspaceId,
                        userId: currentUserId,
                        bucket: 'ai-imports',
                        assetType: 'ai_extracted_asset',
                        dataUrl: cropBase64,
                        fileName: `${image.id}.png`,
                        metadata: {
                            menu_id: currentMenuId,
                            description: image.description,
                            type: image.type,
                            bounding_box: boundingBox,
                        }
                    });
                    const addedImage: AddedImage = {
                        id: image.id,
                        url: uploadedCrop.url,
                        assetId: uploadedCrop.asset.id,
                        x: (boundingBox.x / imageDimensions.width) * A4_WIDTH,
                        y: (boundingBox.y / imageDimensions.height) * A4_HEIGHT,
                        width: (boundingBox.width / imageDimensions.width) * A4_WIDTH,
                        pageIndex: 0,
                        zIndex: 1,
                        boundingBox,
                    };
                    const extractedImage: ExtractedImage = {
                        ...image,
                        url: uploadedCrop.url,
                    };
                    return { addedImage, extractedImage };
                } catch (cropError) {
                    console.warn('Falha ao recortar imagem extraída:', cropError);
                    return null;
                }
            }))).filter((result): result is {
                addedImage: AddedImage;
                extractedImage: ExtractedImage;
            } => result !== null);

            const extractedProducts: Product[] = sortedCategories.flatMap((category) => (
                category.products.map((product) => ({
                    id: product.id,
                    name: product.name,
                    description: product.description,
                    price: roundPrice(product.price),
                    category: category.name,
                    categoryId: category.id,
                    image: '',
                    boundingBox: product.boundingBox,
                    extractedImages: processedImages
                        .map(({ extractedImage }) => extractedImage)
                        .filter((image) => (
                            image.relatedProductName === product.name
                            && (!image.relatedCategoryName || image.relatedCategoryName === category.name)
                        )),
                }))
            ));

            const freeTextProducts: Product[] = sortedFreeTextElements.map((freeText: any) => ({
                id: crypto.randomUUID(),
                name: String(freeText.text || ''),
                price: 0,
                description: '',
                category: 'ft_imported',
                categoryId: null,
                image: '',
                isFreeText: true,
                customMarginTop: 10,
                boundingBox: isBoundingBox(freeText.boundingBox) ? freeText.boundingBox : undefined,
                styles: {
                    fontSize: freeText.fontSize,
                    color: freeText.color,
                    textAlign: freeText.alignment || 'left',
                    fontFamily: freeText.fontFamily,
                    fontWeight: freeText.fontWeight,
                    textTransform: freeText.textTransform
                }
            }));

            const customProductOrder: Record<string, string[]> = Object.fromEntries(
                sortedCategories.map((category) => [
                    category.name,
                    category.products.map((product) => product.id),
                ]),
            );
            if (freeTextProducts.length > 0) {
                customProductOrder.ft_imported = freeTextProducts.map((product) => product.id);
            }

            const categoryColumnCount = [1, 2, 3].includes(Number(layout.categoryColumnCount))
                ? Number(layout.categoryColumnCount) as 1 | 2 | 3
                : 1;
            const primaryColor = colors.primary || '#000000';
            const textColor = colors.text || '#1f2937';
            const newStyle: MenuStyle = {
                ...style,
                id: crypto.randomUUID(),
                name: `Design IA (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
                scope: 'workspace',
                sourceType: 'ai_import',
                menuTitle: typo.mainTitle?.text || '',
                menuSubtitle: (typo.subtitle?.exists && typo.subtitle?.text) ? typo.subtitle.text : '',
                fontFamily: typo.mainTitle?.fontFamily || style.fontFamily || 'Inter',
                primaryColor,
                backgroundColor: 'transparent',
                textColor,
                backgroundImage: cleanedBackgroundBase64,
                backgroundAssetId: null,
                sourceImage: sourceUpload.url,
                sourceAssetId: sourceUpload.asset.id,
                addedImages: processedImages.map(({ addedImage }) => addedImage),
                contentLayer: 'front',
                layoutMode: 'list',
                showImages: false,
                columnCount: 1,
                categoryColumnCount,
                pagePadding: layout.contentPadding ?? 48,
                globalRadius: layout.globalRadius ?? 0,
                itemGap: spacing.betweenProducts ?? 16,
                customCategoryOrder: [
                    ...sortedCategories.map((category) => category.name),
                    ...(freeTextProducts.length > 0 ? ['ft_imported'] : []),
                ],
                customProductOrder,
                hiddenProductIds: [],
                elementStyles: {
                    menuTitle: {
                        ...style.elementStyles.menuTitle,
                        fontFamily: typo.mainTitle?.fontFamily,
                        fontSize: typo.mainTitle?.fontSize ?? 48,
                        color: typo.mainTitle?.color || primaryColor,
                        textAlign: typo.mainTitle?.alignment || 'center',
                        textTransform: typo.mainTitle?.textTransform || 'uppercase',
                        fontWeight: '700',
                        marginBottom: spacing.titleToSubtitle ?? 10
                    },
                    menuSubtitle: {
                        ...style.elementStyles.menuSubtitle,
                        fontFamily: typo.subtitle?.fontFamily,
                        fontSize: typo.subtitle?.fontSize ?? 18,
                        color: typo.subtitle?.color || textColor,
                        textAlign: typo.mainTitle?.alignment || 'center',
                        textTransform: 'none',
                        marginBottom: 20
                    },
                    pageNumber: style.elementStyles.pageNumber,
                    category: {
                        ...style.elementStyles.category,
                        fontFamily: typo.category?.fontFamily,
                        fontSize: typo.category?.fontSize ?? 24,
                        fontWeight: '700',
                        textAlign: typo.category?.alignment || 'left',
                        color: typo.category?.color || primaryColor,
                        textTransform: typo.category?.textTransform || 'uppercase',
                        marginBottom: spacing.categoryToFirstProduct ?? 16
                    },
                    productName: {
                        ...style.elementStyles.productName,
                        fontFamily: typo.productName?.fontFamily,
                        fontSize: typo.productName?.fontSize ?? 16,
                        fontWeight: typo.productName?.fontWeight || '600',
                        textAlign: 'left',
                        color: typo.productName?.color || textColor,
                        textTransform: 'none'
                    },
                    productPrice: {
                        ...style.elementStyles.productPrice,
                        fontFamily: typo.productPrice?.fontFamily,
                        fontSize: typo.productPrice?.fontSize ?? 16,
                        fontWeight: '700',
                        textAlign: 'right',
                        color: typo.productPrice?.color || colors.secondary || primaryColor
                    },
                    productDescription: {
                        ...style.elementStyles.productDescription,
                        fontFamily: typo.productDescription?.fontFamily,
                        fontSize: typo.productDescription?.fontSize ?? 12,
                        fontWeight: '400',
                        textAlign: 'left',
                        color: typo.productDescription?.color || textColor,
                        italic: typo.productDescription?.fontStyle === 'italic'
                    }
                }
            };

            const finalProducts = [...extractedProducts, ...freeTextProducts];
            setProducts(finalProducts);
            setStyle(newStyle);
            if (setTemplates) {
                setTemplates((previousTemplates) => [newStyle, ...previousTemplates]);
            }

            await createAiImportJob({
                workspaceId,
                sourceAssetId: sourceUpload.asset.id,
                createdMenuId: currentMenuId,
                normalizedResult: {
                    categories: sortedCategories,
                    products: extractedProducts,
                    extractedImages: processedImages.map(({ extractedImage }) => extractedImage),
                    styleSuggestion: res.styleSuggestion,
                    pendingTemplateId: newStyle.id
                }
            });
            alert(`Importação concluída: ${extractedProducts.length} produtos e ${processedImages.length} imagens extraídas.`);
        } catch (err) {
            console.error(err);
            alert("Erro ao importar cardápio. Tente novamente.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const prepareAIImport = async (
        files: File[],
        importMode: MenuImportMode
    ): Promise<ProcessedMenuImport> => {
        if (files.length === 0) throw new Error('Nenhuma página foi selecionada.');
        setIsUploading(true);

        try {
            const imported = await processMenuImport({
                files,
                importMode,
                currentProducts: products,
                currentStyle: style,
                workspaceId,
                userId: currentUserId,
                menuId: currentMenuId,
            });

            await createAiImportJob({
                workspaceId,
                sourceAssetId: imported.sourceAssetId,
                createdMenuId: currentMenuId,
                normalizedResult: imported.normalizedResult,
            });
            return imported;
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
        isUploading,
        newItemDraft,
        formData,

        // Setters
        setMenuOpenId,
        setShowInsights,
        setBulkPercentage,
        setBulkAdjustmentMode,
        setFormData,

        // Refs
        fileInputRef,
        productFileInputRef,

        // Handlers
        handlers,
        toggleCollapse,
        handleBulkAdjust,
        handleProductImageUpload,
        onProductImageClick,
        onRemoveProductImage,
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
