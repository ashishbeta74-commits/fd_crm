// Re-sync linked Google Sheets.
//  - manual:    POST /api/imports/:id/resync  (always imports)
//  - automatic: every SHEET_SYNC_MINUTES the server re-downloads each linked sheet, fingerprints the
//               linked tabs and imports only when the content changed ("sync on change").
import { ImportBatch } from '../models/ImportBatch.js';
import { LinkedSheet } from '../models/LinkedSheet.js';
import { HttpError } from '../lib/errors.js';
import { contentHash, loadSheetByLink, sheetUrl } from './sheetLink.js';
import { runImport } from './importer.js';
import { suggestMapping } from '../lib/mapping.js';
import { isMultiField } from '../fields.js';

/**
 * Columns added to a tab after it was imported are not in the stored mapping. Map them the way a
 * fresh import would, but only to fields the plan does not use yet (so a new "Title" column lands
 * in `title` instead of "Other columns"). Returns new plan objects; the stored ones are untouched.
 */
export function extendPlans(plans, sheets) {
  return plans.map((plan) => {
    const sheet = sheets.find((s) => s.name === plan.name);
    if (!plan.include || !sheet) return plan;
    const known = new Set(Object.keys(plan.mapping || {}));
    const fresh = sheet.headers.filter((h) => !known.has(h));
    if (!fresh.length) return plan;
    const used = new Set(Object.values(plan.mapping || {}).filter(Boolean));
    const suggested = suggestMapping(fresh);
    const mapping = { ...plan.mapping };
    for (const h of fresh) {
      const key = suggested[h];
      mapping[h] = key && (!used.has(key) || isMultiField(key)) ? key : '';
      if (mapping[h]) used.add(key);
    }
    return { ...plan, mapping };
  });
}

const SYNC_MINUTES = Number(process.env.SHEET_SYNC_MINUTES) || 0;
const STAGGER_MS = 2000; // pause between sheets so Google does not throttle the export endpoint
const MAX_BACKOFF_CYCLES = 30;

// In-memory status per spreadsheet (reset on restart): failure backoff for the automatic sync.
// The outcome of the last check (synced / unchanged / error + message) is also stored on the
// LinkedSheet entry so the Import page can show it after a restart.
const status = new Map();
const getStatus = (id) => status.get(id) || {};
const setStatus = (id, patch) => status.set(id, { ...getStatus(id), ...patch });

async function recordCheck(spreadsheetId, result, error = '') {
  const checkedAt = new Date();
  setStatus(spreadsheetId, { checkedAt, result, error: error || null });
  await LinkedSheet.updateOne({ spreadsheetId }, { $set: { lastCheckedAt: checkedAt, lastCheck: result, lastError: error || '' } }).catch(() => {});
}

export const autoSyncInfo = () => ({ enabled: SYNC_MINUTES > 0, minutes: SYNC_MINUTES, onChangeOnly: true });

/**
 * The saved sheet list (LinkedSheet) merged with the latest usable import batch per spreadsheet
 * (undone batches are skipped). Sheets that are saved but not imported yet have lastBatchId = null.
 */
export async function listSources() {
  const [batches, saved] = await Promise.all([
    ImportBatch.find({ 'source.type': 'google-sheet', undoneAt: null, status: 'done', plans: { $ne: null } }).sort({ createdAt: -1 }).lean(),
    LinkedSheet.find().sort({ date: -1, createdAt: 1 }).lean(),
  ]);
  const latest = new Map();
  for (const b of batches) if (!latest.has(b.source.spreadsheetId)) latest.set(b.source.spreadsheetId, b);
  const savedById = new Map(saved.map((e) => [e.spreadsheetId, e]));

  const row = (spreadsheetId, b, e) => {
    const st = getStatus(spreadsheetId);
    const gid = b?.source.gid || e?.gid || '';
    return {
      spreadsheetId,
      gid,
      url: b?.source.url || e?.url || sheetUrl(spreadsheetId, gid),
      sheetId: e?._id || null,
      name: e?.name || b?.source.listName || b?.source.title || b?.fileName || '',
      dateLabel: e?.dateLabel || '',
      date: e?.date || null,
      note: e?.note || '',
      title: b?.source.title || b?.fileName || e?.name || '',
      listName: b?.source.listName || b?.source.title || b?.fileName || e?.name || '',
      requirePhone: b ? b.requirePhone !== false : true,
      lastBatchId: b?._id || null,
      lastSyncedAt: b ? b.syncedAt || b.createdAt : null,
      lastChangeAt: b ? (b.resyncOf || b.totals?.created ? b.syncedAt || b.createdAt : b.createdAt) : null,
      lastCheckedAt: e?.lastCheckedAt || st.checkedAt || null,
      lastCheck: e?.lastCheck || st.result || null, // 'unchanged' | 'synced' | 'error'
      lastError: e?.lastError || st.error || null,
      totals: b?.totals || null,
      strategy: b?.strategy || null,
      updateStage: b?.updateStage || false,
      writeBack: {
        enabled: Boolean(e?.writeBack?.enabled),
        updateMappedColumns: Boolean(e?.writeBack?.updateMappedColumns),
        lastPushAt: e?.writeBack?.lastPushAt || null,
        lastPushResult: e?.writeBack?.lastPushResult || '',
        lastPushError: e?.writeBack?.lastPushError || '',
        lastPushCount: e?.writeBack?.lastPushCount || 0,
        lastPushUnmatched: e?.writeBack?.lastPushUnmatched || 0,
      },
    };
  };
  const items = [];
  for (const [id, b] of latest) items.push(row(id, b, savedById.get(id)));
  for (const e of saved) if (!latest.has(e.spreadsheetId)) items.push(row(e.spreadsheetId, null, e));
  const t = (d) => (d ? new Date(d).getTime() : 0);
  return items.sort((a, b) => t(b.date) - t(a.date) || t(b.lastSyncedAt) - t(a.lastSyncedAt));
}

