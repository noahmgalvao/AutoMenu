import assert from 'node:assert/strict';
import test from 'node:test';
import { fitBorder, type BorderGeometry } from '../src/domain/menu/borderFitting';
import type { MenuBorder } from '../src/domain/menu/model';

test('rounding follows the actual corners of the text instead of the narrowest straight edge', () => {
    const edge = { inner: -6, outer: 24 };
    const geometry: BorderGeometry = {
        width: 160, height: 50, enclosesSurface: false,
        space: { left: edge, right: edge, top: edge, bottom: edge },
        textBounds: [{ left: 48, right: 112, top: 6, bottom: 44 }],
    };
    const border: MenuBorder = {
        color: '#000000', sides: ['left', 'right', 'top', 'bottom'], thickness: 2,
        radius: 25, length: 100, offset: 0, pattern: 'solid',
    };
    assert.equal(fitBorder(border, geometry).border.radius, 25);
    const textAtCorner = { ...geometry, textBounds: [{ left: 4, right: 100, top: 4, bottom: 44 }] };
    const safe = fitBorder(border, textAtCorner);
    assert.ok(safe.border.radius > 0 && safe.border.radius < 25);
    assert.ok(fitBorder({ ...border, offset: 10 }, textAtCorner).border.radius > safe.border.radius);
});
