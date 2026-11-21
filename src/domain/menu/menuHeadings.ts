import type { MenuStyle } from './model';

export const menuHeadingFields = ['menuTitle', 'menuSubtitle'] as const;
export type MenuHeadingField = typeof menuHeadingFields[number];
export type HeadingPages = Partial<Record<MenuHeadingField, 'all' | number[]>>;

export function headingIsOnPage(style: MenuStyle, field: MenuHeadingField, pageIndex: number, legacyCopy = false) {
    if (!(style[field] ?? (field === 'menuTitle' ? 'MENU' : '')).trim()) return false;
    const pages = style.headingPages?.[field];
    return pages === 'all' || (pages ? pages.includes(pageIndex)
        : style.templateHeadingVisibility?.[field] !== false && (pageIndex === 0 || legacyCopy));
}

export const headingSelectionId = (field: MenuHeadingField, pageIndex: number) =>
    pageIndex === 0 ? field : `${field}:${pageIndex}`;

export const headingPageIndex = (id: string) => Number(id.split(':')[1] || 0);

export const headingElementId = (field: MenuHeadingField, pageIndex: number) =>
    `menu-${field === 'menuTitle' ? 'title' : 'subtitle'}-text${pageIndex ? `-${pageIndex}` : ''}`;

export const headingMeasurementKey = (title: boolean, subtitle: boolean) =>
    `main-header:${Number(title)}${Number(subtitle)}`;

export function remapHeadingPages(style: MenuStyle, map: (index: number) => number | undefined): HeadingPages | undefined {
    const result = { ...style.headingPages };
    for (const field of menuHeadingFields) {
        const visibility = result[field];
        if (visibility === 'all') continue;
        if (!visibility && map(0) === 0) continue;
        result[field] = (visibility ?? [0]).flatMap(index => {
            const shifted = map(index);
            return shifted === undefined ? [] : [shifted];
        });
    }
    return Object.keys(result).length ? result : undefined;
}
