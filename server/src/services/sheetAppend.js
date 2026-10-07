// Append one row to a tab of a linked Google Sheet (a row added in the CRM lands in the sheet too).
// Needs the service account (GOOGLE_SERVICE_ACCOUNT_FILE / _JSON) with Editor access to the sheet;
// without it `appendSheetRow` throws a readable HttpError and the caller keeps the row in the CRM only.
import { HttpError } from '../lib/errors.js';
import { googleAuthInfo, googleFetch, isGoogleConfigured } from './googleAuth.js';
import { nameHeaders } from './writeback.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const quoteTab = (title) => `'${String(title).replace(/'/g, "''")}'`;
const filled = (row) => row.filter((v) => String(v ?? '').trim()).length;

/** Throws when rows cannot be written to sheets at all (no service account). */
export function requireSheetWrite() {
  if (isGoogleConfigured()) return;
  const info = googleAuthInfo();
  throw new HttpError(400, info.error || 'Writing to Google Sheets needs the Google service account (GOOGLE_SERVICE_ACCOUNT_FILE on the API host) with Editor access to the sheet');
}

/**
 * The tab's real title for a name the CRM knows. Workbook exports truncate titles to 31 characters, so
 * "DAILY ENQUIRY SHEET - OWNER (H " must match the untruncated title.
 */
export async function resolveTab(spreadsheetId, tab) {
  const meta = await googleFetch(`${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  const titles = (meta.sheets || []).map((s) => s.properties.title);
  const want = String(tab || '').trimEnd();
  const title = titles.find((t) => t === tab) || titles.find((t) => t.trimEnd() === want) || (want.length >= 30 ? titles.find((t) => t.startsWith(want)) : null);
  if (!title) throw new HttpError(404, `The sheet has no tab called "${tab}"`);
  return title;
}

/** Same header-row rule as excel.js: the first row with 2+ filled cells, unless the next row has twice as many. */
export function findHeaderIndex(rows) {
  const max = Math.min(rows.length, 30);
  for (let i = 0; i < max; i += 1) {
    const n = filled(rows[i] || []);
    if (n < 2) continue;
    const next = i + 1 < max ? filled(rows[i + 1] || []) : 0;
    if (next >= n * 2) continue;
    return i;
  }
  return -1;
}

/**
 * Read the tab's header row: { title, headerIndex, headers } (headers named like the importer names
 * them: blanks "Column C", repeats "(2)"), so callers can map their fields onto the sheet's columns.
 */
export async function readTabHeaders(spreadsheetId, tab) {
  requireSheetWrite();
  const title = await resolveTab(spreadsheetId, tab);
  const data = await googleFetch(`${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${quoteTab(title)}!1:30`)}?majorDimension=ROWS`);
  const rows = data.values || [];
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex === -1) throw new HttpError(400, `Tab "${title}" has no header row`);
  return { title, headerIndex, headers: nameHeaders(rows[headerIndex]) };
}

/**
 * Append one row under the tab's table. `cells` = { header -> value } (missing headers stay empty;
 * values are written as a person would type them, so "2026-10-07" becomes a date).
 * @returns {{ title: string, rowNumber: number }} the 1-based row the values landed in
 */
export async function appendSheetRow(spreadsheetId, tab, cells) {
  const { title, headerIndex, headers } = await readTabHeaders(spreadsheetId, tab);
  const values = headers.map((h) => {
    const v = cells[h];
    return v === undefined || v === null ? '' : v;
  });
  const range = `${quoteTab(title)}!A${headerIndex + 1}`;
  const res = await googleFetch(`${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: { majorDimension: 'ROWS', values: [values] },
  });
  const m = String(res?.updates?.updatedRange || '').match(/![A-Z]+(\d+)/);
  return { title, rowNumber: m ? Number(m[1]) : 0, headers };
}
