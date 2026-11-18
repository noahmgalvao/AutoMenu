import { useMemo } from 'react';
import { groupProductsInMenuOrder, sortMenuCategories } from '../../../domain/menu/menuOrdering';
import type { MenuStyle, Product, SortOption } from '../../../domain/menu/model';

interface UseMenuDataProps {
    products: Product[];
    style: MenuStyle;
    sortOption: SortOption;
}

export const useMenuData = ({ products, style, sortOption }: UseMenuDataProps) => {
    const { customProductOrder, customCategoryOrder } = style;
    const { field, direction } = sortOption;
    const groupedProductsBase = useMemo(() => groupProductsInMenuOrder(products, customProductOrder, sortOption),
        [products, customProductOrder, sortOption]);
    const sortedCategoriesBase = useMemo(() => sortMenuCategories(Object.keys(groupedProductsBase), customCategoryOrder,
        field === 'category' && direction === 'desc'), [groupedProductsBase, customCategoryOrder, field, direction]);

    return { groupedProductsBase, sortedCategoriesBase };
};
