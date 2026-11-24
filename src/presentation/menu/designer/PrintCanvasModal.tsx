import { lockModalScrolling } from '../../common/modalScroll';
import React from 'react';
import { createPortal } from 'react-dom';
import { preparePrintPageContent } from '../../../infrastructure/browser/printPageContent';
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Loader2, Printer, Scissors, Settings2, X } from 'lucide-react';
import type { PdfExportResult } from '../../../infrastructure/browser/pdfExport';
import { getPaperDimensionsMm, getPrintFrameSizeMm, getPrintMarginMm, type PdfPrintOptions } from '../../../domain/publishing/printOptions';
import { getErrorMessage } from '../../../application/errorMessages';
import type { MenuPageSetup } from '../../../domain/menu/pageModel';
import { VirtualLinkSection, type VirtualLinkControls } from '../../publishing/VirtualLinkSection';
import { isPublishLocked } from '../../publishing/useMenuPublishing';
import { BooleanSwitch } from '../../common/BooleanSwitch';

export type PrintCanvasOptions = PdfPrintOptions;

const lockPdfOptionsScroll = (element: HTMLElement | null) => lockModalScrolling(element, 1);

export type PrintPreviewPage = {
  pageNumber: number;
  element: HTMLElement;
  width: number;
  height: number;
};

export interface PrintCanvasModalProps {
  isOpen: boolean;
  isPrinting?: boolean;
  awaitingPublicationPdf?: boolean;
  options: PrintCanvasOptions;
  currentPageIndex: number | null;
  totalPages: number;
  previewPages: PrintPreviewPage[];
  onChange: React.Dispatch<React.SetStateAction<PrintCanvasOptions>>;
  onPageSetupChange: (setup: MenuPageSetup) => void;
  virtualLinkControls?: VirtualLinkControls;
  onClose: () => void;
  onPrint: () => Promise<PdfExportResult>;
  onComplete?: (result: PdfExportResult) => void;
  onError?: (error: Error) => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">{label}</span>
    {children}
  </label>
);

function LivePrintPreview({ page, width, height, options }: {
  page: PrintPreviewPage; width: number; height: number; options: PrintCanvasOptions;
}) {
  const frame = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(typeof IntersectionObserver === 'undefined');
  React.useEffect(() => {
    if (visible || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { root: frame.current.closest('[data-pdf-preview-strip]'), rootMargin: '0px 120px' });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [visible]);

  const { element } = page;
  React.useEffect(() => {
    const host = frame.current;
    if (!visible || !host) return;
    let clone: HTMLElement | undefined;
    const render = () => {
      clone = element.cloneNode(true) as HTMLElement;
      preparePrintPageContent(clone, options.printBackgrounds);
      clone.removeAttribute('id');
      clone.removeAttribute('data-menu-print-page');
      clone.querySelectorAll('[id], [data-canvas-selection-outline]').forEach(node => {
        if (node.hasAttribute('data-canvas-selection-outline')) node.remove();
        else node.removeAttribute('id');
      });
      clone.inert = true;
      host.replaceChildren(clone);
    };
    const idle = window.requestIdleCallback?.(render, { timeout: 300 });
    const timer = idle === undefined ? window.setTimeout(render, 0) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
      clone?.remove();
    };
  }, [visible, element, options.printBackgrounds]);

  return <div role="img" aria-label={`Preview da página ${page.pageNumber}`} className="absolute inset-0 overflow-hidden">
    <div ref={frame} className="pointer-events-none absolute left-0 top-0 origin-top-left"
      style={{ width: page.width, height: page.height, transform: `scale(${width / Math.max(page.width, 1)}, ${height / Math.max(page.height, 1)})`,
        filter: options.grayscale ? 'grayscale(1)' : undefined }} />
  </div>;
}

