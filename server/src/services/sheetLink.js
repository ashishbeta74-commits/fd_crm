// Google Sheets "integration by link": a sheet shared as "Anyone with the link" can be exported
// without credentials via .../export?format=xlsx (all tabs) and .../export?format=csv&gid=N (one tab).
import { createHash } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { isCrmColumn } from '../fields.js';
import { parseWorkbook } from './excel.js';
import { googleFetch, isGoogleConfigured } from './googleAuth.js';

/**
 * Fingerprint of the data in the given tabs (headers + cell values). Two exports of an unchanged
 * sheet produce the same hash even though the .xlsx bytes differ (Google stamps the file), so the
 * auto-sync can tell "changed" from "unchanged" without touching the database.
 */
export function contentHash(sheets, tabNames = null) {
  const h = createHash('sha1');
  for (const s of sheets) {
    if (tabNames && !tabNames.includes(s.name)) continue;
    // "CRM ..." columns are written by the CRM itself (two-way sync); a push must not look like a change.
    const headers = s.headers.filter((x) => !isCrmColumn(x));
    h.update(`\n#${s.name}\n${JSON.stringify(headers)}`);
    for (const r of s.rows) {
      const values = {};
      for (const k of headers) if (r.values[k] !== undefined) values[k] = r.values[k];
      h.update(`\n${r.rowNumber}:${JSON.stringify(values)}`);
    }
  }
  return h.digest('hex');
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * With a service account configured, private sheets shared with it can be exported through the Drive API.
 * Returns null when the account cannot see the file, so the public export is tried next.
 */
async function fetchExportViaApi(spreadsheetId) {
  if (!isGoogleConfigured()) return null;
  let res;
  try {
    res = await googleFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, {
      raw: true,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
  } catch (err) {
    console.warn(`[sheet] Drive export failed for ${spreadsheetId}: ${err.message}`);
    return null;
  }
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new HttpError(413, 'The sheet export is larger than 30 MB');
  let fileName = '';
  try {
    const meta = await googleFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=name`);
    if (meta?.name) fileName = `${meta.name}.xlsx`;
  } catch {
    /* the title is cosmetic */
  }
  return { buffer, fileName };
}

/** Title of the tab whose gid is `gid` (Sheets API), or null when not resolvable. */
async function tabTitleForGid(spreadsheetId, gid) {
  if (!isGoogleConfigured() || !gid) return null;
  try {
    const meta = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
    return meta?.sheets?.find((s) => String(s.properties?.sheetId) === String(gid))?.properties?.title || null;
  } catch {
    return null;
  }
}

const MAX_BYTES = 30 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60_000;

/** Extract { spreadsheetId, gid } from any Google Sheets URL (or a bare spreadsheet id). */
export function parseSheetUrl(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  let m = s.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  const id = m ? m[1] : /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null;
  if (!id) return null;
  m = s.match(/[?#&]gid=(\d+)/);
  return { spreadsheetId: id, gid: m ? m[1] : '' };
}

export const sheetUrl = (spreadsheetId, gid = '') => `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit${gid ? `?gid=${gid}#gid=${gid}` : ''}`;

async function fetchExport(spreadsheetId, format, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=${format}${gid ? `&gid=${gid}` : ''}`;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new HttpError(502, `Could not reach Google Sheets: ${err.message}`);
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('text/html')) {
    if (res.status === 404) throw new HttpError(404, 'Google Sheet not found - check the link');
    throw new HttpError(
      403,
      'This Google Sheet is not shared publicly. In Google Sheets choose Share > General access > "Anyone with the link" (Viewer), then try again.',
    );
  }
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new HttpError(413, 'The sheet export is larger than 30 MB');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new HttpError(413, 'The sheet export is larger than 30 MB');
  const disposition = res.headers.get('content-disposition') || '';
  const fn = disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="?([^";]+)"?/i);
  let fileName = fn ? decodeURIComponent(fn[1]).trim() : '';
  return { buffer, fileName };
}

/**
 * Download the whole workbook as .xlsx and parse it. Also works out which tab the link's gid
 * points to by matching that tab's header row (from a small CSV export).
 * @returns {{ fileName: string, title: string, sheets: any[], linkedSheet: string|null }}
 */
export async function loadSheetByLink(spreadsheetId, gid = '') {
  const { buffer, fileName } = (await fetchExportViaApi(spreadsheetId)) || (await fetchExport(spreadsheetId, 'xlsx'));
  let sheets;
  try {
    sheets = await parseWorkbook(buffer, fileName || `${spreadsheetId}.xlsx`);
  } catch (err) {
    throw new HttpError(400, `Could not read the exported sheet: ${err.message}`);
  }
  if (!sheets.length) throw new HttpError(400, 'No data found in the sheet (a header row needs at least two filled cells)');
  const title = (fileName || '').replace(/\.xlsx$/i, '') || `Google Sheet ${spreadsheetId.slice(0, 8)}`;

  let linkedSheet = null;
  if (gid) {
    const title = await tabTitleForGid(spreadsheetId, gid);
    if (title && sheets.some((s) => s.name === title)) linkedSheet = title;
  }
  if (gid && !linkedSheet) {
    try {
      const { buffer: csv } = await fetchExport(spreadsheetId, 'csv', gid);
      const firstLine = csv.toString('utf8').split(/\r?\n/).find((l) => l.trim()) || '';
      const cells = firstLine.split(',').map((c) => c.replace(/^"|"$/g, '').trim()).filter(Boolean);
      if (cells.length >= 2) {
        const match = sheets.find((s) => cells.every((c) => s.headers.some((h) => h.replace(/ \(\d+\)$/, '') === c)));
        if (match) linkedSheet = match.name;
      }
    } catch {
      /* the gid tab could not be resolved - fall back to the first sheet */
    }
  }
  if (!linkedSheet && (gid === '0' || !gid)) linkedSheet = sheets[0].name;
  return { fileName: fileName || `${title}.xlsx`, title, sheets, linkedSheet };
}
