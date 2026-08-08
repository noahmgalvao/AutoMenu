import React, { useEffect, useRef, useState } from 'react';

interface FontSizeInputProps {
    value?: number;
    onChange: (fontSize: number) => void;
    className?: string;
    placeholder?: string;
    max?: number;
}

const toInputValue = (value?: number): string => (
    Number.isFinite(value) && Number(value) > 0 ? String(value) : ''
);

export const FontSizeInput: React.FC<FontSizeInputProps> = ({
    value,
    onChange,
    className = '',
    placeholder = 'Tam.',
    max,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const effectiveValue = Number.isFinite(value)
        ? Math.min(max ?? Number.POSITIVE_INFINITY, Number(value))
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

    return (
        <input
            ref={inputRef}
            type="number"
            min={1}
            max={max}
            step={1}
            inputMode="numeric"
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
                    && parsedValue >= 1
                    && (max === undefined || parsedValue <= max)
                ) {
                    onChange(parsedValue);
                }
            }}
            onBlur={() => {
                const parsedValue = Number(draftValue);
                if (!draftValue.trim() || !Number.isFinite(parsedValue) || parsedValue < 1) {
                    restoreCurrentValue();
                    return;
                }

                const normalizedValue = Math.min(
                    max ?? Number.POSITIVE_INFINITY,
                    Math.max(1, Math.round(parsedValue)),
                );
                setDraftValue(String(normalizedValue));
                if (normalizedValue !== effectiveValue) onChange(normalizedValue);
            }}
        />
    );
};
