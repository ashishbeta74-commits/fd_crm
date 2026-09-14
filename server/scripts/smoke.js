// End-to-end smoke test for the API using samples/sample-contacts.xlsx.
// Usage: npm run smoke   (API_URL defaults to http://localhost:4000)
// WARNING: it DROPS the database it is pointed at (MONGODB_URI) before running,
// and leaves the sample data imported at the end.
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const API = (process.env.API_URL || 'http://localhost:4000') + '/api';
const sample = path.resolve(process.cwd(), '..', 'samples', 'sample-contacts.xlsx');
let failures = 0;

const dbUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm';
await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 5000 });
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
console.log(`database reset (${dbUri.replace(/\/\/([^@/]+)@/, '//***@')})`);

function check(name, cond, info = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
  if (!cond) failures += 1;
}

async function call(method, p, body, form) {
  const opts = { method, headers: process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + p, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data, ct };
}

const health = await call('GET', '/health');
check('health', health.status === 200 && health.data.ok, health.data.db);

const meta = await call('GET', '/meta');
check('meta has 10 stages / 25 fields', meta.data.stages?.length === 10 && meta.data.outcomes === undefined && meta.data.fields?.length === 25, `stages=${meta.data.stages?.length} fields=${meta.data.fields?.length}`);

// ---- import preview ----
const fd = new FormData();
fd.append('file', new Blob([fs.readFileSync(sample)]), 'sample-contacts.xlsx');
const preview = await call('POST', '/imports/preview', undefined, fd);
check('preview returns 3 sheets', preview.status === 200 && preview.data.sheets?.length === 3, JSON.stringify(preview.data.sheets?.map((s) => `${s.name}:${s.rowCount}`)));
for (const s of preview.data.sheets || []) {
  const mapped = Object.values(s.suggestedMapping).filter(Boolean);
  console.log(`      ${s.name}: ${s.headers.length} columns, ${mapped.length} auto-mapped -> ${JSON.stringify(s.suggestedMapping)}`);
}
const leads = preview.data.sheets.find((s) => s.name === 'Leads');
const prospects = preview.data.sheets.find((s) => s.name === 'Prospects');
const bookings = preview.data.sheets.find((s) => s.name === 'Bookings');
check('Leads: Name/Email/Company/Phone/Status/Follow Up/Notes mapped',
  leads.suggestedMapping.Name === 'name' && leads.suggestedMapping.Email === 'email' && leads.suggestedMapping.Company === 'companyName' && leads.suggestedMapping.Phone === 'contactMain' && leads.suggestedMapping.Status === 'status' && leads.suggestedMapping['Follow Up'] === 'followUp' && leads.suggestedMapping.Notes === 'notes', JSON.stringify(leads.suggestedMapping));
check('Prospects: Primary/Second email, Stage, Started, Remarks mapped',
  prospects.suggestedMapping['Primary Email'] === 'primaryEmail' && prospects.suggestedMapping['Second Email'] === 'secondaryEmail' && prospects.suggestedMapping.Stage === 'stage' && prospects.suggestedMapping.Started === 'stage' && prospects.suggestedMapping.Remarks === 'notes' && prospects.suggestedMapping['Contact L1 Info'] === 'contactL1' && prospects.suggestedMapping['Company No'] === 'companyNo' && prospects.suggestedMapping['Contact Main'] === 'contactMain');
check('Bookings: Date/Time/Note/Mobile mapped',
  bookings.suggestedMapping.Date === 'bookingDate' && bookings.suggestedMapping.Time === 'bookingTime' && bookings.suggestedMapping.Note === 'notes' && bookings.suggestedMapping.Mobile === 'contactMain', JSON.stringify(bookings.suggestedMapping));
check('Bookings sample shows a date and a time', /^\d{4}-\d{2}-\d{2}$/.test(bookings.sample[0].Date) && /^\d{2}:\d{2}$/.test(bookings.sample[0].Time), `${bookings.sample[0].Date} ${bookings.sample[0].Time}`);

// ---- commit (skip duplicates) ----
const plans = preview.data.sheets.map((s) => ({ name: s.name, include: true, mapping: s.suggestedMapping }));
const commit = await call('POST', '/imports/commit', { uploadId: preview.data.uploadId, duplicateStrategy: 'skip', sheets: plans });
check('commit ok', commit.status === 200 && commit.data.status === 'done', JSON.stringify(commit.data.totals));
const t = commit.data.totals || {};
check('rows=25 created=22 skipped=2 merged=1 errors=0', t.rows === 25 && t.created === 22 && t.skipped === 2 && t.merged === 1 && t.errorCount === 0);
const batchId = commit.data._id;

