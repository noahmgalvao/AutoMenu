
import { useMemo } from 'react';
import { Product, MenuStyle, SortOption } from '../../types';

interface UseMenuDataProps {
    products: Product[];
    style: MenuStyle;
    sortOption: SortOption;
}

export const useMenuData = ({ products, style, sortOption }: UseMenuDataProps) => {
    
    // 1. Organize Data (Base)
    const groupedProductsBase = useMemo(() => {
        const groups: Record<string, Product[]> = {};
        // REMOVED: const hiddenSet = new Set(style.hiddenProductIds || []); 
        // We do NOT filter hidden items here anymore. 
        // They must remain in the data structure for the Product Designer to show them as "grayed out".
        // Filtering for the Preview happens in utils/menuPagination.ts.

        products.forEach(p => {
            // REMOVED: if (hiddenSet.has(p.id)) return;
            if (!groups[p.category]) groups[p.category] = [];
            groups[p.category].push(p);
        });

        Object.keys(groups).forEach(cat => {
            const customOrder = style.customProductOrder?.[cat];
            groups[cat].sort((a, b) => {
                if (customOrder) {
                    const idxA = customOrder.indexOf(a.id);
                    const idxB = customOrder.indexOf(b.id);
                    if (idxA !== -1 && idxB !== -1) return (idxA as number) - (idxB as number);
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                }
                let valA: any = a[sortOption.field];
                let valB: any = b[sortOption.field];
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                if (valA < valB) return sortOption.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortOption.direction === 'asc' ? 1 : -1;
                return 0;
            });
        });
        return groups;
    }, [products, style.customProductOrder, sortOption]); // Removed style.hiddenProductIds dependency as we don't filter by it here anymore

    // 2. Sort Categories (Base)
    const sortedCategoriesBase = useMemo(() => {
        const cats = Object.keys(groupedProductsBase);
        const customOrder = style.customCategoryOrder || [];
        return cats.sort((a, b) => {
            const idxA = customOrder.indexOf(a);
            const idxB = customOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return (idxA as number) - (idxB as number);
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            const comparison = a.localeCompare(b, undefined, { sensitivity: 'base' });
            return sortOption.field === 'category' && sortOption.direction === 'desc'
                ? -comparison
                : comparison;
        });
    }, [groupedProductsBase, sortOption.direction, sortOption.field, style.customCategoryOrder]);

    return {
        groupedProductsBase,
        sortedCategoriesBase
    };
};
