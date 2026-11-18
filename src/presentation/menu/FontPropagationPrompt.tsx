import React from 'react';
import { createPortal } from 'react-dom';
import { Type, X } from 'lucide-react';
import { TimedPromptFrame } from '../common/TimedPromptFrame';

export interface FontPropagationRequest {
  sourceId: string;
  fontFamily: string;
}

interface FontPropagationPromptProps {
  request: FontPropagationRequest | null;
  onApply: () => void;
  onDismiss: () => void;
}

export const FontPropagationPrompt: React.FC<FontPropagationPromptProps> = ({ request, onApply, onDismiss }) => {
  if (!request) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[2147483600] flex justify-center px-4 sm:bottom-6">
      <TimedPromptFrame timerKey={`${request.sourceId}:${request.fontFamily}`} onDismiss={onDismiss} className="border-blue-200">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Type size={21} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">Fonte atualizada</h3>
                <p className="mt-0.5 text-sm text-slate-600">Aplicar a fonte aos outros objetos?</p>
              </div>
              <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar"><X size={17} /></button>
            </div>
            <p className="mt-2 truncate text-xs font-medium text-slate-500" style={{ fontFamily: request.fontFamily }}>{request.fontFamily}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onDismiss} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Só neste texto</button>
          <button type="button" onClick={onApply} className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Aplicar aos demais</button>
        </div>
      </TimedPromptFrame>
    </div>,
    document.body,
  );
};
