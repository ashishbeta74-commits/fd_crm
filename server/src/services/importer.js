import { Contact } from '../models/Contact.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { LinkedSheet } from '../models/LinkedSheet.js';
import { FIELD_KEYS, MULTI_FIELDS, TEXT_FIELDS, guessCategory, isCrmColumn, priorityRank, stageLabel } from '../fields.js';
import { isoDate, parseDate, parseTime } from '../lib/dates.js';
import { composeLocation, normalizeCountry, normalizeRegion, splitLocation } from '../lib/geo.js';
import { matchPriority, matchStage, parseStatus, splitTags } from '../lib/status.js';
import { normalizeTags } from '../models/Contact.js';
import { computeDedupeKey, suggestMapping } from '../lib/mapping.js';
import { runPool } from '../lib/pool.js';
import { valueToText } from './excel.js';

const joinWith = (a, b, sep = '\n') => (a && b ? `${a}${sep}${b}` : a || b || '');
const joinText = (a, b) => joinWith(a, b, '\n');
const safeKey = (h) => String(h).replace(/[.$]/g, '_').trim() || 'column';
// Calendar dates from sheets are UTC midnight; call timestamps are shown in local time, so anchor them
// at noon UTC to keep the same calendar day in every timezone.
const atNoon = (d) => new Date(d.getTime() + 12 * 60 * 60 * 1000);

// Stages that record the result of a call (the contact was dialled).
const CALLED_STAGES = new Set(['connected', 'voicemail', 'wrong_number', 'hung_up', 'not_interested']);
// Stages a sheet re-sync may still move without the "update stage" option: the call-progress stages.
const SHEET_MOVABLE_STAGES = new Set(['new', 'started', ...CALLED_STAGES]);

/**
 * Convert one spreadsheet row into a contact document (plain object) using the header->field mapping.
 * Returns null when the row has no mapped data at all.
 *
 * Calling-sheet columns (Date Of Calling / Status, Follow Up 1 / Status, Follow Up 2 / Status)
 * become a call history: one 'call' activity per round with a result, the decisive result sets
 * the stage, and a follow-up date without a result becomes the next follow-up.
 */
