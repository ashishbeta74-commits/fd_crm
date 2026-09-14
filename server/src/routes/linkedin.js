import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { HttpError } from '../lib/errors.js';
import { addDays, isoDate, parseDate, todayUtc } from '../lib/dates.js';
import { escapeRegex, runPool } from '../lib/pool.js';
import { Contact } from '../models/Contact.js';
import { PRIORITY_KEYS, priorityLabel } from '../fields.js';
import {
  LI_CONNECTION_KEYS,
  LI_CONNECTION_STATUSES,
  LI_GROUPS,
  LI_NEEDS,
  LI_NEXT_ACTIONS,
  LI_OVERRIDE_KEYS,
  LI_PERSONAS,
  LI_PLAYBOOK,
  LI_RULES,
  LI_STAGES,
  LI_STAGE_KEYS,
  LI_STATUSES,
  LI_STATUS_KEYS,
  LI_STEPS,
  liStatusLabel,
  LI_VALUE_BANDS,
  liStageLabel,
} from '../linkedin.js';

export const linkedinRouter = Router();

const LI_FIELDS = 'name title companyName email primaryEmail contactMain companyNo website contactL1 location priority priorityRank tags stage callOutcome linkedin source.sheetName updatedAt createdAt';
const HAS_URL = { contactL1: { $regex: /linkedin\.com/i } };
const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// ---------- meta ----------
linkedinRouter.get('/meta', async (req, res) => {
  // personas actually set on contacts (with counts) - the filter offers only these; the fixed list is for setting one
  const inUse = await Contact.aggregate([{ $match: { 'linkedin.persona': { $nin: ['', null] } } }, { $group: { _id: '$linkedin.persona', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]);
  res.json({
    stages: LI_STAGES,
    groups: LI_GROUPS,
    personas: LI_PERSONAS,
    personasInUse: inUse.map((p) => ({ persona: p._id, count: p.count })),
    needs: LI_NEEDS,
    nextActions: LI_NEXT_ACTIONS,
    connectionStatuses: LI_CONNECTION_STATUSES,
    overrides: LI_STAGES.filter((s) => s.override).map((s) => ({ key: s.key, label: s.label, closed: s.closed })),
    valueBands: LI_VALUE_BANDS,
    statuses: LI_STATUSES,
    steps: LI_STEPS.map(({ key, label, requires }) => ({ key, label, requires: requires || null })),
    playbook: LI_PLAYBOOK,
    rules: LI_RULES,
  });
});

// ---------- list ----------
const SORT_FIELDS = {
  nextActionDate: 'linkedin.nextActionDate',
  lastTouchAt: 'linkedin.lastTouchAt',
  stage: 'linkedin.stageIndex',
  name: 'name',
  companyName: 'companyName',
  monthlyValue: 'linkedin.monthlyValue',
  priority: 'priorityRank',
  updatedAt: 'updatedAt',
};

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  stage: z.string().optional(),
  group: z.string().optional(),
  persona: z.string().optional(),
  connection: z.string().optional(),
  flag: z.enum(['overdue', 'week', 'none', 'notFollowed', 'active']).optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  sheet: z.string().optional(),
  // 'url' (default) = only contacts with a LinkedIn profile URL; 'all' = every contact
  scope: z.enum(['url', 'all']).default('url'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  sort: z.enum(Object.keys(SORT_FIELDS)).default('lastTouchAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

function buildFilter(q) {
  const and = [];
  if (q.scope === 'url') and.push(HAS_URL);
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    and.push({ $or: ['name', 'companyName', 'title', 'email', 'primaryEmail', 'linkedin.persona', 'linkedin.need', 'linkedin.nextAction', 'linkedin.notes'].map((f) => ({ [f]: rx })) });
  }
  if (q.stage) {
    const keys = csv(q.stage);
    // contacts never touched have no linkedin.stage yet: treat missing as 'identified'
    and.push(keys.includes('identified') ? { $or: [{ 'linkedin.stage': { $in: keys } }, { 'linkedin.stage': { $exists: false } }] } : { 'linkedin.stage': { $in: keys } });
  }
  if (q.group) {
    const groups = csv(q.group);
    const keys = LI_STAGES.filter((s) => groups.includes(s.group)).map((s) => s.key);
    and.push(groups.includes('warmup') ? { $or: [{ 'linkedin.stage': { $in: keys } }, { 'linkedin.stage': { $exists: false } }] } : { 'linkedin.stage': { $in: keys } });
  }
  if (q.persona) {
    const keys = csv(q.persona);
    const values = keys.filter((p) => p !== 'none');
    // 'none' = no persona set, including contacts that never had a linkedin block
    and.push(keys.includes('none') ? { $or: [{ 'linkedin.persona': { $in: [...values, '', null] } }, { 'linkedin.persona': { $exists: false } }] } : { 'linkedin.persona': { $in: values } });
  }
  if (q.connection) and.push({ 'linkedin.connectionStatus': { $in: csv(q.connection).flatMap((c) => (c === 'none' ? ['', null] : [c])) } });
  if (q.priority) and.push({ priority: { $in: csv(q.priority).flatMap((v) => (v === 'none' ? ['', null] : [v])) } });
  if (q.status) {
    const keys = csv(q.status);
    // contacts never touched have no linkedin.status yet: treat missing as 'not_started'
    and.push(keys.includes('not_started') ? { $or: [{ 'linkedin.status': { $in: keys } }, { 'linkedin.status': { $exists: false } }] } : { 'linkedin.status': { $in: keys } });
  }
  if (q.sheet) and.push({ 'source.sheetName': q.sheet });
  const today = todayUtc();
  if (q.flag === 'overdue') and.push({ 'linkedin.closed': { $ne: true }, 'linkedin.nextActionDate': { $lt: today } });
  if (q.flag === 'week') and.push({ 'linkedin.closed': { $ne: true }, 'linkedin.nextActionDate': { $gte: today, $lt: addDays(today, 7) } });
  if (q.flag === 'none') and.push({ 'linkedin.active': true, 'linkedin.closed': { $ne: true }, $or: [{ 'linkedin.nextActionDate': null }, { 'linkedin.nextActionDate': { $exists: false } }] });
  if (q.flag === 'notFollowed') and.push({ $or: [{ 'linkedin.dateFollowed': null }, { 'linkedin.dateFollowed': { $exists: false } }], 'linkedin.closed': { $ne: true } });
  if (q.flag === 'active') and.push({ 'linkedin.active': true });
  return and.length ? { $and: and } : {};
}

linkedinRouter.get('/contacts', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter = buildFilter(q);
  const sortField = SORT_FIELDS[q.sort];
  const sort = { [sortField]: q.dir === 'asc' ? 1 : -1, _id: 1 };
  const [items, total] = await Promise.all([
    Contact.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).select(LI_FIELDS).lean(),
    Contact.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)) });
});

