import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL_STYLE } from '../src/domain/menu/defaults';
import { getFormattingGroups, getItemFormattingStyle, setElementFormatting, setItemDivider, standardizeItemFormatting, updateItemFormatting } from '../src/domain/menu/itemFormatting';
import type { MenuStyle } from '../src/domain/menu/model';

test('category formatting follows the selection, then its group, and can standardize from any group', () => {
    const ids = ['Entradas', 'Principais', 'Doces', 'Bebidas', 'Especiais'];
    let style: MenuStyle = INITIAL_STYLE;
    const edit = (size: number) => (current: MenuStyle) => setElementFormatting(current, 'category', {
        ...current.elementStyles.category, fontSize: size,
    });
    const secondGroup = ids.slice(3);
    style = updateItemFormatting(style, 'category', 'Bebidas', ids, 'selection', secondGroup, edit(30));
    assert.deepEqual(getFormattingGroups(style, 'category', ids), [ids.slice(0, 3), secondGroup]);
    style = updateItemFormatting(style, 'category', 'Especiais', ids, 'group', ['Especiais'], edit(36));
    assert.deepEqual(ids.map(id => getItemFormattingStyle(style, 'category', id).elementStyles.category.fontSize),
        [INITIAL_STYLE.elementStyles.category.fontSize, INITIAL_STYLE.elementStyles.category.fontSize,
            INITIAL_STYLE.elementStyles.category.fontSize, 36, 36]);

    style = standardizeItemFormatting(JSON.parse(JSON.stringify(style)), 'category', 'Bebidas');
    assert.equal(style.elementStyles.category.fontSize, 36);
    assert.deepEqual(getFormattingGroups(style, 'category', ids), [ids]);
});

test('editing all products applies only the changed property and respects local resets saved as JSON', () => {
    const ids = ['first', 'second', 'third'];
    const initial: MenuStyle = {
        ...INITIAL_STYLE,
        productDividerStyles: { second: 'double' },
        elementStyles: { ...INITIAL_STYLE.elementStyles, productName: {
            ...INITIAL_STYLE.elementStyles.productName, textOutline: { color: '#000000', width: 2 },
        } },
    };
    const selection = updateItemFormatting(initial, 'product', 'second', ids, 'selection', ['second'], current =>
        setElementFormatting(current, 'productName', { ...current.elementStyles.productName, textOutline: undefined, italic: true }));
    const saved: MenuStyle = JSON.parse(JSON.stringify(selection));
    assert.equal(getItemFormattingStyle(saved, 'product', 'second').elementStyles.productName.textOutline, undefined);
    assert.deepEqual(getFormattingGroups(saved, 'product', ids), [['first', 'third'], ['second']]);

    const all = updateItemFormatting(saved, 'product', 'second', ids, 'all', ids, current =>
        setElementFormatting(current, 'productName', { ...current.elementStyles.productName, underline: true }));
    for (const id of ids) {
        const name = getItemFormattingStyle(all, 'product', id).elementStyles.productName;
        assert.equal(name.underline, true);
        assert.equal(Boolean(name.italic), id === 'second');
        assert.equal(Boolean(name.textOutline), id !== 'second');
    }

    const line = updateItemFormatting(all, 'product', 'second', ids, 'group', ['second'], current =>
        setItemDivider(current, 'product', 'second', 'dashed'));
    const consistent = standardizeItemFormatting(line, 'product', 'second');
    assert.equal(consistent.productDividerStyle, 'dashed');
    assert.equal(consistent.productDividerStyles, undefined);
    assert.deepEqual(getFormattingGroups(consistent, 'product', ids), [ids]);
});
