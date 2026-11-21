import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { triggerLimitFeedback } from '../canvas/textFit';
import { roundFontSize } from '../../../domain/menu/styleRules';

interface FontSizeInputProps {
    value?: number;
    onChange: (fontSize: number) => void | boolean;
    className?: string;
    placeholder?: string;
    label?: string;
    max?: number;
    min?: number;
    onEditEnd?: () => void;
    commitOnBlur?: boolean;
    showStepButtons?: boolean;
}

const toInputValue = (value?: number): string => Number.isFinite(value) ? String(value) : '';

export const FontSizeInput: React.FC<FontSizeInputProps> = ({
    value,
    onChange,
    className = '',
    placeholder = 'Tam.',
    label,
    max,
    min = 1,
    onEditEnd,
    commitOnBlur = false,
    showStepButtons = false,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const repeatTimer = useRef<number | undefined>(undefined);
    const normalizeValue = (nextValue: number) => {
        const bounded = Math.max(min, Math.min(max ?? Number.POSITIVE_INFINITY, nextValue));
        return min <= 0 ? Math.round(bounded * 10) / 10 : roundFontSize(bounded);
    };
    const effectiveValue = Number.isFinite(value)
        ? normalizeValue(Number(value))
        : value;
    const [draftValue, setDraftValue] = useState(() => toInputValue(effectiveValue));
    const stepValueRef = useRef(effectiveValue);
    stepValueRef.current = effectiveValue;
    const stepRef = useRef<(direction: 1 | -1) => void>(() => {});

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
            triggerLimitFeedback(inputRef.current);
            restoreCurrentValue();
            return false;
        }
        return true;
    };
    stepRef.current = (direction) => {
        const current = stepValueRef.current ?? min;
        const next = normalizeValue(current + direction);
        if (next === current && stepValueRef.current !== undefined) {
            if (!inputRef.current?.classList.contains('automenu-limit-feedback')) triggerLimitFeedback(inputRef.current);
            return;
        }
        if (next === min || next === max) triggerLimitFeedback(inputRef.current);
        if (applyValue(next)) {
            stepValueRef.current = next;
            setDraftValue(String(next));
        }
    };
    const stopRepeating = () => {
        if (repeatTimer.current === undefined) return;
        window.clearTimeout(repeatTimer.current);
        repeatTimer.current = undefined;
        onEditEnd?.();
    };
    useEffect(() => () => window.clearTimeout(repeatTimer.current), []);

    const renderStep = (direction: 1 | -1, Icon: typeof ChevronUp, title: string, side = false) => (
        <button type="button" aria-label={label ? `${title} ${label}` : title}
            className={`grid touch-none place-items-center text-slate-600 hover:bg-indigo-100 focus-visible:bg-indigo-100 ${side
                ? 'size-6 rounded border border-slate-200 bg-white' : 'h-3.5 w-4 rounded-sm'}`}
            onPointerDown={(event) => {
                if (event.button !== 0 || repeatTimer.current !== undefined) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                stepRef.current(direction);
                const repeat = () => {
                    stepRef.current(direction);
                    repeatTimer.current = window.setTimeout(repeat, 85);
                };
                repeatTimer.current = window.setTimeout(repeat, 350);
            }}
            onPointerUp={stopRepeating} onPointerCancel={stopRepeating} onLostPointerCapture={stopRepeating}
            onClick={(event) => {
                if (event.detail !== 0) return;
                stepRef.current(direction);
                onEditEnd?.();
            }}
        ><Icon size={12} /></button>
    );

    return (
        <span className="inline-flex shrink-0 items-center gap-0.5">
        {showStepButtons && renderStep(-1, Minus, 'Diminuir tamanho da fonte', true)}
        <span className="relative inline-flex">
        <input
            ref={inputRef}
            type="number"
            min={min}
            max={max}
            step={1}
            inputMode="decimal"
            className={`automenu-font-size-input h-8 w-16 rounded border border-slate-200 pl-1.5 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${showStepButtons ? 'pr-1.5' : 'pr-5'} ${className}`}
            value={draftValue}
            placeholder={placeholder}
            aria-label={label}
            onFocus={() => {
                if (!draftValue) restoreCurrentValue();
            }}
            onKeyDown={(event) => {
                if (commitOnBlur && event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                    return;
                }
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                stepRef.current(event.key === 'ArrowUp' ? 1 : -1);
            }}
            onKeyUp={(event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') onEditEnd?.();
            }}
            onChange={(event) => {
                const nextValue = event.target.value;
                setDraftValue(nextValue);
                if (commitOnBlur || !nextValue.trim()) return;

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
                onEditEnd?.();
                const parsedValue = Number(draftValue);
                if (!draftValue.trim() || !Number.isFinite(parsedValue) || (!commitOnBlur && parsedValue < min)) {
                    if (draftValue.trim() && parsedValue < min) triggerLimitFeedback(inputRef.current);
                    restoreCurrentValue();
                    return;
                }

                const normalizedValue = normalizeValue(parsedValue);
                if (parsedValue < min || max !== undefined && parsedValue > max) triggerLimitFeedback(inputRef.current);
                setDraftValue(String(normalizedValue));
                if (normalizedValue !== effectiveValue) applyValue(normalizedValue);
            }}
        />
        {!showStepButtons && (
            <span className="absolute inset-y-0 right-0.5 flex flex-col justify-center">
                {renderStep(1, ChevronUp, 'Aumentar')}
                {renderStep(-1, ChevronDown, 'Diminuir')}
            </span>
        )}
        </span>
        {showStepButtons && renderStep(1, Plus, 'Aumentar tamanho da fonte', true)}
        </span>
    );
};