// ---------- stats (the workbook's Dashboard tab) ----------
const PERIODS = ['all', 'today', '7d', '30d', 'month', 'last_month', 'quarter', 'year', 'custom'];

function periodRange(period, from, to) {
  const today = todayUtc();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const utc = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd));
  switch (period) {
    case 'today':
      return [today, addDays(today, 1)];
    case '7d':
      return [addDays(today, -6), addDays(today, 1)];
    case '30d':
      return [addDays(today, -29), addDays(today, 1)];
    case 'month':
      return [utc(y, m, 1), utc(y, m + 1, 1)];
    case 'last_month':
      return [utc(y, m - 1, 1), utc(y, m, 1)];
    case 'quarter':
      return [utc(y, Math.floor(m / 3) * 3, 1), utc(y, Math.floor(m / 3) * 3 + 3, 1)];
    case 'year':
      return [utc(y, 0, 1), utc(y + 1, 0, 1)];
    case 'custom':
      return [parseDate(from) || utc(1900, 0, 1), to ? addDays(parseDate(to) || today, 1) : addDays(today, 1)];
    default:
      return null;
  }
}

linkedinRouter.get('/stats', async (req, res) => {
  const q = z.object({ period: z.enum(PERIODS).default('all'), from: z.string().optional(), to: z.string().optional(), scope: z.enum(['url', 'all']).default('url') }).parse(req.query);
  const range = periodRange(q.period, q.from, q.to);
  const filter = q.scope === 'url' ? HAS_URL : {};
  const docs = await Contact.find(filter).select('linkedin priority').lean();
  const today = todayUtc();
  const week = addDays(today, 7);
  const inView = docs.filter((c) => {
    if (!range) return true;
    const d = c.linkedin?.dateFollowed;
    return d && new Date(d) >= range[0] && new Date(d) < range[1];
  });
  const li = (c) => c.linkedin || {};
  const count = (fn) => inView.filter((c) => fn(li(c))).length;
  const followed = count((l) => l.dateFollowed);
  const requests = count((l) => l.requestSentAt);
  const accepted = count((l) => l.acceptedAt || l.connectionStatus === 'accepted' || l.connectionStatus === 'already_connected');
  const replies = count((l) => l.firstReplyAt);
  const needs = count((l) => l.needAt || l.need);
  const offers = count((l) => l.offerSentAt);
  const trials = count((l) => l.trialRideDate);
  const won = count((l) => l.convertedDate || l.stage === 'client_won');
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const byStage = Object.fromEntries(LI_STAGE_KEYS.map((k) => [k, 0]));
  const byGroup = Object.fromEntries(LI_GROUPS.map((g) => [g.key, 0]));
  const byPersona = {};
  let wonValue = 0;
  let openValue = 0;
  let overdue = 0;
  let dueWeek = 0;
  let noNext = 0;
  let notFollowed = 0;
  for (const c of inView) {
    const l = li(c);
    const stage = l.stage || 'identified';
    byStage[stage] = (byStage[stage] || 0) + 1;
    const def = LI_STAGES.find((s) => s.key === stage);
    byGroup[def?.group || 'warmup'] += 1;
    if (l.persona) byPersona[l.persona] = (byPersona[l.persona] || 0) + 1;
    if (stage === 'client_won') wonValue += l.monthlyValue || 0;
    else if (!l.closed && l.monthlyValue) openValue += l.monthlyValue;
    if (!l.closed) {
      if (l.nextActionDate && new Date(l.nextActionDate) < today) overdue += 1;
      else if (l.nextActionDate && new Date(l.nextActionDate) < week) dueWeek += 1;
      if (l.active && !l.nextActionDate) noNext += 1;
      if (!l.dateFollowed) notFollowed += 1;
    }
  }
  res.json({
    period: q.period,
    range: range ? { from: isoDate(range[0]), to: isoDate(addDays(range[1], -1)) } : null,
    prospects: inView.length,
    totalWithUrl: docs.length,
    followed,
    requests,
    accepted,
    acceptanceRate: pct(accepted, requests),
    replies,
    replyRate: pct(replies, accepted),
    needs,
    offers,
    trials,
    won,
    winRate: pct(won, inView.length),
    wonMonthlyValue: wonValue,
    openPipelineValue: openValue,
    overdue,
    dueWeek,
    noNextAction: noNext,
    notFollowed,
    byStage,
    byGroup,
    byPersona: Object.entries(byPersona)
      .sort((a, b) => b[1] - a[1])
      .map(([persona, n]) => ({ persona, count: n })),
  });
});