// ---- contacts ----
const list = await call('GET', '/contacts?limit=100');
check('list total 22', list.data.total === 22, `total=${list.data.total}`);
const sofia = list.data.items.find((c) => c.email === 'sofia@rossidesign.it' || c.primaryEmail === 'sofia@rossidesign.it');
check('Sofia imported once from Leads ("Connected" status -> connected stage)', sofia && /Leads$/.test(sofia.source.sheetName) && sofia.stage === 'connected', `${sofia?.stage}`);
const daniel = list.data.items.find((c) => c.name === 'Daniel Okafor');
check('wrong number -> wrong_number stage', daniel?.stage === 'wrong_number', `${daniel?.stage}`);
const emily = list.data.items.find((c) => c.name === 'Emily Chen');
check('not interested -> started, not prospect', emily?.stage === 'started', `${emily?.stage}`);
const tom = list.data.items.find((c) => c.name === 'Tom Becker');
check('no answer -> voicemail stage', tom?.stage === 'voicemail', `${tom?.stage}`);
const hannah = list.data.items.find((c) => c.name === 'Hannah Lee');
check('Converted status -> converted stage', hannah?.stage === 'converted');
const priya = list.data.items.find((c) => c.name === 'Priya Nair');
check('"connected - interested" -> prospect', priya?.stage === 'prospect', `${priya?.stage}`);
check('follow-up date stored as UTC midnight', priya?.followUp === '2026-09-11T00:00:00.000Z', priya?.followUp);
const aarav = list.data.items.find((c) => c.name === 'Aarav Mehta');
check('in-sheet duplicate merged (website kept, notes joined)', aarav?.website === 'bluepeak.io' && /Duplicate row/.test(aarav?.notes || ''));
const liam = list.data.items.find((c) => c.name === 'Liam O Brien');
check('booking date/time imported + future_booking stage', liam?.booking?.date === '2026-09-25T00:00:00.000Z' && liam?.booking?.time === '14:00' && liam?.stage === 'future_booking', JSON.stringify(liam?.booking));
const ravi = list.data.items.find((c) => c.name === 'Ravi Shankar');
check('"Done" status wins over booking date', ravi?.stage === 'done');
const isabella = list.data.items.find((c) => c.name === 'Isabella Costa');
check('Started column "No need" (no Stage) -> started', isabella?.stage === 'started', `${isabella?.stage}`);
const fatima = list.data.items.find((c) => c.name === 'Fatima Al Sayed');
check('Stage column "Converted" beats Started "Connected"', fatima?.stage === 'converted', `${fatima?.stage}`);

const search = await call('GET', '/contacts?q=rossi');
check('search q=rossi finds Sofia', search.data.total === 1 && search.data.items[0].name === 'Sofia Rossi');
const byStage = await call('GET', '/contacts?stage=future_booking,done&sort=name&dir=asc');
check('stage filter + sort', byStage.status === 200 && byStage.data.items.every((c) => ['future_booking', 'done'].includes(c.stage)), `n=${byStage.data.total}`);
const byCall = await call('GET', '/contacts?stage=voicemail,wrong_number');
check('call-result stage filter', byCall.data.total >= 2 && byCall.data.items.every((c) => ['voicemail', 'wrong_number'].includes(c.stage)), `n=${byCall.data.total}`);
const byBatch = await call('GET', `/contacts?batch=${batchId}`);
check('batch filter', byBatch.data.total === 22);
const bad = await call('GET', '/contacts?limit=abc');
check('validation error is 400', bad.status === 400, bad.data.error);

// ---- detail + mutations ----
const detail = await call('GET', `/contacts/${sofia._id}`);
check('detail has activities', detail.data.activities?.length >= 1);
const patched = await call('PATCH', `/contacts/${sofia._id}`, { stage: 'ready', followUp: '2026-09-20', notes: 'Updated via smoke test' });
check('patch stage logs activity', patched.data.stage === 'ready' && patched.data.activities.some((a) => a.type === 'stage' && a.toStage === 'ready') && patched.data.followUp === '2026-09-20T00:00:00.000Z');
const strict = await call('PATCH', `/contacts/${sofia._id}`, { bogus: 1 });
check('unknown field rejected (strict)', strict.status === 400);
const called = await call('POST', `/contacts/${sofia._id}/activities`, { type: 'call', message: 'Great chat', stage: 'future_booking', booking: { date: '2026-10-01', time: '15:30', note: 'Demo' } });
check('log call moves to booking', called.data.stage === 'future_booking' && called.data.booking.time === '15:30' && called.data.lastContactedAt, JSON.stringify(called.data.booking));
const noted = await call('POST', `/contacts/${sofia._id}/activities`, { type: 'note', message: 'A note' });
const noteAct = noted.data.activities.find((a) => a.type === 'note' && a.message === 'A note');
check('note added', Boolean(noteAct));
const removed = await call('DELETE', `/contacts/${sofia._id}/activities/${noteAct?._id}`);
check('note removed', removed.status === 200 && !removed.data.activities.some((a) => a._id === noteAct?._id));