export function buildContact(values, mapping, ctx) {
  const c = { extra: {}, booking: { date: null, time: '', note: '', bookedAt: null }, followUp: null, notes: '', tags: [], priority: '' };
  const rounds = { calledOn: null, followUp1: null, followUp1Status: '', followUp2: null, followUp2Status: '' };
  let stageCol = null;
  let statusText = '';
  let hasData = false;

  for (const header of Object.keys(values)) {
    // "CRM ..." columns are what the two-way sync wrote back; the CRM is their source of truth.
    if (isCrmColumn(header)) continue;
    const raw = values[header];
    // Mappings saved before call outcomes became stages may still say "callOutcome": read them as the stage.
    const key = mapping[header] === 'callOutcome' ? 'stage' : mapping[header] || '';
    const text = valueToText(raw);
    if (!key || !FIELD_KEYS.includes(key)) {
      if (text) c.extra[safeKey(header)] = text;
      continue;
    }
    if (!text) continue;
    hasData = true;
    switch (key) {
      case 'tags':
        c.tags.push(...splitTags(text));
        break;
      case 'priority': {
        const p = matchPriority(text);
        if (p) c.priority = p;
        else c.extra[safeKey(header)] = text;
        break;
      }
      case 'followUp': {
        const d = parseDate(raw);
        if (d) c.followUp = d;
        else c.followUpNote = joinWith(c.followUpNote, text, ' / ');
        break;
      }
      case 'calledOn':
      case 'followUp1':
      case 'followUp2': {
        const d = parseDate(raw);
        if (d) rounds[key] = d;
        else c.followUpNote = joinWith(c.followUpNote, `${key === 'calledOn' ? 'Called' : 'Follow-up'}: ${text}`, ' / ');
        break;
      }
      case 'followUp1Status':
      case 'followUp2Status':
        rounds[key] = text;
        break;
      case 'bookingDate': {
        const d = parseDate(raw);
        if (d) c.booking.date = d;
        else c.booking.note = joinText(c.booking.note, text);
        break;
      }
      case 'bookingTime':
        c.booking.time = parseTime(raw) || text;
        break;
      case 'stage': {
        // Two mapped columns (e.g. "Stage" + "Started"): a pipeline stage beats a plain call result.
        const s = matchStage(text);
        if (s && (!stageCol || CALLED_STAGES.has(stageCol))) stageCol = s;
        else if (!s) statusText = joinWith(statusText, text, ' / ');
        break;
      }
      case 'email':
      case 'primaryEmail':
      case 'secondaryEmail':
        c[key] = text.toLowerCase();
        break;
      default:
        if (MULTI_FIELDS[key]) c[key] = joinWith(c[key], text, MULTI_FIELDS[key]);
        else c[key] = text;
    }
  }
  if (!hasData) return null;
  if (statusText) c.status = joinWith(c.status, statusText, ' / ');
  // Where they are: the sheet gives either a free-text location or city / state columns; fill the other from it.
  if (!c.city && !c.state && !c.country && c.location) Object.assign(c, splitLocation(c.location));
  else if (c.country) c.country = normalizeCountry(c.country) || c.country;
  if (c.state && normalizeRegion(c.state)) {
    const r = normalizeRegion(c.state);
    c.state = r.name;
    if (!c.country) c.country = r.country;
  }
  if (!c.location) c.location = composeLocation(c);

  // ---- call history ----
  const hasRounds = Boolean(rounds.calledOn || rounds.followUp1 || rounds.followUp2 || rounds.followUp1Status || rounds.followUp2Status);
  const events = hasRounds
    ? [
        { label: '1st call', date: rounds.calledOn, status: c.status || '' },
        { label: 'Follow-up 1', date: rounds.followUp1, status: rounds.followUp1Status },
        { label: 'Follow-up 2', date: rounds.followUp2, status: rounds.followUp2Status },
      ].filter((e) => e.date || e.status)
    : [];
  const callActivities = [];
  let latest = null; // last round with any result (raw status text, last-contacted date)
  let decisive = null; // the round that decides the stage: a plain "voicemail" never overrides an earlier real answer
  let pendingFollowUp = null;
  let lastDate = null;
  for (const e of events) {
    if (e.status) {
      const stage = matchStage(e.status);
      latest = e;
      if (!decisive || stage !== 'voicemail') decisive = e;
      if (e.date && (!lastDate || e.date > lastDate)) lastDate = e.date;
      callActivities.push({ type: 'call', source: 'import', at: e.date ? atNoon(e.date) : new Date(), message: `${e.label}: ${e.status}` });
    } else if (e.date) {
      pendingFollowUp = e;
    }
  }
  if (latest) c.status = latest.status === decisive.status ? latest.status : `${decisive.status} (latest: ${latest.status})`;
  // Follow-up rounds with a result ("Follow Up 1 / Status", "Follow Up 2 / Status") are follow-ups already done.
  c.followUpCount = events.filter((e) => e.label !== '1st call' && e.status).length;
  if (c.booking.date) c.booking.bookedAt = new Date();
  if (pendingFollowUp && !c.followUp) c.followUp = pendingFollowUp.date;
  if (lastDate) c.lastContactedAt = atNoon(lastDate);

  // ---- stage ----
  const parsed = parseStatus(decisive ? decisive.status : c.status);
  let explicitStage = stageCol ?? parsed.stage ?? null;
  if (!explicitStage && latest) explicitStage = 'started';
  c.stage = explicitStage ?? ctx.defaultStage ?? 'new';
  if (c.booking.date && !stageCol && !parsed.stage && (c.stage === 'new' || c.stage === 'started')) {
    c.stage = 'future_booking';
  }
  c.explicitStage = Boolean(explicitStage);
  if (CALLED_STAGES.has(c.stage) && !c.lastContactedAt) c.lastContactedAt = new Date();
  c.tags = normalizeTags(c.tags);
  c.priorityRank = priorityRank(c.priority);
  // Who they are: the list's chosen type, else a guess from the list name and the job title.
  c.category = ctx.category || guessCategory({ sheetName: ctx.listName, title: c.title });

  c.dedupeKey = computeDedupeKey(c);
  c.source = { fileName: ctx.fileName, sheetName: ctx.listName, tabName: ctx.sheetName, row: ctx.rowNumber, batchId: ctx.batchId };
  c.importBatchIds = [ctx.batchId];
  c.activities = [
    { type: 'import', source: 'import', message: `Imported from "${ctx.listName}" (${ctx.sheetName}, row ${ctx.rowNumber})`, at: new Date() },
    ...callActivities,
  ];
  return c;
}

const hasPhone = (c) => String(c.contactMain || '').replace(/\D/g, '').length >= 6;