// ---------- update ----------
const dateField = z.union([z.string(), z.null()]).optional();
const linkedinInput = z
  .object({
    persona: z.string().trim().max(120).optional(),
    dateFollowed: dateField,
    dateEngaged: dateField,
    requestSentAt: dateField,
    connectionStatus: z.enum(['', ...LI_CONNECTION_KEYS]).optional(),
    acceptedAt: dateField,
    welcomeSentAt: dateField,
    firstReplyAt: dateField,
    need: z.string().trim().max(200).optional(),
    needAt: dateField,
    offerSentAt: dateField,
    trialRideDate: dateField,
    convertedDate: dateField,
    monthlyValue: z.number().min(0).max(10_000_000).optional(),
    outcomeOverride: z.enum(['', ...LI_OVERRIDE_KEYS]).optional(),
    nextAction: z.string().trim().max(200).optional(),
    nextActionDate: dateField,
    notes: z.string().max(20000).optional(),
    status: z.enum(LI_STATUS_KEYS).optional(),
    // contact-level fields that the LinkedIn view also edits
    priority: z.enum(['', ...PRIORITY_KEYS]).optional(),
    contactL1: z.string().trim().max(500).optional(),
  })
  .strict();

const DATE_KEYS = ['dateFollowed', 'dateEngaged', 'requestSentAt', 'acceptedAt', 'welcomeSentAt', 'firstReplyAt', 'needAt', 'offerSentAt', 'trialRideDate', 'convertedDate', 'nextActionDate'];
const LABELS = {
  dateFollowed: 'Followed',
  dateEngaged: 'Engaged with content',
  requestSentAt: 'Connection request sent',
  acceptedAt: 'Connection accepted',
  welcomeSentAt: 'Welcome message sent',
  firstReplyAt: 'First reply',
  needAt: 'Need identified',
  offerSentAt: 'Offer sent',
  trialRideDate: 'Trial ride',
  convertedDate: 'Client won',
  nextActionDate: 'Next action date',
};