const PreviewPaper: React.FC<{ options: PrintCanvasOptions; page?: PrintPreviewPage }> = ({ options, page }) => {
  const paper = getPaperDimensionsMm(options);
  const margin = getPrintMarginMm(options);
  const frame = getPrintFrameSizeMm(options, paper, margin, page);
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
            <LivePrintPreview page={page} width={renderWidth} height={renderHeight} options={options} />
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

function PrintOptionsPreview({ options, previewPages }: { options: PrintCanvasOptions; previewPages: PrintPreviewPage[] }) {
  const paper = getPaperDimensionsMm(options);
  const stripRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ id: number; x: number; scroll: number } | null>(null);
  const hasPages = previewPages.length > 0;
  React.useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const preventPreviewZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    strip.addEventListener('wheel', preventPreviewZoom, { passive: false });
    return () => strip.removeEventListener('wheel', preventPreviewZoom);
  }, [hasPages]);

  return <section className="min-w-0">
    <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700">
      <ImageIcon size={14} /> Preview real do PDF
    </div>
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      {hasPages ? (
        <div ref={stripRef} data-pdf-preview-strip aria-label="Páginas da prévia" tabIndex={0}
          className="flex min-w-0 cursor-grab select-none items-start gap-3 overflow-x-auto overflow-y-hidden pb-2 active:cursor-grabbing"
          style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto' }}
          onPointerDown={event => {
            const strip = event.currentTarget;
            if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0 || strip.scrollWidth <= strip.clientWidth
              || event.clientY >= strip.getBoundingClientRect().top + strip.clientHeight) return;
            drag.current = { id: event.pointerId, x: event.clientX, scroll: strip.scrollLeft };
            strip.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const start = drag.current;
            if (start?.id !== event.pointerId) return;
            event.currentTarget.scrollLeft = start.scroll + start.x - event.clientX;
          }}
          onLostPointerCapture={event => {
            if (drag.current?.id === event.pointerId) drag.current = null;
          }}>
          {previewPages.map(page => <PreviewPaper key={page.pageNumber} options={options} page={page} />)}
        </div>
      ) : <p className="text-xs text-slate-500">Nenhuma página válida selecionada.</p>}
      <p className="text-[10px] text-slate-500">Área do papel: {paper.width.toFixed(1)} × {paper.height.toFixed(1)} mm.</p>
    </div>
  </section>;
}

