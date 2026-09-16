import React, { useEffect, useRef, useState } from 'react';
import { roundFontSize } from '../../utils/styleRules';

interface FontSizeInputProps {
    value?: number;
    onChange: (fontSize: number) => void | boolean;
    className?: string;
    placeholder?: string;
    max?: number;
    min?: number;
}

const toInputValue = (value?: number): string => (
    Number.isFinite(value) && Number(value) > 0 ? String(roundFontSize(value)) : ''
);

export const FontSizeInput: React.FC<FontSizeInputProps> = ({
    value,
    onChange,
    className = '',
    placeholder = 'Tam.',
    max,
    min = 1,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const normalizeValue = (nextValue: number) => roundFontSize(Math.max(
        min,
        Math.min(max ?? Number.POSITIVE_INFINITY, nextValue),
    ));
    const effectiveValue = Number.isFinite(value)
        ? normalizeValue(Number(value))
        : value;
    const [draftValue, setDraftValue] = useState(() => toInputValue(effectiveValue));

    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setDraftValue(toInputValue(effectiveValue));
        }
    }, [effectiveValue]);

    const restoreCurrentValue = () => {
        setDraftValue(toInputValue(effectiveValue));
    };

    const applyValue = (nextValue: number) => {
        const normalizedValue = normalizeValue(nextValue);
        const accepted = onChange(normalizedValue);
        if (accepted === false) {
            const input = inputRef.current;
            input?.classList.remove('automenu-limit-feedback');
            if (input) void input.offsetWidth;
            input?.classList.add('automenu-limit-feedback');
            window.setTimeout(() => input?.classList.remove('automenu-limit-feedback'), 850);
            restoreCurrentValue();
            return false;
        }
        return true;
    };

    return (
        <input
            ref={inputRef}
            type="number"
            min={min}
            max={max}
            step={1}
            inputMode="decimal"
            className={`automenu-font-size-input h-8 w-16 rounded border border-slate-200 px-2 text-xs ${className}`}
            value={draftValue}
            placeholder={placeholder}
            onFocus={() => {
                if (!draftValue) restoreCurrentValue();
            }}
            onChange={(event) => {
                const nextValue = event.target.value;
                setDraftValue(nextValue);
                if (!nextValue.trim()) return;

                const parsedValue = Number(nextValue);
                if (
                    Number.isFinite(parsedValue)
                    && parsedValue >= min
                    && (max === undefined || parsedValue <= max)
                ) {
                    const normalizedValue = normalizeValue(parsedValue);
                    if (normalizedValue !== parsedValue) setDraftValue(String(normalizedValue));
                    applyValue(normalizedValue);
                }
            }}
            onBlur={() => {
                const parsedValue = Number(draftValue);
                if (!draftValue.trim() || !Number.isFinite(parsedValue) || parsedValue < min) {
                    restoreCurrentValue();
                    return;
                }

                const normalizedValue = normalizeValue(parsedValue);
                setDraftValue(String(normalizedValue));
                if (normalizedValue !== effectiveValue) applyValue(normalizedValue);
            }}
        />
    );
};