/** Apply validated LinkedIn input; returns the human-readable list of what changed. */
function applyLinkedin(doc, input) {
  const li = doc.linkedin || {};
  const changes = [];
  for (const k of DATE_KEYS) {
    if (input[k] === undefined) continue;
    const next = parseDate(input[k]);
    const before = li[k] ? isoDate(li[k]) : '';
    if ((next ? isoDate(next) : '') !== before) {
      li[k] = next;
      changes.push(next ? `${LABELS[k]} ${isoDate(next)}` : `${LABELS[k]} cleared`);
    }
  }
  for (const k of ['persona', 'connectionStatus', 'need', 'outcomeOverride', 'nextAction', 'notes']) {
    if (input[k] === undefined || input[k] === (li[k] || '')) continue;
    li[k] = input[k];
    if (k === 'notes') changes.push('LinkedIn notes updated');
    else if (k === 'outcomeOverride') changes.push(input[k] ? `Outcome: ${liStageLabel(input[k])}` : 'Outcome override cleared');
    else if (k === 'connectionStatus') changes.push(`Connection: ${LI_CONNECTION_STATUSES.find((c) => c.key === input[k])?.label || 'cleared'}`);
    else changes.push(`${k === 'persona' ? 'Persona' : k === 'need' ? 'Need' : 'Next action'}: ${input[k] || 'cleared'}`);
  }
  if (input.status !== undefined && input.status !== (li.status || 'not_started')) {
    li.status = input.status;
    changes.push(`Status: ${liStatusLabel(input.status)}`);
  }
  if (input.need && !li.needAt) li.needAt = new Date();
  if (input.monthlyValue !== undefined && input.monthlyValue !== (li.monthlyValue || 0)) {
    li.monthlyValue = input.monthlyValue;
    changes.push(`Est. monthly value $${input.monthlyValue.toLocaleString('en-US')}`);
  }
  doc.linkedin = li;
  doc.markModified('linkedin');
  if (input.priority !== undefined && input.priority !== (doc.priority || '')) {
    doc.priority = input.priority;
    changes.push(input.priority ? `Priority ${priorityLabel(input.priority)}` : 'Priority cleared');
  }
  if (input.contactL1 !== undefined && input.contactL1 !== (doc.contactL1 || '')) {
    doc.contactL1 = input.contactL1;
    changes.push('LinkedIn URL updated');
  }
  return changes;
}

async function loadContact(id) {
  const doc = await Contact.findById(id);
  if (!doc) throw new HttpError(404, 'Contact not found');
  return doc;
}

linkedinRouter.patch('/contacts/:id', async (req, res) => {
  const input = linkedinInput.parse(req.body);
  const doc = await loadContact(req.params.id);
  const before = doc.linkedin?.stage || 'identified';
  const changes = applyLinkedin(doc, input);
  if (changes.length) {
    await doc.save();
    const after = doc.linkedin.stage;
    const stageNote = after !== before ? ` → ${liStageLabel(after)}` : '';
    doc.activities.push({ type: 'linkedin', message: `LinkedIn: ${changes.join(', ')}${stageNote}` });
    await doc.save();
  }
  res.json(doc);
});

