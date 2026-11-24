export type RGB = readonly [number, number, number];

const linear = (channel: number) => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: RGB) => .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);

export const blendColor = (top: RGB, bottom: RGB, alpha: number): RGB =>
    [0, 1, 2].map(i => top[i] * alpha + bottom[i] * (1 - alpha)) as unknown as RGB;

export function contrastRatio(foreground: RGB, background: RGB, opacity = 1) {
    const text = luminance(blendColor(foreground, background, opacity));
    const surface = luminance(background);
    return (Math.max(text, surface) + .05) / (Math.min(text, surface) + .05);
}

export const hexColor = (rgb: RGB) => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');

export type ContrastSample = { background: RGB; minimum: number; opacity: number };

export function nearestContrastingColor(original: RGB, samples: ContrastSample[]) {
    const meets = (color: RGB) => samples.every(({ background, minimum, opacity }) =>
        contrastRatio(color, background, opacity) >= minimum);
    const black: RGB = [0, 0, 0];
    const white: RGB = [255, 255, 255];
    const search = (start: RGB) => {
        return [black, white].flatMap(end => {
            for (let step = 0; step <= 255; step++) {
                const value = blendColor(end, start, step / 255).map(Math.round) as unknown as RGB;
                if (meets(value)) return [value];
            }
            return [];
        });
    };
    const options = search(original);
    if (!options.length) options.push(...search([117, 117, 117]));
    const distance = (value: RGB) => value.reduce((sum, channel, index) => sum + (channel - original[index]) ** 2, 0);
    options.sort((a, b) => distance(a) - distance(b));
    return options.length ? hexColor(options[0]) : null;
}


// The tip is advisory. Allow small differences in subdued descriptions while aiming
// above the minimum when we suggest a new color.
export function needsContrastTip(color: RGB, sample: ContrastSample, subduedDescription: boolean) {
    const tolerance = subduedDescription ? 0.6 : 0;
    return contrastRatio(color, sample.background, sample.opacity) < sample.minimum - tolerance;
}

export function suggestedContrastColor(original: RGB, samples: ContrastSample[]) {
    const higherContrast = samples.map(sample => ({ ...sample, minimum: sample.minimum + 0.75 }));
    return nearestContrastingColor(original, higherContrast) ?? nearestContrastingColor(original, samples);
}
