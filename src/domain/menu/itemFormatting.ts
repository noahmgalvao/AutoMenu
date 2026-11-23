import type { CategoryDividerStyle, ElementStyle, MenuStyle, Product } from './model';

export type FormattingKind = 'category' | 'product';
export const formattingLabels = { category: 'Categorias', product: 'Produtos' };
const fields = {
    category: { text: ['category'], borders: ['category', 'categoryGroup'], fills: ['category', 'categoryGroup'] },
    product: { text: ['productName', 'productPrice', 'productDescription'], borders: ['product', 'price', 'productImage'], fills: ['price', 'productImage'] },
} as const;
export type ItemTextField = typeof fields[FormattingKind]['text'][number];

type Formatting = Pick<MenuStyle, 'elementColorOverrides' | 'borders' | 'fills' | 'markers'
    | 'cardBackgroundColor' | 'cardBackgroundColorOverride'> & {
    elementStyles: Partial<Record<ItemTextField, ElementStyle>>;
    divider: CategoryDividerStyle;
};
type Patch<T> = { [K in keyof T]?: NonNullable<T[K]> extends readonly unknown[] ? T[K] | null
    : NonNullable<T[K]> extends object ? Patch<NonNullable<T[K]>> | null : T[K] | null };
export type ItemFormattingOverrides = Partial<Record<FormattingKind, Record<string, Patch<Formatting>>>>;

type Values = Record<string, unknown>;
const isRecord = (value: unknown): value is Values => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function signature(value: unknown): string {
    if (isRecord(value)) return JSON.stringify(Object.keys(value).filter(key => value[key] !== undefined)
        .sort().map(key => [key, signature(value[key])]));
    return JSON.stringify(value) ?? '';
}

function difference(before: Values, after: Values): Values {
    const entries: [string, unknown][] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const previous = before[key];
        const next = after[key];
        if (isRecord(previous) && isRecord(next)) {
            const patch = difference(previous, next);
            if (Object.keys(patch).length) entries.push([key, patch]);
        } else if (signature(previous) !== signature(next)) {
            entries.push([key, next ?? null]);
        }
    }
    return Object.fromEntries(entries);
}

function merge<T extends object>(base: T, patch: Values): T {
    const changes = Object.entries(patch).map(([key, value]) => {
        const inherited = base[key as keyof T];
        return [key, isRecord(value) ? merge<Values>(isRecord(inherited) ? inherited : {}, value) : value ?? undefined];
    });
    return { ...base, ...Object.fromEntries(changes) };
}

function pick<K extends string, V>(source: Partial<Record<K, V>> | undefined, keys: readonly K[]) {
    return Object.fromEntries(keys.flatMap(key => source?.[key] === undefined ? [] : [[key, source[key]]])) as Partial<Record<K, V>>;
}

function dividerField(kind: FormattingKind) {
    return kind === 'category' ? 'categoryDividerStyle' : 'productDividerStyle';
}

function dividerOverridesField(kind: FormattingKind) {
    return kind === 'category' ? 'categoryDividerStyles' : 'productDividerStyles';
}

function readFormatting(style: MenuStyle, kind: FormattingKind, id?: string): Formatting {
    const scope = fields[kind];
    return {
        elementStyles: pick(style.elementStyles, scope.text),
        elementColorOverrides: pick(style.elementColorOverrides, scope.text),
        borders: pick(style.borders, scope.borders),
        fills: pick(style.fills, scope.fills),
        markers: { [kind]: style.markers?.[kind] ?? (kind === 'category' && style.design?.category === 'numbered' ? 'number-padded' : 'none') },
        ...(kind === 'product' && {
            cardBackgroundColor: style.cardBackgroundColor,
            cardBackgroundColorOverride: style.cardBackgroundColorOverride || undefined,
        }),
        divider: (id === undefined ? undefined : style[dividerOverridesField(kind)]?.[id]) ?? style[dividerField(kind)]
            ?? (kind === 'category' ? style.design?.divider ?? 'solid' : 'none'),
    };
}

function effectiveFormatting(style: MenuStyle, kind: FormattingKind, id: string) {
    const inherited = readFormatting(style, kind, id);
    const override = style.itemFormattingOverrides?.[kind]?.[id];
    return override ? merge(inherited, override) : inherited;
}

function withFormatting(style: MenuStyle, kind: FormattingKind, formatting: Formatting, id?: string): MenuStyle {
    const scope = fields[kind];
    const elementStyles = { ...style.elementStyles, ...Object.fromEntries(scope.text.map(key => [key, formatting.elementStyles?.[key]])) };
    const elementColorOverrides = { ...style.elementColorOverrides, ...Object.fromEntries(scope.text.map(key => [key, formatting.elementColorOverrides?.[key]])) };
    const borders = { ...style.borders, ...Object.fromEntries(scope.borders.map(key => [key, formatting.borders?.[key]])) };
    const fills = { ...style.fills, ...Object.fromEntries(scope.fills.map(key => [key, formatting.fills?.[key]])) };
    return {
        ...style,
        elementStyles,
        elementColorOverrides,
        borders,
        fills,
        markers: { ...style.markers, [kind]: formatting.markers?.[kind] },
        ...(kind === 'product' && {
            cardBackgroundColor: formatting.cardBackgroundColor,
            cardBackgroundColorOverride: formatting.cardBackgroundColorOverride,
        }),
        ...(id === undefined
            ? { [dividerField(kind)]: formatting.divider }
            : { [dividerOverridesField(kind)]: { ...style[dividerOverridesField(kind)], [id]: formatting.divider } }),
    };
}