const created = await call('POST', '/contacts', { name: 'Test Person', email: 'test@example.com', companyName: 'Test Co', stage: 'new' });
check('create contact 201', created.status === 201 && created.data.dedupeKey === 'e:test@example.com');
const dup = await call('POST', '/contacts', { name: 'Test Person 2', email: 'TEST@example.com' });
check('duplicate email -> 409 with existing', dup.status === 409 && dup.data.details?.existing?._id === created.data._id);
const dupOk = await call('POST', '/contacts', { name: 'Test Person 2', email: 'test@example.com', allowDuplicate: true });
check('allowDuplicate creates', dupOk.status === 201);
const bulk = await call('POST', '/contacts/bulk', { ids: [created.data._id, dupOk.data._id], action: 'stage', stage: 'prospect' });
check('bulk stage', bulk.data.updated === 2, JSON.stringify(bulk.data));
const bulkDel = await call('POST', '/contacts/bulk', { ids: [created.data._id, dupOk.data._id], action: 'delete' });
check('bulk delete', bulkDel.data.deleted === 2);
const missing = await call('GET', '/contacts/000000000000000000000000');
check('missing contact 404', missing.status === 404);
const badId = await call('GET', '/contacts/not-an-id');
check('invalid id 400', badId.status === 400);

// ---- stats / followups / export ----
const stats = await call('GET', '/stats');
check('stats totals', stats.data.total === 22 && stats.data.byStage && stats.data.followUps && Array.isArray(stats.data.recentActivity), `byStage=${JSON.stringify(stats.data.byStage)}`);
const fu = await call('GET', '/followups');
check('followups grouped', fu.status === 200 && ['overdue', 'today', 'week', 'later', 'past'].every((k) => Array.isArray(fu.data[k])), Object.entries(fu.data).map(([k, v]) => `${k}=${v.length}`).join(' '));
const exp = await call('GET', '/contacts/export?stage=future_booking');
check('export xlsx', exp.status === 200 && exp.ct.includes('spreadsheetml') && exp.data.byteLength > 2000, `${exp.data.byteLength} bytes`);
const tpl = await call('GET', '/imports/template');
check('template xlsx', tpl.status === 200 && tpl.ct.includes('spreadsheetml'));

// ---- re-import with update strategy, then undo ----
const fd2 = new FormData();
fd2.append('file', new Blob([fs.readFileSync(sample)]), 'sample-contacts.xlsx');
const preview2 = await call('POST', '/imports/preview', undefined, fd2);
const commit2 = await call('POST', '/imports/commit', { uploadId: preview2.data.uploadId, duplicateStrategy: 'update', updateStage: true, sheets: preview2.data.sheets.map((s) => ({ name: s.name, include: s.name !== 'Bookings', mapping: s.suggestedMapping })) });
const t2 = commit2.data.totals || {};
// Leads has 11 rows (10 unique after the in-sheet merge) + Prospects 8 = 18 existing contacts updated
check('update re-import: 0 created, 18 updated', t2.created === 0 && t2.updated === 18, JSON.stringify(t2));
const sofia2 = await call('GET', `/contacts/${sofia._id}`);
check('updateStage moved Sofia back to prospect from sheet', sofia2.data.stage === 'prospect' && sofia2.data.secondaryEmail === 'sofia.rossi@gmail.com', sofia2.data.stage);
const imports = await call('GET', '/imports');
check('imports listed', imports.data.items.length >= 2);
const undo = await call('DELETE', `/imports/${commit2.data._id}`);
check('undo of update-only import deletes 0', undo.status === 200 && undo.data.deleted === 0);
const undo1 = await call('DELETE', `/imports/${batchId}`);
check('undo first import deletes 22', undo1.data.deleted === 22, `deleted=${undo1.data.deleted}`);
const after = await call('GET', '/contacts');
check('contacts empty after undo', after.data.total === 0);
const undoAgain = await call('DELETE', `/imports/${batchId}`);
check('second undo rejected 409', undoAgain.status === 409);

// leave the sample data in place for the UI
const fd3 = new FormData();
fd3.append('file', new Blob([fs.readFileSync(sample)]), 'sample-contacts.xlsx');
const preview3 = await call('POST', '/imports/preview', undefined, fd3);
const commit3 = await call('POST', '/imports/commit', { uploadId: preview3.data.uploadId, duplicateStrategy: 'skip', sheets: preview3.data.sheets.map((s) => ({ name: s.name, include: true, mapping: s.suggestedMapping })) });
check('re-seeded sample data', commit3.data.totals?.created === 22);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
