import type { BoundingBox, MenuCategory } from './model';

const SPATIAL_ROW_TOLERANCE = 30;

type SpatialElement = { boundingBox?: BoundingBox };

export const sortSpatialElements = <T extends SpatialElement>(
    elements: T[],
    rowTolerance = SPATIAL_ROW_TOLERANCE,
): T[] => {
    const positioned = elements
        .map((element, originalIndex) => ({ element, originalIndex }))
        .filter(({ element }) => Boolean(element.boundingBox))
        .sort((left, right) => {
            const leftBox = left.element.boundingBox as BoundingBox;
            const rightBox = right.element.boundingBox as BoundingBox;
            return leftBox.y - rightBox.y
                || leftBox.x - rightBox.x
                || left.originalIndex - right.originalIndex;
        });
    const unpositioned = elements.filter((element) => !element.boundingBox);
    const rows: Array<{ anchorY: number; entries: typeof positioned }> = [];

    positioned.forEach((entry) => {
        const y = (entry.element.boundingBox as BoundingBox).y;
        const currentRow = rows[rows.length - 1];
        if (!currentRow || y - currentRow.anchorY > rowTolerance) {
            rows.push({ anchorY: y, entries: [entry] });
        } else {
            currentRow.entries.push(entry);
        }
    });

    const sortedPositioned = rows.flatMap((row) => (
        row.entries
            .sort((left, right) => {
                const leftBox = left.element.boundingBox as BoundingBox;
                const rightBox = right.element.boundingBox as BoundingBox;
                return leftBox.x - rightBox.x
                    || leftBox.y - rightBox.y
                    || left.originalIndex - right.originalIndex;
            })
            .map(({ element }) => element)
    ));

    return [...sortedPositioned, ...unpositioned];
};

const sortSpatialColumns = <T extends SpatialElement>(
    elements: T[],
    requestedColumnCount: number,
): T[] => {
    const positioned = elements
        .map((element, originalIndex) => ({ element, originalIndex }))
        .filter(({ element }) => Boolean(element.boundingBox))
        .sort((left, right) => {
            const leftBox = left.element.boundingBox as BoundingBox;
            const rightBox = right.element.boundingBox as BoundingBox;
            return leftBox.x - rightBox.x
                || leftBox.y - rightBox.y
                || left.originalIndex - right.originalIndex;
        });
    const unpositioned = elements.filter((element) => !element.boundingBox);
    const columnCount = Math.max(1, Math.min(
        Math.round(requestedColumnCount),
        positioned.length,
    ));
    if (columnCount <= 1 || positioned.length <= 1) {
        return sortSpatialElements(elements);
    }

    const gaps = positioned.slice(0, -1)
        .map((entry, index) => {
            const currentX = (entry.element.boundingBox as BoundingBox).x;
            const nextX = (positioned[index + 1].element.boundingBox as BoundingBox).x;
            return { cutAfter: index, gap: nextX - currentX };
        })
        .filter(({ gap }) => gap > SPATIAL_ROW_TOLERANCE)
        .sort((left, right) => right.gap - left.gap)
        .slice(0, columnCount - 1)
        .map(({ cutAfter }) => cutAfter)
        .sort((left, right) => left - right);

    if (gaps.length === 0) return sortSpatialElements(elements);

    const columns: typeof positioned[] = [];
    let columnStart = 0;
    gaps.forEach((cutAfter) => {
        columns.push(positioned.slice(columnStart, cutAfter + 1));
        columnStart = cutAfter + 1;
    });
    columns.push(positioned.slice(columnStart));

    const sortedPositioned = columns.flatMap((column) => (
        column
            .sort((left, right) => {
                const leftBox = left.element.boundingBox as BoundingBox;
                const rightBox = right.element.boundingBox as BoundingBox;
                return leftBox.y - rightBox.y
                    || leftBox.x - rightBox.x
                    || left.originalIndex - right.originalIndex;
            })
            .map(({ element }) => element)
    ));

    return [...sortedPositioned, ...unpositioned];
};

export const sortMenuElements = (
    categories: MenuCategory[],
    categoryColumnCount = 1,
): MenuCategory[] => (
    categoryColumnCount > 1
        ? sortSpatialColumns(categories, categoryColumnCount)
        : sortSpatialElements(categories)
).map((category) => ({
    ...category,
    products: sortSpatialElements(category.products),
}));
