// 単位変換。設計画面はmm(top-left原点)、PDFはpt(bottom-left原点)、ラスタはpx。
export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const PT_PER_MM = PT_PER_INCH / MM_PER_INCH; // ≒2.8346

export const mmToPt = (mm) => (mm * PT_PER_INCH) / MM_PER_INCH;
export const ptToMm = (pt) => (pt * MM_PER_INCH) / PT_PER_INCH;
export const mmToPx = (mm, dpi) => (mm / MM_PER_INCH) * dpi;
export const pxToMm = (px, dpi) => (px * MM_PER_INCH) / dpi;
export const ptToPx = (pt, dpi) => (pt / PT_PER_INCH) * dpi;
export const pxToPt = (px, dpi) => (px * PT_PER_INCH) / dpi;

export const round2 = (n) => Math.round(n * 100) / 100;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