const activityKey = (a) => `${a.type}|${a.message}|${a.at ? new Date(a.at).toISOString().slice(0, 10) : ''}`;

/** Merge a duplicate row (same dedupe key, same sheet) into the first occurrence. */
function mergeContact(target, dup) {
  for (const k of TEXT_FIELDS) {
    if (MULTI_FIELDS[k]) {
      if (dup[k] && !(target[k] || '').includes(dup[k])) target[k] = joinWith(target[k], dup[k], MULTI_FIELDS[k]);
    } else if (!target[k] && dup[k]) target[k] = dup[k];
  }
  if (!target.followUp && dup.followUp) target.followUp = dup.followUp;
  if (!target.booking.date && dup.booking.date) target.booking = { ...dup.booking };
  target.followUpCount = Math.max(target.followUpCount || 0, dup.followUpCount || 0);
  if (!target.explicitStage && dup.explicitStage) {
    target.stage = dup.stage;
    target.explicitStage = true;
  }
  if (dup.lastContactedAt && (!target.lastContactedAt || dup.lastContactedAt > target.lastContactedAt)) target.lastContactedAt = dup.lastContactedAt;
  target.tags = normalizeTags([...target.tags, ...dup.tags]);
  if (priorityRank(dup.priority) > priorityRank(target.priority)) {
    target.priority = dup.priority;
    target.priorityRank = dup.priorityRank;
  }
  const seen = new Set(target.activities.map(activityKey));
  for (const a of dup.activities) if (a.type === 'call' && !seen.has(activityKey(a))) target.activities.push(a);
  target.extra = { ...dup.extra, ...target.extra };
}

async function writeContact(c, { strategy, updateStage, batchId, sheetName, listName }) {
  const { explicitStage, ...doc } = c;
  const existing = doc.dedupeKey ? await Contact.findOne({ dedupeKey: doc.dedupeKey }) : null;
  if (!existing) {
    await Contact.create(doc);
    return 'created';
  }
  if (strategy === 'skip') return 'skipped';

  for (const k of TEXT_FIELDS) {
    if (k === 'notes' || k === 'status') continue;
    if (doc[k]) existing[k] = doc[k];
  }
  if (doc.notes && !(existing.notes || '').includes(doc.notes)) existing.notes = joinText(existing.notes, doc.notes);
  if (doc.followUp) existing.followUp = doc.followUp;
  if ((doc.followUpCount || 0) > (existing.followUpCount || 0)) existing.followUpCount = doc.followUpCount;
  if (doc.booking.date && isoDate(existing.booking.date) !== isoDate(doc.booking.date)) existing.booking.bookedAt = new Date();
  if (doc.booking.date) existing.booking.date = doc.booking.date;
  if (doc.booking.time) existing.booking.time = doc.booking.time;
  if (doc.booking.note) existing.booking.note = doc.booking.note;
  existing.extra = { ...(existing.extra || {}), ...doc.extra };
  existing.markModified('extra');
  if (doc.tags.length) existing.tags = normalizeTags([...(existing.tags || []), ...doc.tags]);
  if (doc.priority) existing.priority = doc.priority;

  // New call rounds recorded in the sheet since the last import.
  const seen = new Set(existing.activities.map(activityKey));
  let addedCalls = 0;
  for (const a of doc.activities) {
    if (a.type === 'call' && !seen.has(activityKey(a))) {
      existing.activities.push(a);
      addedCalls += 1;
    }
  }
  if (doc.lastContactedAt && (!existing.lastContactedAt || doc.lastContactedAt > existing.lastContactedAt)) existing.lastContactedAt = doc.lastContactedAt;

  if ((updateStage || addedCalls) && explicitStage) {
    if (doc.status) existing.status = doc.status;
    if (existing.stage !== doc.stage && (updateStage || SHEET_MOVABLE_STAGES.has(existing.stage))) {
      existing.activities.push({
        type: 'stage',
        source: 'import',
        fromStage: existing.stage,
        toStage: doc.stage,
        message: `Moved from ${stageLabel(existing.stage)} to ${stageLabel(doc.stage)} (import)`,
      });
      existing.stage = doc.stage;
    }
  } else if (doc.status && !existing.status) {
    existing.status = doc.status;
  }
  existing.activities.push({ type: 'import', source: 'import', message: `Updated from "${listName}" (${sheetName}, row ${doc.source.row})` });
  // A type is only ever filled in by a sync, never changed: what the team set by hand stays. Same for the place.
  if (!existing.category && doc.category) existing.category = doc.category;
  for (const k of ['city', 'state', 'country']) if (!existing[k] && doc[k]) existing[k] = doc[k];
  existing.importBatchIds.addToSet(batchId);
  await existing.save();
  return 'updated';
}