// Log a playbook step for today (or a given date); fills the matching date, the connection status
// and, unless told otherwise, the next action + due date the playbook suggests.
const stepInput = z
  .object({
    step: z.enum(LI_STEPS.map((s) => s.key)),
    date: z.string().optional(),
    need: z.string().trim().max(200).optional(),
    monthlyValue: z.number().min(0).max(10_000_000).optional(),
    note: z.string().trim().max(2000).optional(),
    suggestNext: z.boolean().default(true),
  })
  .strict();

export async function logStep(doc, body) {
  const step = LI_STEPS.find((s) => s.key === body.step);
  const date = parseDate(body.date) || todayUtc();
  if (step.requires === 'need' && !body.need && !doc.linkedin?.need) throw new HttpError(400, 'Tell me the need / use case first');
  if (step.requires === 'monthlyValue' && body.monthlyValue === undefined && !doc.linkedin?.monthlyValue) throw new HttpError(400, 'Add an estimated monthly value first');
  const input = {};
  for (const [field, value] of Object.entries(step.sets)) input[field] = value === 'date' ? isoDate(date) : value;
  if (body.need) input.need = body.need;
  if (body.monthlyValue !== undefined) input.monthlyValue = body.monthlyValue;
  if (body.suggestNext && step.next) {
    input.nextAction = step.next.action;
    input.nextActionDate = isoDate(addDays(date, step.next.inDays));
  } else if (!step.next) {
    input.nextAction = '';
    input.nextActionDate = null;
  }
  const before = doc.linkedin?.stage || 'identified';
  const changes = applyLinkedin(doc, input);
  await doc.save();
  const after = doc.linkedin.stage;
  doc.activities.push({ type: 'linkedin', message: `LinkedIn: ${step.label}${after !== before ? ` → ${liStageLabel(after)}` : ''}${body.note ? ` - ${body.note}` : ''}` });
  await doc.save();
  return { changes, stage: after };
}

linkedinRouter.post('/contacts/:id/step', async (req, res) => {
  const body = stepInput.parse(req.body);
  const doc = await loadContact(req.params.id);
  await logStep(doc, body);
  res.json(doc);
});

// ---------- bulk ----------
const bulkInput = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(['persona', 'nextAction', 'override', 'step', 'priority', 'status']),
  status: z.enum(LI_STATUS_KEYS).optional(),
  persona: z.string().trim().max(120).optional(),
  nextAction: z.string().trim().max(200).optional(),
  nextActionDate: dateField,
  outcomeOverride: z.enum(['', ...LI_OVERRIDE_KEYS]).optional(),
  step: z.enum(LI_STEPS.map((s) => s.key)).optional(),
  date: z.string().optional(),
  priority: z.enum(['', ...PRIORITY_KEYS]).optional(),
});

linkedinRouter.post('/bulk', async (req, res) => {
  const body = bulkInput.parse(req.body);
  const docs = await Contact.find({ _id: { $in: body.ids } });
  const results = await runPool(docs, 8, async (doc) => {
    if (body.action === 'step') {
      if (!body.step) throw new HttpError(400, 'step is required');
      await logStep(doc, { step: body.step, date: body.date, suggestNext: true });
      return true;
    }
    let input;
    if (body.action === 'persona') input = { persona: body.persona || '' };
    else if (body.action === 'nextAction') input = { nextAction: body.nextAction || '', nextActionDate: body.nextActionDate ?? null };
    else if (body.action === 'override') input = { outcomeOverride: body.outcomeOverride || '' };
    else if (body.action === 'status') input = { status: body.status || 'not_started' };
    else input = { priority: body.priority || '' };
    const changes = applyLinkedin(doc, input);
    if (!changes.length) return false;
    doc.activities.push({ type: 'linkedin', message: `LinkedIn: ${changes.join(', ')}` });
    await doc.save();
    return true;
  });
  res.json({ matched: docs.length, updated: results.filter((r) => r.ok && r.value).length, errors: results.filter((r) => !r.ok).map((r) => r.error?.message).slice(0, 5) });
});

