import type { MenuStyle, Product, SortOption } from './model';

function compareCustomOrder(left: string, right: string, order: string[]) {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return undefined;
}

export function groupProductsInMenuOrder(
    products: Product[],
    customProductOrder: MenuStyle['customProductOrder'],
    sortOption: SortOption,
) {
    const groups: Record<string, Product[]> = {};
    // The product list also uses these groups to display hidden products.
    products.forEach(product => {
        if (!groups[product.category]) groups[product.category] = [];
        groups[product.category].push(product);
    });

    for (const [category, group] of Object.entries(groups)) {
        const order = customProductOrder?.[category];
        group.sort((left, right) => {
            if (order) {
                const ranked = compareCustomOrder(left.id, right.id, order);
                if (ranked !== undefined) return ranked;
            }
            const leftValue = left[sortOption.field];
            const rightValue = right[sortOption.field];
            const a = typeof leftValue === 'string' ? leftValue.toLowerCase() : leftValue;
            const b = typeof rightValue === 'string' ? rightValue.toLowerCase() : rightValue;
            if (a < b) return sortOption.direction === 'asc' ? -1 : 1;
            if (a > b) return sortOption.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return groups;
}

export function sortMenuCategories(categories: string[], customOrder: string[] | undefined, descending: boolean) {
    const order = customOrder || [];
    return [...categories].sort((left, right) => {
        const ranked = compareCustomOrder(left, right, order);
        if (ranked !== undefined) return ranked;
        const comparison = left.localeCompare(right, undefined, { sensitivity: 'base' });
        return descending ? -comparison : comparison;
    });
}