export function getItemFormattingStyle(style: MenuStyle, kind: FormattingKind, id: string) {
    return style.itemFormattingOverrides?.[kind]?.[id]
        ? withFormatting(style, kind, effectiveFormatting(style, kind, id), id)
        : style;
}

export function setItemDivider(style: MenuStyle, kind: FormattingKind, id: string, divider: CategoryDividerStyle): MenuStyle {
    return { ...style, [dividerOverridesField(kind)]: { ...style[dividerOverridesField(kind)], [id]: divider }, name: 'Custom' };
}

export function getFormattingItems(products: Product[]) {
    const realProducts = products.filter(product => !product.isFreeText);
    return {
        category: [...new Set(realProducts.map(product => product.category))],
        product: realProducts.map(product => product.id),
    };
}

export function getFormattingGroups(style: MenuStyle, kind: FormattingKind, ids: readonly string[]) {
    if (!ids.length) return [];
    if (!Object.keys(style.itemFormattingOverrides?.[kind] ?? {}).length
        && !Object.keys(style[dividerOverridesField(kind)] ?? {}).length) return [[...ids]];
    const groups = new Map<string, string[]>();
    for (const id of ids) {
        const { elementColorOverrides, elementStyles, ...format } = effectiveFormatting(style, kind, id);
        const text = Object.fromEntries(Object.entries(elementStyles).map(([field, value]) => [
            field,
            {
                ...value,
                fontFamily: value?.fontFamily || style.fontFamily,
                color: value?.color || (kind === 'category' ? style.primaryColor : style.textColor),
                fontWeight: value?.fontWeight === 'bold' ? '700' : value?.fontWeight === 'normal' ? '400' : value?.fontWeight,
                italic: Boolean(value?.italic),
                underline: Boolean(value?.underline),
                textTransform: value?.textTransform || 'none',
            },
        ]));
        const key = signature({ ...format, elementStyles: text });
        const group = groups.get(key);
        if (group) group.push(id);
        else groups.set(key, [id]);
    }
    return [...groups.values()].sort((left, right) => right.length - left.length);
}

export type FormattingScope = 'all' | 'group' | 'selection';

export function updateItemFormatting(
    style: MenuStyle, kind: FormattingKind, id: string, ids: readonly string[], scope: FormattingScope,
    selectedIds: readonly string[], recipe: (style: MenuStyle) => MenuStyle,
): MenuStyle {
    const anchor = effectiveFormatting(style, kind, id);
    const projected = withFormatting(style, kind, anchor, id);
    const updated = recipe(projected);
    const changed = difference(anchor, readFormatting(updated, kind, id));
    if (!Object.keys(changed).length) return style;

    const group = scope === 'group' ? getFormattingGroups(style, kind, ids).find(items => items.includes(id)) : undefined;
    const targets = scope === 'all' ? ids : scope === 'selection' ? selectedIds : group ?? [id];
    const base = scope === 'all'
        ? withFormatting(style, kind, merge(readFormatting(style, kind), changed))
        : style;
    const overrides = { ...style.itemFormattingOverrides?.[kind] };
    for (const target of targets) {
        const next = merge(effectiveFormatting(style, kind, target), changed);
        const override = difference(readFormatting(base, kind, target), next);
        if (Object.keys(override).length) overrides[target] = override;
        else delete overrides[target];
    }
    return {
        ...base,
        itemFormattingOverrides: { ...style.itemFormattingOverrides, [kind]: overrides },
        pageBreaks: updated.pageBreaks,
        name: 'Custom',
    };
}

export function standardizeItemFormatting(style: MenuStyle, kind: FormattingKind, id: string): MenuStyle {
    return {
        ...withFormatting(style, kind, effectiveFormatting(style, kind, id)),
        [dividerOverridesField(kind)]: undefined,
        itemFormattingOverrides: { ...style.itemFormattingOverrides, [kind]: undefined },
        pageBreaks: [],
        name: 'Custom',
    };
}

export function setElementFormatting(style: MenuStyle, field: keyof MenuStyle['elementStyles'], next: ElementStyle): MenuStyle {
    const previous = style.elementStyles[field] || {};
    const sizeReduced = field !== 'pageNumber' && Number(next.fontSize) > 0 && Number(next.fontSize) < Number(previous.fontSize);
    return {
        ...style,
        elementStyles: { ...style.elementStyles, [field]: next },
        elementColorOverrides: previous.color !== next.color
            ? { ...style.elementColorOverrides, [field]: true } : style.elementColorOverrides,
        pageBreaks: sizeReduced ? [] : style.pageBreaks,
        name: 'Custom',
    };
}