// ---------- export: the workbook's Data tab ----------
linkedinRouter.get('/export', async (req, res) => {
  const q = listQuery.parse(req.query);
  const items = await Contact.find(buildFilter(q)).sort({ 'linkedin.lastTouchAt': -1, _id: 1 }).limit(20000).select(LI_FIELDS).lean();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.columns = [
    { header: 'Contact LI Profile URL', key: 'url', width: 40 },
    { header: 'Full Name', key: 'name', width: 24 },
    { header: 'Title', key: 'title', width: 24 },
    { header: 'Company', key: 'company', width: 24 },
    { header: 'Persona / Segment', key: 'persona', width: 28 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Date Followed', key: 'dateFollowed', width: 12 },
    { header: 'Date Engaged', key: 'dateEngaged', width: 12 },
    { header: 'Connection Request Sent', key: 'requestSentAt', width: 14 },
    { header: 'Connection Status', key: 'connectionStatus', width: 16 },
    { header: 'Date Accepted', key: 'acceptedAt', width: 12 },
    { header: 'Welcome Message Sent', key: 'welcomeSentAt', width: 14 },
    { header: 'Date First Reply', key: 'firstReplyAt', width: 12 },
    { header: 'Need / Use Case', key: 'need', width: 28 },
    { header: 'Offer Sent', key: 'offerSentAt', width: 12 },
    { header: 'Trial Ride Date', key: 'trialRideDate', width: 12 },
    { header: 'Converted Date', key: 'convertedDate', width: 12 },
    { header: 'Est. Monthly Value', key: 'monthlyValue', width: 14 },
    { header: 'Outcome Override', key: 'outcomeOverride', width: 18 },
    { header: 'Next Action', key: 'nextAction', width: 26 },
    { header: 'Next Action Date', key: 'nextActionDate', width: 14 },
    { header: 'Notes', key: 'notes', width: 40 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Current Stage', key: 'stage', width: 20 },
    { header: 'Stage #', key: 'stageIndex', width: 8 },
    { header: 'Touchpoints', key: 'touchpoints', width: 10 },
    { header: 'Last Touch', key: 'lastTouchAt', width: 12 },
    { header: 'CRM List', key: 'sheet', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of items) {
    const l = c.linkedin || {};
    ws.addRow({
      url: c.contactL1 || '',
      name: c.name || '',
      title: c.title || '',
      company: c.companyName || '',
      persona: l.persona || '',
      priority: priorityLabel(c.priority),
      dateFollowed: isoDate(l.dateFollowed),
      dateEngaged: isoDate(l.dateEngaged),
      requestSentAt: isoDate(l.requestSentAt),
      connectionStatus: LI_CONNECTION_STATUSES.find((s) => s.key === l.connectionStatus)?.label || '',
      acceptedAt: isoDate(l.acceptedAt),
      welcomeSentAt: isoDate(l.welcomeSentAt),
      firstReplyAt: isoDate(l.firstReplyAt),
      need: l.need || '',
      offerSentAt: isoDate(l.offerSentAt),
      trialRideDate: isoDate(l.trialRideDate),
      convertedDate: isoDate(l.convertedDate),
      monthlyValue: l.monthlyValue || '',
      outcomeOverride: l.outcomeOverride ? liStageLabel(l.outcomeOverride) : '',
      nextAction: l.nextAction || '',
      nextActionDate: isoDate(l.nextActionDate),
      notes: l.notes || '',
      status: liStatusLabel(l.status || 'not_started'),
      stage: liStageLabel(l.stage || 'identified'),
      stageIndex: l.stageIndex || 1,
      touchpoints: l.touchpoints || 0,
      lastTouchAt: isoDate(l.lastTouchAt),
      sheet: c.source?.sheetName || '',
    });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="linkedin-prospects-${isoDate(new Date())}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});
