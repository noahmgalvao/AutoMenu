import React from 'react';
import { createPortal } from 'react-dom';
import { BadgeDollarSign, X } from 'lucide-react';
import type { MenuStyle } from '../types';
import { formatMenuPriceValue } from '../utils/price';

export type PriceAdjustmentMode = 'percentage' | 'integer';

export interface PricePropagationRequest {
  productId: string;
  productName: string;
  previousPrice: number;
  nextPrice: number;
  mode: PriceAdjustmentMode;
  signedAmount: number;
}

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

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[2147483600] flex justify-center px-4 sm:bottom-6">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="price-propagation-title"
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl shadow-slate-900/20"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <BadgeDollarSign size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 id="price-propagation-title" className="font-semibold text-slate-900">Preço atualizado</h3>
                <p className="mt-0.5 text-sm text-slate-600">Aplicar o mesmo reajuste aos outros produtos?</p>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar"
              >
                <X size={17} />
              </button>
            </div>
            <p className="mt-2 truncate text-xs text-slate-500" title={request.productName}>
              {request.productName}: R$ {formatMenuPriceValue(request.previousPrice, style)} → R$ {formatMenuPriceValue(request.nextPrice, style)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Só neste produto
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Aplicar aos demais
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
