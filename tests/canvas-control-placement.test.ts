import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlBoxContains, controlBoxesOverlap, getObjectControlBox, placeCanvasControl } from '../src/presentation/menu/canvas/canvasControlPlacement';

const visible = { left: 4, right: 356, top: 56, bottom: 408 };
const target = { left: 36, right: 282, top: 195, bottom: 212 };

test('insertions bracket the selected range and keep the same position relative to the object at any zoom', () => {
    const last = { ...target, top: 248, bottom: 265 };
    const before = getObjectControlBox(target, 'insert', 'top', 28, 28);
    const after = getObjectControlBox(last, 'insert', 'bottom', 28, 28);
    assert.equal(before.left, after.left);
    assert.equal(target.top - before.bottom, 2);
    assert.equal(after.top - last.bottom, 2);
    assert.equal(controlBoxesOverlap(before, target), false);
    assert.equal(controlBoxesOverlap(after, last), false);

    const taller = { ...target, right: 340, bottom: 300 };
    const bottom = getObjectControlBox(taller, 'insert', 'bottom', 28, 28);
    assert.equal(bottom.top - taller.bottom, 2);
    assert.equal(bottom.left - taller.left, before.left - target.left);
});

test('only a control whose official area is entirely within the visible canvas is shown', () => {
    const nearTop = { ...target, top: 72, bottom: 94 };
    assert.equal(controlBoxContains(visible, getObjectControlBox(nearTop, 'insert', 'top', 28, 28)), false);
    assert.equal(controlBoxContains(visible, getObjectControlBox(nearTop, 'insert', 'bottom', 28, 28)), true);
    const clipped = { ...target, left: -10 };
    assert.equal(controlBoxContains(visible, getObjectControlBox(clipped, 'flow', 'bottom', 28, 28)), false);
});

test('the shortcut bar yields to the insert and move controls and stays inside the visible canvas at low zoom', () => {
    const move = placeCanvasControl(-6, 165, 44, 92, visible, [], false);
    const insert = placeCanvasControl(move.right + 4, 165, 44, 92, visible, [move], false);
    const preferred = placeCanvasControl(120, 145, 144, 44, visible, [move, insert], true);
    assert.deepEqual(preferred, { left: 120, top: 145, right: 264, bottom: 189 });

    const quick = () => placeCanvasControl(-88, 145, 144, 44, visible, [move, insert], true);
    const bar = quick();
    assert.deepEqual(bar, quick());
    assert.ok(bar.left >= visible.left && bar.right <= visible.right);
    assert.ok(bar.top >= visible.top && bar.bottom <= visible.bottom);
    for (const blocker of [move, insert]) {
        assert.ok(bar.left >= blocker.right || bar.right <= blocker.left || bar.bottom <= blocker.top || bar.top >= blocker.bottom);
    }
});


test('small changes in available space keep a valid control position until the preferred one has room again', () => {
    const occupied = [{ left: 94, right: 145, top: 131, bottom: 170 }];
    const first = placeCanvasControl(100, 132, 80, 38, visible, occupied, true);
    const offset = { x: first.left - 100, y: first.top - 132 };
    assert.deepEqual(placeCanvasControl(101, 132, 80, 38, visible, occupied, true, offset),
        { ...first, left: first.left + 1, right: first.right + 1 });
    assert.equal(placeCanvasControl(101, 132, 80, 38, visible, [], true, offset).top, 132);
});