/**
 * Re-run a Google Sheet import with the plans stored on a previous batch.
 * With `force: false` the import is skipped when the linked tabs' content is unchanged and
 * { unchanged: true, batch } is returned instead of a new batch.
 */
export async function resyncBatch(batchOrId, { strategy, updateStage, requirePhone, force = true } = {}) {
  const batch = typeof batchOrId === 'string' || batchOrId?._bsontype ? await ImportBatch.findById(batchOrId).lean() : batchOrId;
  if (!batch) throw new HttpError(404, 'Import not found');
  if (batch.source?.type !== 'google-sheet' || !batch.plans) throw new HttpError(400, 'This import did not come from a Google Sheet link');

  const { spreadsheetId, gid } = batch.source;
  let loaded;
  try {
    loaded = await loadSheetByLink(spreadsheetId, gid);
  } catch (err) {
    await recordCheck(spreadsheetId, 'error', err.message);
    throw err;
  }
  const plans = extendPlans(batch.plans, loaded.sheets);
  const includedTabs = plans.filter((p) => p.include).map((p) => p.name);
  const hash = contentHash(loaded.sheets, includedTabs);
  // Unchanged when the content matches the batch's hash, or the hash this process computed last time.
  // The second check matters when another API instance (a deploy, a teammate's machine) syncs the same
  // database with a different parser version: its batches carry a different hash for the same sheet, and
  // without it the two instances would re-import each other's batches forever.
  if (!force && hash && ((batch.source.contentHash && hash === batch.source.contentHash) || getStatus(spreadsheetId).lastHash === hash)) {
    setStatus(spreadsheetId, { lastHash: hash });
    await recordCheck(spreadsheetId, 'unchanged');
    return { unchanged: true, batch };
  }
  setStatus(spreadsheetId, { lastHash: hash });
  const upload = {
    fileName: loaded.fileName,
    sheets: loaded.sheets,
    source: {
      type: 'google-sheet',
      url: batch.source.url || sheetUrl(spreadsheetId, gid),
      spreadsheetId,
      gid,
      title: loaded.title,
      contentHash: hash,
    },
  };
  // updateStage defaults to false on sync: stages set in the CRM (Ready, Converted, Done, ...) are kept;
  // the sheet still moves contacts in the call-progress stages (New/Started/Connected/Voice Mail/Wrong Number)
  // and always adds new call rounds.
  try {
    const result = await runImport({
      upload,
      plans,
      strategy: strategy || 'update',
      updateStage: updateStage ?? false,
      requirePhone: requirePhone ?? batch.requirePhone !== false,
      listName: batch.source.listName || '',
      resyncOf: batch._id,
    });
    await recordCheck(spreadsheetId, 'synced');
    return result;
  } catch (err) {
    await recordCheck(spreadsheetId, 'error', err.message);
    throw err;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One polling cycle over every linked sheet: fetch, compare fingerprint, import when changed. */
export async function syncChangedSheets({ log = console.log } = {}) {
  const sources = await listSources();
  const summary = { checked: 0, synced: 0, unchanged: 0, errors: 0, skipped: 0 };
  for (const s of sources) {
    if (!s.lastBatchId) continue; // saved in the sheet list but not imported yet
    const st = getStatus(s.spreadsheetId);
    if (st.skipCycles > 0) {
      setStatus(s.spreadsheetId, { skipCycles: st.skipCycles - 1 });
      summary.skipped += 1;
      continue;
    }
    summary.checked += 1;
    try {
      const r = await resyncBatch(String(s.lastBatchId), { force: false });
      setStatus(s.spreadsheetId, { failures: 0 });
      if (r.unchanged) {
        summary.unchanged += 1;
      } else {
        summary.synced += 1;
        log(`[sync] ${s.listName}: changed -> ${r.totals.created} created, ${r.totals.updated} updated, ${r.totals.noPhone} without phone skipped`);
      }
    } catch (err) {
      summary.errors += 1;
      const failures = (st.failures || 0) + 1;
      // Back off after repeated failures (private sheet, throttling): 1, 2, 4 ... up to 30 cycles.
      const skipCycles = failures >= 3 ? Math.min(2 ** (failures - 3), MAX_BACKOFF_CYCLES) : 0;
      setStatus(s.spreadsheetId, { failures, skipCycles });
      if (failures <= 3 || failures % 10 === 0) log(`[sync] ${s.listName}: ${err.message}${skipCycles ? ` (retrying in ${skipCycles + 1} cycles)` : ''}`);
    }
    await sleep(STAGGER_MS);
  }
  return summary;
}

let timer = null;
let running = false;

export function startAutoSync() {
  if (!SYNC_MINUTES) {
    console.log('[sync] automatic Google Sheet sync is off (set SHEET_SYNC_MINUTES to enable)');
    return;
  }
  console.log(`[sync] linked Google Sheets are checked every ${SYNC_MINUTES} min and re-imported when their content changed`);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const s = await syncChangedSheets();
      if (s.synced || s.errors) console.log(`[sync] cycle: ${s.checked} checked, ${s.synced} changed, ${s.unchanged} unchanged, ${s.errors} errors, ${s.skipped} backing off`);
    } catch (err) {
      console.error('[sync] cycle failed:', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 15_000).unref?.(); // first check shortly after start-up
  timer = setInterval(tick, SYNC_MINUTES * 60 * 1000);
  timer.unref?.();
}
