/**
 * Positions measured on CADI-TEMPLATE-invoice-2026-10-05.png (1545×2000).
 * x is from the left edge. y is from the top edge. cap is the glyph height.
 */

export const TEMPLATE_W = 1545;
export const TEMPLATE_H = 2000;

export const invoiceTemplate = {
  headerH: 429,
  title: { x: 127, y: 102, cap: 62, track: 0.13 },
  invoiceNo: { x: 129, y: 210, cap: 21, track: 0.02 },
  date: { x: 138, y: 345, cap: 21, track: 0.02 },
  logo: { x: 1091, y: 45, w: 336, h: 176 },
  billTo: { right: 1411, y: 269, cap: 21, track: 0.04 },
  clientName: { right: 1410, y: 316, cap: 21, track: 0.04 },
  address: { right: 1411, y: 363, cap: 21 },
  pill: { x: 40, right: 1520, y: 464, h: 100 },
  pillLabel: { y: 501, cap: 25, track: 0.043 },
  descLabelX: 141,
  descX: 127,
  qtyCenter: 854,
  priceRight: 1178,
  priceLabelRight: 1190,
  totalRight: 1421,
  gray: { x: 72, right: 1478, y: 564, bottom: 1162, radius: 18 },
  rowH: 89,
  rowTextY: 598,
  lineCap: 24,
  lineTrack: 0.056,
  ruleY: 653,
  box: { x: 32, right: 1513, y: 1163, h: 188, radius: 22, border: 3 },
  cellLabelY: 1214,
  cellAmountY: 1275,
  cellCap: 26,
  cellTrack: 0.02,
  cells: { subtotal: 74, processing: 386, promotions: 732, fees: 1049 },
  grand: { right: 1452, labelY: 1197, amountY: 1264, cap: 39, track: 0.04 },
  notes: { x: 80, y: 1399, cap: 30, track: 0.02 },
  footerY: 1670,
  payment: { x: 205, y: 1702, cap: 25, track: 0 },
  contact: { x: 211, y: 1757, cap: 24, line: 46, right: 1333 },
  emailY: 1846,
  thanks: { x: 208, y: 1893, cap: 24, track: 0.52 },
  camera: { x: 1265, y: 1855, w: 72, h: 69 },
} as const;
