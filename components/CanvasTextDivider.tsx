import React, { useLayoutEffect, useRef } from 'react';
import type { CategoryDividerStyle } from '../types';
import { getCategoryDividerStyle } from '../utils/categoryDividers';

export function CanvasTextDivider({ preset, color, titleEdge }: {
    preset: CategoryDividerStyle;
    color: string;
    titleEdge: 'left' | 'right';
}) {
    const ref = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
        const line = ref.current;
        const row = line?.parentElement;
        const text = row?.querySelector<HTMLElement>('[data-divider-title]');
        if (!line || !row || !text) return;
        let shift = 0;
        const update = () => {
            const range = document.createRange();
            range.selectNodeContents(text);
            const glyphs = range.getBoundingClientRect();
            const title = glyphs.height ? glyphs : text.getBoundingClientRect();
            const divider = line.getBoundingClientRect();
            const scale = row.getBoundingClientRect().width / row.offsetWidth || 1;
            const next = Math.round((shift + (title.top + title.height / 2 - divider.top - divider.height / 2) / scale) * 4) / 4;
            if (next === shift) return;
            shift = next;
            line.style.top = `${shift}px`;
        };
        line.style.top = '0px';
        update();
        const observer = new ResizeObserver(update);
        [row, text, line].forEach(node => observer.observe(node));
        const mutations = new MutationObserver(update);
        mutations.observe(text, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
        document.fonts?.addEventListener('loadingdone', update);
        return () => {
            observer.disconnect();
            mutations.disconnect();
            document.fonts?.removeEventListener('loadingdone', update);
        };
    }, [preset]);

    return (
        <span ref={ref} aria-hidden="true" className="relative self-center"
            data-menu-divider-color={preset === 'none' ? undefined : color}
            data-ornamental-divider={preset === 'ornamental' ? titleEdge : undefined}
            style={getCategoryDividerStyle(preset, color, titleEdge)} />
    );
}
