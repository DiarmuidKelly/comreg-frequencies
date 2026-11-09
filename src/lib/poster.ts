/**
 * Builds the printable spectrum poster as a vector PDF, in the browser.
 *
 * The poster is laid out as nine staves, one per ITU band, each a logarithmic
 * decade. Stacking decades is what makes the plan legible on paper: on a single
 * axis the whole of VLF to HF would occupy a few millimetres, whereas a stave per
 * decade gives every part of the spectrum the same width.
 *
 * Drawn with jsPDF's vector primitives rather than rasterising the on-screen SVG,
 * so text stays selectable and the file stays small at A0.
 */
import { jsPDF } from 'jspdf';
import { PALETTES, type Mode } from './palette';
import {
  FAMILIES,
  ITU_BANDS,
  dominantFamily,
  familiesOf,
  formatHz,
  plotRange,
} from './spectrum';
import type { SpectrumData } from './types';

export type PaperSize = 'a0' | 'a1' | 'a2' | 'a3';

export interface PosterOptions {
  size: PaperSize;
  mode: Mode;
  /** Band ids to draw at full strength; everything else is recessed. Null = all. */
  highlight: Set<number> | null;
  /** Describes the filter that produced `highlight`, printed under the title. */
  subtitle?: string;
}

/** Millimetre dimensions, landscape. */
const PAPER: Record<PaperSize, [number, number]> = {
  a0: [1189, 841],
  a1: [841, 594],
  a2: [594, 420],
  a3: [420, 297],
};

export async function buildPoster(data: SpectrumData, options: PosterOptions): Promise<jsPDF> {
  const [pageW, pageH] = PAPER[options.size];
  const palette = PALETTES[options.mode];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pageW, pageH], compress: true });

  // Scale every length off the page width so all four sizes look the same.
  const k = pageW / PAPER.a1[0];
  const margin = 14 * k;
  const titleH = 30 * k;
  const legendH = 16 * k;
  const footerH = 10 * k;

  doc.setFont('helvetica', 'normal');
  paint(doc, palette.plane, 0, 0, pageW, pageH);

  drawTitle(doc, data, options, { x: margin, y: margin, w: pageW - margin * 2, h: titleH, k, palette });
  drawLegend(doc, { x: margin, y: margin + titleH, w: pageW - margin * 2, h: legendH, k, palette });

  const stavesTop = margin + titleH + legendH + 4 * k;
  const stavesH = pageH - stavesTop - footerH - margin;
  const gap = 3 * k;
  const staveH = (stavesH - gap * (ITU_BANDS.length - 1)) / ITU_BANDS.length;
  const labelW = 46 * k;

  ITU_BANDS.forEach((itu, i) => {
    drawStave(doc, data, options, {
      itu,
      x: margin,
      y: stavesTop + i * (staveH + gap),
      w: pageW - margin * 2,
      h: staveH,
      labelW,
      k,
      palette,
    });
  });

  drawFooter(doc, data, { x: margin, y: pageH - margin - 2 * k, w: pageW - margin * 2, k, palette });
  return doc;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  k: number;
  palette: (typeof PALETTES)['light'];
}

function drawTitle(
  doc: jsPDF,
  data: SpectrumData,
  options: PosterOptions,
  { x, y, w, k, palette }: Box,
) {
  doc.setTextColor(palette.textPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26 * k);
  doc.text('The Irish Radio Spectrum', x, y + 9 * k);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5 * k);
  doc.setTextColor(palette.textSecondary);
  doc.text(
    `Radio Frequency Plan for Ireland · ${data.meta.bandCount} allocated bands from 3 kHz to 3 THz · ComReg`,
    x,
    y + 16 * k,
  );
  if (options.subtitle) {
    doc.setTextColor(palette.muted);
    doc.setFontSize(8.5 * k);
    doc.text(options.subtitle, x, y + 22 * k);
  }

  // Right-hand reading note.
  doc.setFontSize(8 * k);
  doc.setTextColor(palette.muted);
  const note = 'Each stave is one ITU band, plotted logarithmically — every decade gets equal width.';
  doc.text(note, x + w, y + 16 * k, { align: 'right' });
}

function drawLegend(doc: jsPDF, { x, y, k, palette }: Box) {
  doc.setFontSize(8.5 * k);
  let cursor = x;
  const swatch = 3.6 * k;
  for (const family of FAMILIES) {
    paint(doc, palette.series[family.slot], cursor, y + 4 * k, swatch, swatch);
    doc.setTextColor(palette.textSecondary);
    doc.text(family.label, cursor + swatch + 1.6 * k, y + 7 * k);
    cursor += swatch + 2 * k + doc.getTextWidth(family.label) + 7 * k;
  }
}

interface StaveBox extends Box {
  itu: (typeof ITU_BANDS)[number];
  labelW: number;
}