async function importSheet(sheet, plan, ctx) {
  const sheetCtx = { ...ctx, sheetName: sheet.name, listName: ctx.listNameFor(sheet.name), defaultStage: plan.defaultStage, category: plan.category || '' };
  const built = [];
  let blank = 0;
  let noPhone = 0;
  for (const r of sheet.rows) {
    const c = buildContact(r.values, plan.mapping, { ...sheetCtx, rowNumber: r.rowNumber });
    if (!c) blank += 1;
    else if (ctx.requirePhone && !hasPhone(c)) noPhone += 1;
    else built.push(c);
  }

  // Merge rows in the same sheet that resolve to the same contact.
  const byKey = new Map();
  const unique = [];
  let merged = 0;
  for (const c of built) {
    if (!c.dedupeKey) {
      unique.push(c);
      continue;
    }
    const prev = byKey.get(c.dedupeKey);
    if (prev) {
      mergeContact(prev, c);
      merged += 1;
    } else {
      byKey.set(c.dedupeKey, c);
      unique.push(c);
    }
  }

  const counters = { created: 0, updated: 0, skipped: 0, errorCount: 0, errorSamples: [] };
  const results = await runPool(unique, 8, (c) => writeContact(c, sheetCtx));
  results.forEach((r, i) => {
    if (r.ok) counters[r.value] += 1;
    else {
      counters.errorCount += 1;
      if (counters.errorSamples.length < 10) counters.errorSamples.push({ row: unique[i].source.row, message: r.error?.message || String(r.error) });
    }
  });
  return { name: sheet.name, included: true, rows: sheet.rows.length, blank, noPhone, merged, ...counters };
}

// Fields a not-imported tab may fill in when the contact has them empty (never status / stage / notes / calls).
const ENRICH_FIELDS = ['title', 'location', 'website', 'companyNo', 'secondaryEmail', 'contactL1', 'companyInfo'];

/**
 * The team's workbooks keep a "Cleaned" calling tab (imported) next to a "RAW" export tab (skipped)
 * that still carries Title, City/State, Company Phone... Match the skipped tab's rows to existing
 * contacts (email, else name + company, else name + phone) and fill only the fields that are empty.
 */