export const PrintCanvasModal: React.FC<PrintCanvasModalProps> = ({
  isOpen,
  isPrinting = false,
  awaitingPublicationPdf = false,
  options,
  currentPageIndex,
  totalPages,
  previewPages,
  onChange,
  onPageSetupChange,
  virtualLinkControls,
  onClose,
  onPrint,
  onComplete,
  onError,
}) => {
  const [exportError, setExportError] = React.useState<string | null>(null);
  const locked = isPrinting || Boolean(virtualLinkControls && isPublishLocked(
    virtualLinkControls.publishingLink && !awaitingPublicationPdf, virtualLinkControls.busyActions,
  ));
  const [virtualLinkEnabled, setVirtualLinkEnabled] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setExportError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const update = <K extends keyof PrintCanvasOptions>(key: K, value: PrintCanvasOptions[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const updateCustomPaperDimension = (axis: 'width' | 'height', value: number) => {
    if (!Number.isFinite(value)) return;
    const normalizedValue = Math.max(50, Math.min(1000, value));
    const key = (axis === 'width') === (options.orientation === 'portrait') ? 'widthMm' : 'heightMm';
    if (normalizedValue !== pageSetup[key]) onPageSetupChange({ ...pageSetup, [key]: normalizedValue });
  };

  const pageSetup: MenuPageSetup = {
    preset: options.paperSize,
    orientation: options.orientation,
    widthMm: options.customPaperWidthMm,
    heightMm: options.customPaperHeightMm,
  };

  const handlePrintClick = async () => {
    if (locked) return;
    setExportError(null);
    try {
      const result = await onPrint();
      onComplete?.(result);
    } catch (error) {
      const message = getErrorMessage(error, 'Não foi possível gerar o PDF.');
      setExportError(message);
      onError?.(error instanceof Error ? error : new Error(message));
    }
  };

  return createPortal(
    <div ref={lockPdfOptionsScroll} data-pdf-options className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex shrink-0 items-center justify-between">
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

        <div data-pdf-options-scroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto custom-scrollbar">
          <fieldset disabled={locked} inert={locked} className="min-w-0 space-y-5 p-5 disabled:grayscale disabled:opacity-50">
            <section>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3">
                <Settings2 size={14} /> Configuração da página
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Páginas">
                  <select value={options.pageMode} onChange={(e) => update('pageMode', e.target.value as PrintCanvasOptions['pageMode'])} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                    <option value="all">Todas as páginas</option>
                    <option value="current" disabled={currentPageIndex === null}>Página atual</option>
                    <option value="range" disabled={totalPages <= 1}>Intervalo</option>
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
                    disabled={totalPages <= 1 || options.pageMode !== 'range'}
                    className="w-full h-auto max-h-24 rounded-lg border border-slate-200 px-3 py-1 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-300 custom-scrollbar overflow-y-auto"
                  >
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <option key={i} value={i + 1}>Página {i + 1}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Papel">
                  <select value={options.paperSize} onChange={(e) => {
                    const preset = e.target.value as MenuPageSetup['preset'];
                    onPageSetupChange({ ...pageSetup, preset, orientation: preset === 'screen' ? 'landscape' : pageSetup.orientation });
                  }} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="A3">A3</option>
                    <option value="Letter">Carta</option>
                    <option value="screen">Painel 16:9</option>
                    <option value="Square">Quadrado</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </Field>
                <Field label="Orientação">
                  <select value={options.orientation} onChange={(e) => onPageSetupChange({ ...pageSetup, orientation: e.target.value as MenuPageSetup['orientation'] })} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-ellipsis overflow-hidden whitespace-nowrap">
                    <option value="portrait">Retrato</option>
                    <option value="landscape">Paisagem</option>
                  </select>
                </Field>
              </div>
              {(() => {
                const dimensions = getPaperDimensionsMm(options);
                const editable = options.paperSize === 'custom';
                return (
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {([
                      { axis: 'width', label: 'Largura', value: dimensions.width },
                      { axis: 'height', label: 'Altura', value: dimensions.height },
                    ] as const).map(({ axis, label, value }) => (
                      <Field key={axis} label={`${label} (mm)`}>
                        <input
                          key={`${axis}-${options.orientation}-${value}`}
                          type="number"
                          min={50}
                          max={1000}
                          step={0.1}
                          defaultValue={Number(value.toFixed(1))}
                          onBlur={(event) => updateCustomPaperDimension(axis, Number(event.target.value))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          disabled={!editable}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-500"
                          aria-label={`${label} personalizada do papel em milímetros`}
                        />
                      </Field>
                    ))}
                    <p className="col-span-2 text-[10px] text-slate-500">
                      Tamanho final do PDF: {Number(dimensions.width.toFixed(1))} × {Number(dimensions.height.toFixed(1))} mm.
                    </p>
                  </div>
                );
              })()}
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
                    <option value="actual">Tamanho real do canvas</option>
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
              previewPages={previewPages}
            />

            <section>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3">
                <ImageIcon size={14} /> Saida
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <BooleanSwitch value={options.cropMarks} label="Marcas de corte" className="border-slate-200 bg-white"
                  onChange={checked => update('cropMarks', checked)} />
                <BooleanSwitch value={options.grayscale} label="Cinza" className="border-slate-200 bg-white"
                  onChange={checked => update('grayscale', checked)} />
              </div>
            </section>

            {exportError && (
              <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                <AlertTriangle size={17} /> {exportError}
              </p>
            )}
            {virtualLinkControls && (
              <section className="space-y-2 border-t border-slate-100 pt-4">
                <VirtualLinkSection {...virtualLinkControls} enabled={virtualLinkEnabled} onChange={setVirtualLinkEnabled} />
                {virtualLinkEnabled && virtualLinkControls.feedback && (
                  <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={16} /> {virtualLinkControls.feedback}
                  </p>
                )}
              </section>
            )}
          </fieldset>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button onClick={handlePrintClick} disabled={locked} aria-busy={isPrinting}
            className="min-w-36 justify-center px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 disabled:grayscale disabled:opacity-50">
            {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            <span>Baixar PDF</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