function drawStave(
  doc: jsPDF,
  data: SpectrumData,
  options: PosterOptions,
  { itu, x, y, w, h, labelW, k, palette }: StaveBox,
) {
  // Row header.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5 * k);
  doc.setTextColor(palette.textPrimary);
  doc.text(itu.abbr, x, y + h / 2 - 0.5 * k);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7 * k);
  doc.setTextColor(palette.muted);
  doc.text(itu.name, x, y + h / 2 + 3.4 * k);
  doc.text(`${formatHz(itu.lo)} – ${formatHz(itu.hi)}`, x, y + h / 2 + 7 * k);

  const plotX = x + labelW;
  const plotW = w - labelW;
  const ribbonH = h - 7 * k;

  paint(doc, palette.surface, plotX, y, plotW, ribbonH);

  const decades = Math.log10(itu.hi / itu.lo);
  const toX = (hz: number) =>
    plotX + (Math.log10(clamp(hz, itu.lo, itu.hi) / itu.lo) / decades) * plotW;

  for (const band of data.bands) {
    const range = plotRange(band);
    if (!range) continue;
    if (range.hi <= itu.lo || range.lo >= itu.hi) continue;

    const x0 = toX(range.lo);
    const x1 = toX(range.hi);
    const bw = Math.max(0.12 * k, x1 - x0);
    const family = dominantFamily(band);
    const lit = options.highlight === null || options.highlight.has(band.id);

    paint(doc, lit ? palette.series[family?.slot ?? 0] : palette.gridline, x0, y, bw, ribbonH);

    // Hairline separator, only where there is room for one.
    if (bw > 0.5 * k) {
      doc.setDrawColor(palette.surface);
      doc.setLineWidth(0.12 * k);
      doc.line(x0, y, x0, y + ribbonH);
    }

    if (!lit) continue;

    // Band labels run vertically, as on the classic spectrum wall charts.
    if (bw >= 2.1 * k) {
      doc.setTextColor(readableInk(palette.series[family?.slot ?? 0]));
      doc.setFontSize(Math.min(6.4, Math.max(3.9, bw / k * 1.5)) * k);
      const label = band.n.replace(/\s*-\s*/, '–');
      doc.text(label, x0 + bw / 2 + 1.1 * k, y + ribbonH - 1.5 * k, {
        angle: 90,
        maxWidth: ribbonH - 3 * k,
      });
      if (bw >= 7 * k) {
        const families = familiesOf(band).map((f) => f.label).join(' · ');
        doc.setFontSize(4.4 * k);
        doc.text(families, x0 + bw / 2 - 2.2 * k, y + ribbonH - 1.5 * k, {
          angle: 90,
          maxWidth: ribbonH - 3 * k,
        });
      }
    }
  }

  // Frame and 1-2-5 ticks.
  doc.setDrawColor(palette.axis);
  doc.setLineWidth(0.18 * k);
  doc.rect(plotX, y, plotW, ribbonH);

  doc.setFontSize(6.2 * k);
  doc.setTextColor(palette.muted);
  for (const tick of staveTicks(itu.lo, itu.hi)) {
    const tx = toX(tick);
    doc.setDrawColor(palette.axis);
    doc.line(tx, y + ribbonH, tx, y + ribbonH + 1.3 * k);
    doc.text(formatHz(tick, 1), tx, y + ribbonH + 5 * k, { align: 'center' });
  }
}

function drawFooter(
  doc: jsPDF,
  data: SpectrumData,
  { x, y, w, k, palette }: Omit<Box, 'h'>,
) {
  doc.setFontSize(7.5 * k);
  doc.setTextColor(palette.muted);
  doc.text(
    `Data: ComReg Radio Frequency Plan for Ireland (rfpi.comreg.ie), snapshot ${data.meta.generatedAt}. Not an official ComReg publication.`,
    x,
    y,
  );
  doc.text(`Generated ${new Date().toISOString().slice(0, 10)}`, x + w, y, { align: 'right' });
}

// --- helpers ---------------------------------------------------------------

function paint(doc: jsPDF, hex: string, x: number, y: number, w: number, h: number) {
  doc.setFillColor(hex);
  doc.rect(x, y, w, h, 'F');
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

/** Black or white ink, whichever has more contrast against the fill. */
function readableInk(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.42 ? '#0b0b0b' : '#ffffff';
}

/** 1-2-5 ticks inside a single decade, inclusive of both edges. */
function staveTicks(lo: number, hi: number): number[] {
  const exp = Math.round(Math.log10(lo));
  const out = [1, 1.5, 2, 3, 5, 7, 10].map((step) => step * 10 ** exp);
  return out.filter((v) => v >= lo * 0.999 && v <= hi * 1.001);
}

export function posterFilename(options: PosterOptions): string {
  const scope = options.highlight ? 'filtered' : 'full';
  return `irish-radio-spectrum-${scope}-${options.size}-${new Date().toISOString().slice(0, 10)}.pdf`;
}
