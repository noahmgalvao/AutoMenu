import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveContiguousSelection } from '../src/domain/menu/selectionOrder';

test('moves adjacent selected items one step as a single block in visual order', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const selected = new Set(['c', 'b']);
    assert.deepEqual(moveContiguousSelection(order, order, selected, true), ['b', 'c', 'a', 'd', 'e']);
    assert.deepEqual(moveContiguousSelection(order, order, selected, false), ['a', 'd', 'b', 'c', 'e']);
    assert.equal(moveContiguousSelection(order, order, new Set(['a', 'b']), true), order);
    assert.equal(moveContiguousSelection(order, order, new Set(['b', 'd']), false), null);
});

test('uses visible neighbors while retaining every hidden item in the saved order', () => {
    const order = ['a', 'b', 'hidden', 'c', 'd'];
    const visible = ['a', 'b', 'c', 'd'];
    const selected = new Set(['b', 'c']);
    assert.deepEqual(moveContiguousSelection(order, visible, selected, false), ['a', 'hidden', 'd', 'b', 'c']);
});
