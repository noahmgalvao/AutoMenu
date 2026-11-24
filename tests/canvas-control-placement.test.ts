import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlRail, placeCanvasControl } from '../src/presentation/menu/canvas/canvasControlPlacement';

const visible = { left: 4, right: 356, top: 56, bottom: 408 };
const target = { left: 36, right: 282, top: 195, bottom: 212 };

test('the rail stays left, mirrors right when clipped, and remains reachable when both corners leave the viewport', () => {
    assert.deepEqual(controlRail(target, visible), { edge: 36, side: 1 });
    assert.deepEqual(controlRail({ ...target, left: -40 }, visible), { edge: 282, side: -1 });
    assert.deepEqual(controlRail({ ...target, left: -40, right: 412 }, visible), { edge: 8, side: 1 });
    assert.equal(controlRail({ ...target, left: 6 }, visible, -1).side, -1);
    assert.equal(controlRail({ ...target, left: 6 }, visible, 1).side, 1);
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
