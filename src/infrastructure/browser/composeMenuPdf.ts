import { CROP_MARK_LENGTH_MM, getExportGeometry, type ExportSettings } from '../../domain/publishing/exportProfiles';
import { jsPDF } from 'jspdf';
import type { ExportPageSize } from '../../domain/publishing/exportProfiles';
import { strFromU8 } from 'fflate';

// Register the compressed four-channel image format with jsPDF's addImage plugin.
Object.assign(jsPDF.API, {
  processCMYK(bytes: Uint8Array, index: number, alias: string) {
    const dimensions = new DataView(bytes.buffer, bytes.byteOffset, 8);
    return {
      width: dimensions.getUint32(0), height: dimensions.getUint32(4),
      data: strFromU8(bytes.subarray(8), true), colorSpace: 'DeviceCMYK',
      bitsPerComponent: 8, filter: 'FlateDecode', index, alias,
    };
  },
});

const drawCropMarks = (
  pdf: jsPDF,
  trimX: number,
  trimY: number,
  trimWidth: number,
  trimHeight: number,
  length: number,
  gap: number,
  color: ExportSettings['color'],
) => {
  if (color === 'CMYK') pdf.setDrawColor(0, 0, 0, 1);
  else pdf.setDrawColor(17, 24, 39);
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

export type ProfilePdfPage = { image: Blob; pageSize: ExportPageSize };

export async function composeMenuPdf(pages: ProfilePdfPage[], settings: ExportSettings, title: string) {
  const geometry = pages.map(page => getExportGeometry(page.pageSize, settings));
  const [first] = geometry;
  const orientation = (width: number, height: number) => width > height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    unit: 'mm', format: [first.totalWidth, first.totalHeight],
    orientation: orientation(first.totalWidth, first.totalHeight), compress: true,
  });
  pdf.setProperties({ title, subject: 'Cardápio exportado pelo AutoMenu', creator: 'AutoMenu' });

  for (const [index, page] of pages.entries()) {
    const { totalWidth, totalHeight, margin, bleedWidth, bleedHeight, trimWidth, trimHeight } = geometry[index];
    if (index) pdf.addPage([totalWidth, totalHeight], orientation(totalWidth, totalHeight));
    const trim = margin + settings.bleed;
    const point = 72 / 25.4;
    const box = (offset: number, width: number, height: number) => ({
      bottomLeftX: offset * point, bottomLeftY: offset * point,
      topRightX: (offset + width) * point, topRightY: (offset + height) * point,
    });
    const context = pdf.getCurrentPageInfo().pageContext;
    context.trimBox = box(trim, trimWidth, trimHeight);
    context.bleedBox = box(margin, bleedWidth, bleedHeight);
    const format = settings.color === 'CMYK' ? 'CMYK' : page.image.type === 'image/png' ? 'PNG' : 'JPEG';
    pdf.addImage(new Uint8Array(await page.image.arrayBuffer()), format, margin, margin, bleedWidth, bleedHeight, `menu-${index}`);
    if (settings.marks) {
      drawCropMarks(pdf, trim, trim, trimWidth, trimHeight, CROP_MARK_LENGTH_MM, settings.bleed + settings.markOffset, settings.color);
    }
  }
  return pdf.output('blob');
}
