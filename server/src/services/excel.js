import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

const MAX_COLUMNS = 200;

/** Normalise an ExcelJS cell value to string | number | Date | null. */
export function cellToValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('').trim();
    if ('formula' in v || 'sharedFormula' in v) return cellToValue(v.result ?? null);
    if ('text' in v) return cellToValue(v.text); // hyperlink cell
    if ('error' in v) return null;
  }
  return String(v).trim();
}

/** Human-readable text for previews / storage in text fields. */
export function valueToText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const iso = v.toISOString();
    const time = iso.slice(11, 16);
    if (v.getUTCFullYear() < 1901) return time; // time-only cell
    return time === '00:00' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${time}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  return String(v).trim();
}

function columnLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function parseSheet(ws) {
  const maxScan = Math.min(ws.rowCount || 0, 30);
  let headerRowNum = 0;
  for (let r = 1; r <= maxScan; r += 1) {
    let count = 0;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (valueToText(cellToValue(cell.value))) count += 1;
    });
    if (count >= 2) {
      headerRowNum = r;
      break;
    }
  }
  if (!headerRowNum) return null;

  const headerRow = ws.getRow(headerRowNum);
  const colCount = Math.min(MAX_COLUMNS, Math.max(ws.columnCount || 0, headerRow.cellCount || 0));
  const headers = [];
  const seen = new Set();
  for (let c = 1; c <= colCount; c += 1) {
    let h = valueToText(cellToValue(headerRow.getCell(c).value));
    if (!h) h = `Column ${columnLetter(c)}`;
    const base = h;
    let i = 2;
    while (seen.has(h)) h = `${base} (${i++})`;
    seen.add(h);
    headers.push(h);
  }

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNum) return;
    const values = {};
    let has = false;
    headers.forEach((h, idx) => {
      const v = cellToValue(row.getCell(idx + 1).value);
      if (v !== null && v !== '') {
        has = true;
        values[h] = v;
      }
    });
    if (has) rows.push({ rowNumber, values });
  });

  // Drop unnamed columns that never carry data.
  const usedHeaders = headers.filter((h) => !h.startsWith('Column ') || rows.some((r) => r.values[h] !== undefined));
  return { name: ws.name, headers: usedHeaders, rows, rowCount: rows.length, headerRow: headerRowNum };
}

/**
 * Parse an .xlsx/.xlsm/.csv buffer into sheets: { name, headers, rows: [{ rowNumber, values }], rowCount }.
 * The header row is the first row with at least two non-empty cells.
 */
export async function parseWorkbook(buffer, fileName = '') {
  const wb = new ExcelJS.Workbook();
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || ext === 'txt') {
    await wb.csv.read(Readable.from(buffer));
  } else {
    await wb.xlsx.load(buffer);
  }
  const sheets = [];
  wb.eachSheet((ws) => {
    const parsed = parseSheet(ws);
    if (parsed) sheets.push(parsed);
  });
  return sheets;
}