async function enrichFromTab(sheet, ctx) {
  const result = { name: sheet.name, included: false, rows: sheet.rows.length, enriched: 0, enrichedFields: [] };
  const mapping = suggestMapping(sheet.headers);
  if (!ENRICH_FIELDS.some((k) => Object.values(mapping).includes(k))) return result;
  const seen = new Set();
  const candidates = [];
  for (const r of sheet.rows) {
    const c = buildContact(r.values, mapping, { ...ctx, sheetName: sheet.name, listName: ctx.listNameFor(sheet.name), rowNumber: r.rowNumber });
    if (!c?.dedupeKey || seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    const patch = {};
    for (const k of ENRICH_FIELDS) if (c[k]) patch[k] = c[k];
    if (Object.keys(patch).length) candidates.push({ key: c.dedupeKey, patch });
  }
  const fields = new Set();
  const results = await runPool(candidates, 8, async ({ key, patch }) => {
    const existing = await Contact.findOne({ dedupeKey: key });
    if (!existing) return false;
    const filled = [];
    for (const [k, v] of Object.entries(patch)) {
      if (existing[k]) continue;
      existing[k] = v;
      filled.push(k);
    }
    if (!filled.length) return false;
    existing.activities.push({ type: 'import', source: 'import', message: `${filled.join(', ')} filled in from tab "${sheet.name}" of "${ctx.fileName}"` });
    await existing.save();
    filled.forEach((k) => fields.add(k));
    return true;
  });
  result.enriched = results.filter((r) => r.ok && r.value).length;
  result.enrichedFields = [...fields];
  return result;
}

const baseName = (s) => String(s || '').replace(/\.(xlsx|xlsm|csv)$/i, '').replace(/\s+/g, ' ').trim();

/**
 * Pick a display name for the imported list that is unique across sources: "Travel Advisors",
 * "Travel Advisors 2", "Travel Advisors 3"... A re-sync of the same spreadsheet keeps its name.
 */
export async function resolveListName(requested, source, fileName = '') {
  const wanted = baseName(requested) || baseName(source?.title) || baseName(fileName) || 'Imported list';
  if (source?.type === 'google-sheet' && source.spreadsheetId) {
    const previous = await ImportBatch.findOne({ 'source.spreadsheetId': source.spreadsheetId, 'source.listName': { $ne: '' }, undoneAt: null })
      .sort({ createdAt: -1 })
      .select('source.listName')
      .lean();
    if (previous && (!requested || baseName(requested).toLowerCase() === previous.source.listName.toLowerCase())) return previous.source.listName;
  }
  // Names are compared case-insensitively so "fora travel" does not sit next to "Fora Travel".
  const taken = new Set((await Contact.distinct('source.sheetName')).filter(Boolean).map((n) => n.toLowerCase()));
  for (const b of await ImportBatch.find({ 'source.listName': { $ne: '' }, undoneAt: null }).select('source').lean()) {
    if (!(source?.spreadsheetId && b.source.spreadsheetId === source.spreadsheetId)) taken.add(b.source.listName.toLowerCase());
  }
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${wanted} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${wanted} ${Date.now()}`;
}

/**
 * @param {{ upload: { fileName: string, sheets: any[], source?: object }, plans: any[], strategy: 'skip'|'update', updateStage: boolean, requirePhone?: boolean, listName?: string, resyncOf?: any }} opts
 */
export async function runImport({ upload, plans, strategy, updateStage, requirePhone = true, listName = '', resyncOf = null }) {
  const source = { ...(upload.source || { type: 'file' }) };
  if (!source.title) source.title = baseName(upload.fileName);
  source.listName = await resolveListName(listName, source, upload.fileName);
  if (source.type === 'google-sheet' && source.spreadsheetId) {
    // every sheet imported by link is kept in the saved sheet list (name only set when the entry is new)
    await LinkedSheet.updateOne(
      { spreadsheetId: source.spreadsheetId },
      { $setOnInsert: { url: source.url || '', gid: source.gid || '', name: source.listName } },
      { upsert: true },
    );
  }
  const batch = await ImportBatch.create({
    fileName: upload.fileName,
    strategy,
    updateStage,
    requirePhone,
    status: 'running',
    source,
    plans,
    resyncOf,
  });
  const includedCount = plans.filter((p) => p.include).length;
  const ctx = {
    fileName: upload.fileName,
    batchId: batch._id,
    strategy,
    updateStage,
    requirePhone,
    // One included tab -> the list name itself; several tabs -> "List - Tab" so they stay distinguishable.
    listNameFor: (tab) => (includedCount > 1 ? `${source.listName} - ${tab}` : source.listName),
  };
  const sheetResults = [];
  try {
    for (const plan of plans) {
      const sheet = upload.sheets.find((s) => s.name === plan.name);
      if (!sheet) {
        sheetResults.push({ name: plan.name, included: false, error: 'Sheet not found in the uploaded file' });
        continue;
      }
      if (!plan.include) {
        sheetResults.push({ name: plan.name, included: false, rows: sheet.rows.length });
        continue;
      }
      sheetResults.push(await importSheet(sheet, plan, ctx));
    }
    // Tabs that were not imported (RAW exports, extra lists) fill in missing details of the contacts just imported.
    for (const sheet of upload.sheets) {
      if (sheetResults.some((r) => r.name === sheet.name && r.included)) continue;
      const r = await enrichFromTab(sheet, ctx);
      const i = sheetResults.findIndex((x) => x.name === sheet.name);
      if (i === -1) sheetResults.push(r);
      else sheetResults[i] = { ...sheetResults[i], ...r };
    }
    const totals = { rows: 0, created: 0, updated: 0, skipped: 0, blank: 0, noPhone: 0, merged: 0, errorCount: 0, enriched: 0 };
    for (const s of sheetResults) {
      totals.enriched += s.enriched || 0;
      if (!s.included) continue;
      for (const k of Object.keys(totals)) if (k !== 'enriched') totals[k] += s[k] || 0;
    }
    batch.sheets = sheetResults;
    batch.totals = totals;
    batch.status = 'done';
    batch.syncedAt = new Date();
  } catch (err) {
    batch.sheets = sheetResults;
    batch.status = 'failed';
    await batch.save();
    throw err;
  }
  await batch.save();
  return batch.toObject();
}
