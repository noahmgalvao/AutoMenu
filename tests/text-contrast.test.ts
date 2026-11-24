import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastRatio, needsContrastTip, suggestedContrastColor, type ContrastSample, type RGB } from '../src/domain/menu/textContrast';

test('the default description stays off the contrast tips even in cards with lower opacity', () => {
    const defaultGray: RGB = [75, 85, 99];
    const sample: ContrastSample = { background: [255, 255, 255], opacity: 0.75, minimum: 4.5 };
    assert.equal(needsContrastTip(defaultGray, sample, true), false);
    assert.equal(needsContrastTip([143, 145, 150], sample, true), true);
});

test('the suggested color leaves a contrast margin on light and dark backgrounds', () => {
    for (const [foreground, background] of [
        [[143, 145, 150], [255, 255, 255]],
        [[100, 110, 120], [20, 20, 20]],
    ] as [RGB, RGB][]) {
        const sample = { background, opacity: 0.8, minimum: 4.5 };
        const suggested = suggestedContrastColor(foreground, [sample]);
        assert.ok(suggested);
        const rgb = [1, 3, 5].map(index => parseInt(suggested.slice(index, index + 2), 16)) as unknown as RGB;
        assert.ok(contrastRatio(rgb, background, sample.opacity) >= 5.25);
    }
});
