import { jsPDF } from 'jspdf';
import {
  getPaperDimensionsMm, getPrintFrameSizeMm, getPrintMarginMm,
  type PdfPageSizePx, type PdfPrintOptions,
} from '../../domain/publishing/printOptions';

export type PdfPageImage = { jpeg: Blob; pageSize: PdfPageSizePx };

const drawCropMarks = (
  pdf: jsPDF,
  trimX: number,
  trimY: number,
  trimWidth: number,
  trimHeight: number
) => {
  const length = 5;
  const gap = 1.5;
  pdf.setDrawColor(17, 24, 39);
  pdf.setLineWidth(0.2);

  const corners = [
    { x: trimX, y: trimY, sx: -1, sy: -1 },
    { x: trimX + trimWidth, y: trimY, sx: 1, sy: -1 },
    { x: trimX + trimWidth, y: trimY + trimHeight, sx: 1, sy: 1 },
    { x: trimX, y: trimY + trimHeight, sx: -1, sy: 1 },
  ];

  corners.forEach(({ x, y, sx, sy }) => {
    pdf.line(x + (sx * gap), y, x + (sx * (gap + length)), y);
    pdf.line(x, y + (sy * gap), x, y + (sy * (gap + length)));
  });
};

export async function composeMenuPdf(pages: PdfPageImage[], options: PdfPrintOptions, title: string) {
  const paper = getPaperDimensionsMm(options);
  const marginMm = getPrintMarginMm(options);
  const bleedMm = Math.max(0, Math.min(10, options.bleedMm || 0));
  const pdf = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: [paper.width, paper.height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({ title: title || 'Cardápio', subject: 'Cardápio exportado pelo AutoMenu', creator: 'AutoMenu' });

  for (const [index, { jpeg, pageSize }] of pages.entries()) {
    if (index) pdf.addPage([paper.width, paper.height], options.orientation);
    const frame = getPrintFrameSizeMm(options, paper, marginMm, pageSize);
    const width = frame.width + 2 * bleedMm;
    const height = frame.height + 2 * bleedMm;
    const x = (paper.width - width) / 2;
    const y = (paper.height - height) / 2;

    if (options.includeCanvasShadow) {
      pdf.setFillColor(203, 213, 225);
      pdf.roundedRect(x + 1.5, y + 1.5, width, height, 1, 1, 'F');
    }
    pdf.addImage(new Uint8Array(await jpeg.arrayBuffer()), 'JPEG', x, y, width, height, `automenu-page-${index}`, 'FAST');
    if (options.cropMarks) drawCropMarks(pdf, x + bleedMm, y + bleedMm, frame.width, frame.height);
    if (options.pageNumbers) {
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(8);
      pdf.text(`Página ${index + 1} de ${pages.length}`, paper.width - Math.max(4, marginMm),
        paper.height - Math.max(3, marginMm / 2), { align: 'right' });
    }
  }
  return pdf.output('blob');
}
