import React from 'react';
import { AlertTriangle, Bug, CheckCircle2, Copy, Image as ImageIcon, Loader2, Printer, Scissors, Settings2, X } from 'lucide-react';
import {
  getPaperDimensionsMm,
  getPrintFrameSizeMm,
  getPrintMarginMm,
  PdfExportError,
  type PdfDebugEntry,
  type PdfExportResult,
  type PdfPrintOptions,
} from '../../utils/pdfExport';

export type PrintCanvasOptions = PdfPrintOptions;

export type PrintPreviewPage = {
  pageNumber: number;
  dataUrl: string;
};

interface PrintCanvasModalProps {
  isOpen: boolean;
  options: PrintCanvasOptions;
  currentPageIndex: number | null;
  totalPages: number;
  previewPages: PrintPreviewPage[];
  previewLoading: boolean;
  previewError: string | null;
  onChange: React.Dispatch<React.SetStateAction<PrintCanvasOptions>>;
  onClose: () => void;
  onPrint: (onDebug: (entry: PdfDebugEntry) => void) => Promise<PdfExportResult>;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">{label}</span>
    {children}
  </label>
);

const Toggle: React.FC<{ checked: boolean; label: string; onChange: (checked: boolean) => void }> = ({ checked, label, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`h-9 rounded-lg border px-3 text-xs font-semibold flex items-center justify-between gap-3 ${checked ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}
  >
    <span>{label}</span>
    <span className={`h-4 w-7 rounded-full p-0.5 flex ${checked ? 'justify-end bg-indigo-500' : 'justify-start bg-slate-300'}`}>
      <span className="h-3 w-3 rounded-full bg-white" />
    </span>
  </button>
);

const PreviewPaper: React.FC<{ options: PrintCanvasOptions; page?: PrintPreviewPage }> = ({ options, page }) => {
  const paper = getPaperDimensionsMm(options);
  const margin = getPrintMarginMm(options);
  const frame = getPrintFrameSizeMm(options, paper, margin);
  const bleed = Math.max(0, Math.min(10, options.bleedMm || 0));
  const maxWidth = 270;
  const maxHeight = 310;
  const previewScale = Math.min(maxWidth / paper.width, maxHeight / paper.height);
  const previewWidth = paper.width * previewScale;
  const previewHeight = paper.height * previewScale;
  const renderWidth = (frame.width + (bleed * 2)) * previewScale;
  const renderHeight = (frame.height + (bleed * 2)) * previewScale;
  const renderLeft = ((paper.width - frame.width - (bleed * 2)) / 2) * previewScale;
  const renderTop = ((paper.height - frame.height - (bleed * 2)) / 2) * previewScale;
  const trimLeft = renderLeft + (bleed * previewScale);
  const trimTop = renderTop + (bleed * previewScale);
  const trimWidth = frame.width * previewScale;
  const trimHeight = frame.height * previewScale;
  const markLength = 8;

  const cropMark = (left: number, top: number, horizontalDirection: -1 | 1, verticalDirection: -1 | 1) => (
    <>
      <span
        className="absolute h-px bg-slate-800"
        style={{
          width: markLength,
          left: horizontalDirection < 0 ? left - markLength - 2 : left + 2,
          top,
        }}
      />
      <span
        className="absolute w-px bg-slate-800"
        style={{
          height: markLength,
          left,
          top: verticalDirection < 0 ? top - markLength - 2 : top + 2,
        }}
      />
    </>
  );

  return (
    <div className="shrink-0">
      <div
        className="relative bg-white border border-slate-300 overflow-hidden"
        style={{ width: previewWidth, height: previewHeight }}
      >
        <div
          className={`absolute overflow-hidden border border-indigo-300 bg-white ${options.includeCanvasShadow ? 'shadow-lg' : ''}`}
          style={{
            left: renderLeft,
            top: renderTop,
            width: renderWidth,
            height: renderHeight,
          }}
        >
          {page ? (
            <img
              src={page.dataUrl}
              alt={`Preview da página ${page.pageNumber}`}
              className="w-full h-full"
              style={{
                filter: options.grayscale ? 'grayscale(1)' : 'none',
              }}
            />
          ) : (
            <div className="w-full h-full animate-pulse bg-gradient-to-br from-slate-100 to-slate-200" />
          )}
        </div>
        {options.cropMarks && (
          <>
            {cropMark(trimLeft, trimTop, -1, -1)}
            {cropMark(trimLeft + trimWidth, trimTop, 1, -1)}
            {cropMark(trimLeft + trimWidth, trimTop + trimHeight, 1, 1)}
            {cropMark(trimLeft, trimTop + trimHeight, -1, 1)}
          </>
        )}
        {options.pageNumbers && page && (
          <span className="absolute bottom-1 right-2 text-[9px] text-slate-500">
            Página {page.pageNumber}
          </span>
        )}
      </div>
      {page && <div className="text-center text-[10px] font-semibold text-slate-500 mt-1">Página {page.pageNumber}</div>}
    </div>
  );
};

const PrintOptionsPreview: React.FC<{
  options: PrintCanvasOptions;
  totalPages: number;
  currentPageIndex: number | null;
  previewPages: PrintPreviewPage[];
  previewLoading: boolean;
  previewError: string | null;
}> = ({ options, totalPages, currentPageIndex, previewPages, previewLoading, previewError }) => {
  const paper = getPaperDimensionsMm(options);

  return (
    <section>
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3">
        <ImageIcon size={14} /> Preview real do PDF
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        {previewError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{previewError}</span>
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 min-w-max items-start">
              {previewLoading && previewPages.length === 0 ? (
                <PreviewPaper options={options} />
              ) : (
                previewPages.map((page) => <PreviewPaper key={page.pageNumber} options={options} page={page} />)
              )}
            </div>
          </div>
        )}
        <div className="text-[10px] text-slate-400">
          Área do papel: {paper.width.toFixed(1)} x {paper.height.toFixed(1)} mm. O conteúdo cortado no preview também será cortado no PDF.
          {previewLoading && (
            <span className="ml-2 inline-flex items-center gap-1 text-indigo-600">
              <Loader2 size={11} className="animate-spin" /> Atualizando miniaturas
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

export const PrintCanvasModal: React.FC<PrintCanvasModalProps> = ({
  isOpen,
  options,
  currentPageIndex,
  totalPages,
  previewPages,
  previewLoading,
  previewError,
  onChange,
  onClose,
  onPrint,
}) => {
  const [isPrinting, setIsPrinting] = React.useState(false);
  const [debugEntries, setDebugEntries] = React.useState<PdfDebugEntry[]>([]);
  const [exportError, setExportError] = React.useState<PdfExportError | null>(null);
  const [exportResult, setExportResult] = React.useState<PdfExportResult | null>(null);
  const [diagnosticCopied, setDiagnosticCopied] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setDebugEntries([]);
    setExportError(null);
    setExportResult(null);
    setDiagnosticCopied(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const update = <K extends keyof PrintCanvasOptions>(key: K, value: PrintCanvasOptions[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const handlePrintClick = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setDebugEntries([]);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await onPrint((entry) => {
        setDebugEntries((current) => [...current.slice(-99), entry]);
      });
      setExportResult(result);
    } catch (error) {
      const normalizedError = error instanceof PdfExportError
        ? error
        : new PdfExportError(
            'PDF_UNKNOWN_ERROR',
            'complete',
            'Ocorreu um erro inesperado ao gerar o PDF.',
            { reason: error instanceof Error ? error.message : String(error) },
            error
          );
      setExportError(normalizedError);
      setDebugEntries((current) => [
        ...current,
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          stage: normalizedError.stage,
          code: normalizedError.code,
          message: normalizedError.message,
          details: normalizedError.details,
        },
      ]);
      console.error('[PDF] Falha ao baixar PDF', normalizedError);
    } finally {
      setIsPrinting(false);
    }
  };

  const copyDiagnostic = async () => {
    const diagnostic = JSON.stringify({
      generatedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      options,
      totalPages,
      currentPageIndex,
      previewError,
      exportError: exportError ? {
        code: exportError.code,
        stage: exportError.stage,
        message: exportError.message,
        details: exportError.details,
      } : null,
      entries: debugEntries,
    }, null, 2);

    try {
      await navigator.clipboard.writeText(diagnostic);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = diagnostic;
      textarea.style.position = 'fixed';
      textarea.style.left = '-10000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setDiagnosticCopied(true);
    window.setTimeout(() => setDiagnosticCopied(false), 2000);
  };

  const latestEntry = debugEntries[debugEntries.length - 1];
  const exportHint = typeof exportError?.details?.hint === 'string' ? exportError.details.hint : null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Printer size={18} /> Exportar PDF
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Baixa as páginas selecionadas do cardápio em PDF.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-5">
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3">
              <Settings2 size={14} /> Configuração da página
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Páginas">
                <select value={options.pageMode} onChange={(e) => update('pageMode', e.target.value as PrintCanvasOptions['pageMode'])} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                  <option value="all">Todas as páginas</option>
                  <option value="current" disabled={currentPageIndex === null}>Página atual</option>
                  <option value="range">Intervalo</option>
                </select>
              </Field>
              <Field label="Intervalo">
                <select
                  multiple
                  value={options.pageRange.split(',').filter(Boolean)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
                    update('pageRange', selected.join(','));
                  }}
                  disabled={options.pageMode !== 'range'}
                  className="w-full h-auto max-h-24 rounded-lg border border-slate-200 px-3 py-1 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-300 custom-scrollbar overflow-y-auto"
                >
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <option key={i} value={i + 1}>Página {i + 1}</option>
                  ))}
                </select>
              </Field>
              <Field label="Papel">
                <select value={options.paperSize} onChange={(e) => update('paperSize', e.target.value as PrintCanvasOptions['paperSize'])} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                  <option value="A4">A4</option>
                  <option value="Letter">Carta</option>
                  <option value="Legal">Oficio</option>
                </select>
              </Field>
              <Field label="Orientacao">
                <select value={options.orientation} onChange={(e) => update('orientation', e.target.value as PrintCanvasOptions['orientation'])} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                  <option value="portrait">Retrato</option>
                  <option value="landscape">Paisagem</option>
                </select>
              </Field>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3">
              <Scissors size={14} /> Ajuste, margens e corte
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Field label="Margens">
                <select value={options.marginPreset} onChange={(e) => update('marginPreset', e.target.value as PrintCanvasOptions['marginPreset'])} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                  <option value="0">0 mm</option>
                  <option value="3">3 mm</option>
                  <option value="5">5 mm</option>
                  <option value="10">10 mm</option>
                  <option value="custom">Personalizado</option>
                </select>
              </Field>
              <Field label="Personalizado mm">
                <input type="number" min={0} value={options.customMarginMm === 0 ? '' : options.customMarginMm} onChange={(e) => update('customMarginMm', Number(e.target.value))} disabled={options.marginPreset !== 'custom'} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-300" />
              </Field>
              <Field label="Escala">
                <select value={options.scaleMode} onChange={(e) => update('scaleMode', e.target.value as PrintCanvasOptions['scaleMode'])} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                  <option value="fit">Ajustar ao papel</option>
                  <option value="actual">A4 real em px</option>
                  <option value="custom">Personalizado</option>
                </select>
              </Field>
              <Field label="Escala %">
                <input type="number" min={25} max={200} value={options.customScale === 0 ? '' : options.customScale} onChange={(e) => update('customScale', Number(e.target.value))} disabled={options.scaleMode !== 'custom'} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-300" />
              </Field>
              <Field label="Sangria mm">
                <input type="number" min={0} max={10} value={options.bleedMm === 0 ? '' : options.bleedMm} onChange={(e) => update('bleedMm', Number(e.target.value))} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm" />
              </Field>
            </div>
          </section>

          <PrintOptionsPreview
            options={options}
            totalPages={totalPages}
            currentPageIndex={currentPageIndex}
            previewPages={previewPages}
            previewLoading={previewLoading}
            previewError={previewError}
          />

          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3">
              <ImageIcon size={14} /> Saida
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <Toggle checked={options.cropMarks} label="Marcas de corte" onChange={(checked) => update('cropMarks', checked)} />
              <Toggle checked={options.grayscale} label="Cinza" onChange={(checked) => update('grayscale', checked)} />
            </div>
          </section>

          {(isPrinting || exportError || exportResult || debugEntries.length > 0) && (
            <section className={`rounded-xl border p-3 ${
              exportError
                ? 'border-red-200 bg-red-50'
                : exportResult
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-indigo-200 bg-indigo-50'
            }`}>
              <div className="flex items-start gap-2">
                {exportError ? (
                  <AlertTriangle size={17} className="text-red-600 shrink-0 mt-0.5" />
                ) : exportResult ? (
                  <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <Loader2 size={17} className="text-indigo-600 shrink-0 mt-0.5 animate-spin" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">
                    {exportError
                      ? `${exportError.code}: ${exportError.message}`
                      : exportResult
                        ? `PDF baixado: ${exportResult.filename}`
                        : latestEntry?.message || 'Preparando PDF...'}
                  </div>
                  {exportResult && (
                    <div className="text-xs text-emerald-700 mt-1">
                      {exportResult.pageCount} página(s), {(exportResult.sizeBytes / 1024 / 1024).toFixed(2)} MB, {(exportResult.durationMs / 1000).toFixed(1)} s.
                    </div>
                  )}
                  {exportHint && (
                    <div className="text-xs text-red-700 mt-1">{exportHint}</div>
                  )}
                </div>
              </div>

              <details className="mt-3 rounded-lg border border-black/10 bg-white/70">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Bug size={14} /> Diagnostico tecnico ({debugEntries.length} eventos)
                </summary>
                <div className="border-t border-black/10 p-3">
                  <div className="max-h-44 overflow-auto rounded bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-slate-200">
                    {debugEntries.map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className={entry.level === 'error' ? 'text-red-300' : entry.level === 'warning' ? 'text-amber-300' : entry.level === 'success' ? 'text-emerald-300' : ''}>
                        [{entry.stage}] [{entry.code}] {entry.message}
                        {entry.details ? ` ${JSON.stringify(entry.details)}` : ''}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={copyDiagnostic}
                    className="mt-2 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-2"
                  >
                    {diagnosticCopied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                    {diagnosticCopied ? 'Diagnóstico copiado' : 'Copiar diagnóstico'}
                  </button>
                </div>
              </details>
            </section>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button onClick={handlePrintClick} disabled={isPrinting} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait">
            {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            {isPrinting ? 'Gerando PDF...' : exportResult ? 'Baixar novamente' : 'Baixar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};
