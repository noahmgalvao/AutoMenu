import assert from 'node:assert/strict';
import test from 'node:test';
import { snapCanvasBox } from '../src/presentation/menu/interactions/canvasAlignment';

test('the page midpoint aligns the moving center even when another object is centered there', () => {
    const page = { left: 0, top: 0, width: 800, height: 1000 };
    const otherObjects = [{ left: 300, top: 200, width: 200, height: 40 }];
    const moving = { left: 0, top: 700, width: 60, height: 40 };
    for (const left of [340, 400]) {
        assert.deepEqual(snapCanvasBox({ ...moving, left }, page, otherObjects, ['x']).guides, []);
    }
    const centered = snapCanvasBox({ ...moving, left: 373 }, page, otherObjects, ['x']);
    assert.deepEqual(centered.guides, [{ axis: 'x', at: 400 }]);
    assert.equal(centered.left, 370);
    const edge = snapCanvasBox({ ...moving, left: 297 }, page, otherObjects, ['x']);
    assert.deepEqual(edge.guides, [{ axis: 'x', at: 300, span: [200, 740] }]);
    assert.equal(edge.left, 300);
});
