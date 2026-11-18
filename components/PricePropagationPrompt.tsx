import React from 'react';
import { createPortal } from 'react-dom';
import { BadgeDollarSign, X } from 'lucide-react';
import type { MenuStyle } from '../types';
import { formatMenuPriceValue } from '../utils/price';
import type { PricePropagationRequest } from '../utils/pricePropagation';
import { TimedPromptFrame } from './TimedPromptFrame';

export type { PriceAdjustmentMode, PricePropagationRequest } from '../utils/pricePropagation';

interface PricePropagationPromptProps {
  request: PricePropagationRequest | null;
  style: MenuStyle;
  onApply: () => void;
  onDismiss: () => void;
}

export const PricePropagationPrompt: React.FC<PricePropagationPromptProps> = ({
  request,
  style,
  onApply,
  onDismiss,
}) => {
  if (!request) return null;

  const { multiplier, fixed } = request.operations.reduce((total, operation) => {
    if (operation.mode === 'integer') return { ...total, fixed: total.fixed + operation.signedAmount };
    const factor = 1 + operation.signedAmount / 100;
    return { multiplier: total.multiplier * factor, fixed: total.fixed * factor };
  }, { multiplier: 1, fixed: 0 });
  const percent = (multiplier - 1) * 100;
  const sign = (value: number) => value < 0 ? '−' : '+';
  const percentLabel = `${sign(percent)}${Math.abs(percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  const fixedLabel = `${sign(fixed)}R$ ${formatMenuPriceValue(Math.abs(fixed), style)}`;
  const hasPercent = request.operations.some((operation) => operation.mode === 'percentage');
  const hasFixed = request.operations.some((operation) => operation.mode === 'integer');
  const adjustment = [hasPercent && percentLabel, hasFixed && fixedLabel].filter(Boolean).join(' e ');

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[2147483600] flex justify-center px-4 sm:bottom-6">
      <TimedPromptFrame
        timerKey={`${request.productId}:${request.nextPrice}:${request.operations.length}`}
        onDismiss={onDismiss}
        className="!max-w-sm !border-emerald-700 !bg-emerald-950 !p-3 !pb-4 text-white ring-2 ring-white/80 !shadow-xl !shadow-slate-950/60"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-emerald-100">
            <BadgeDollarSign size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Reajustar os outros produtos?</h3>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-200">
                  {hasPercent && request.operations.length > 1 ? '≈ ' : ''}{adjustment}
                </p>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded p-0.5 text-emerald-100 hover:bg-emerald-800"
                aria-label="Fechar"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-emerald-600 px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-900"
          >
            Só neste produto
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100"
          >
            Aplicar aos demais
          </button>
        </div>
      </TimedPromptFrame>
    </div>,
    document.body,
  );
};
