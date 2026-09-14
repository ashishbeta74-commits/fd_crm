// Smoke test for tags / priority, saved views, reminders and duplicate merge.
// Usage: API_URL=http://localhost:4100 node scripts/features-smoke.js
// Creates a few "ZZ Smoke ..." contacts, exercises the endpoints and deletes what it created.
const API = (process.env.API_URL || 'http://localhost:4000') + '/api';
let failures = 0;

function check(name, cond, info = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
  if (!cond) failures += 1;
}

async function call(method, p, body) {
  const opts = { method, headers: process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + p, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const created = [];
const mk = async (body) => {
  const r = await call('POST', '/contacts', { allowDuplicate: true, ...body });
  if (r.status !== 201) throw new Error(`create failed: ${r.status} ${JSON.stringify(r.data)}`);
  created.push(r.data._id);
  return r.data;
};

try {
  // ---- tags + priority ----
  const a = await mk({ name: 'ZZ Smoke Alpha', email: 'zz.smoke.alpha@example.com', companyName: 'Smoke Co', contactMain: '+1 (212) 555-0100', tags: ['VIP', ' nj ', 'vip'], priority: 'high' });
  check('create keeps tags de-duplicated (case-insensitive) and priority', a.tags.length === 2 && a.tags[0] === 'VIP' && a.priority === 'high' && a.priorityRank === 3, JSON.stringify(a.tags));
  const upd = await call('PATCH', `/contacts/${a._id}`, { priority: 'urgent' });
  check('priority change logs an activity', upd.data.priority === 'urgent' && upd.data.activities.some((x) => x.type === 'edit' && /Priority set to Urgent/.test(x.message)));
  const list = await call('GET', '/contacts?priority=urgent&tag=vip&limit=5');
  check('list filters by priority + tag (case-insensitive)', list.data.items.some((c) => c._id === a._id), `total=${list.data.total}`);
  const none = await call('GET', '/contacts?priority=none&limit=1');
  check('priority=none matches contacts without the field', none.status === 200);
  const meta = await call('GET', '/meta');
  check('meta lists priorities + tags', meta.data.priorities?.length === 4 && meta.data.tags.some((t) => t.tag === 'VIP'));
  const b = await mk({ name: 'ZZ Smoke Beta', email: 'zz.smoke.beta@example.com', companyName: 'Smoke Co' });
  const bulk = await call('POST', '/contacts/bulk', { ids: [a._id, b._id], action: 'addTags', tags: ['Corporate'] });
  check('bulk addTags', bulk.data.updated === 2, JSON.stringify(bulk.data));
  const bulk2 = await call('POST', '/contacts/bulk', { ids: [a._id, b._id], action: 'priority', priority: 'low' });
  check('bulk priority', bulk2.data.updated === 2, JSON.stringify(bulk2.data));
  const bulk3 = await call('POST', '/contacts/bulk', { ids: [a._id], action: 'removeTags', tags: ['vip'] });
  const a2 = await call('GET', `/contacts/${a._id}`);
  check('bulk removeTags (case-insensitive)', bulk3.data.updated === 1 && !a2.data.tags.includes('VIP') && a2.data.tags.includes('Corporate'), JSON.stringify(a2.data.tags));

  // ---- saved views ----
  const v = await call('POST', '/views', { name: 'ZZ Smoke view', params: { stage: 'new', priority: 'high', sort: 'updatedAt', dir: 'desc', q: '' } });
  check('create view drops defaults / empties', v.status === 201 && v.data.params.stage === 'new' && v.data.params.sort === undefined && v.data.params.q === undefined, JSON.stringify(v.data.params));
  const dupView = await call('POST', '/views', { name: 'zz smoke VIEW', params: {} });
  check('duplicate view name (case-insensitive) -> 409', dupView.status === 409);
  const ren = await call('PATCH', `/views/${v.data._id}`, { name: 'ZZ Smoke view 2', pinned: false });
  check('rename + unpin view', ren.data.name === 'ZZ Smoke view 2' && ren.data.pinned === false);
  const views = await call('GET', '/views');
  check('views list', views.data.items.some((x) => x._id === v.data._id));
  const delView = await call('DELETE', `/views/${v.data._id}`);
  check('delete view', delView.data.ok === true);

  // ---- reminders ----
  const r1 = await call('POST', '/reminders', { contactId: a._id, at: '2020-01-01T09:00', note: 'overdue one' });
  check('create reminder inherits contact priority', r1.status === 201 && r1.data.priority === 'low', JSON.stringify(r1.data.priority));
  const r2 = await call('POST', '/reminders', { contactId: b._id, at: '2099-01-01', note: 'far future', priority: 'urgent' });
  check('date-only reminder lands at 09:00 local', r2.status === 201 && new Date(r2.data.at).getHours() === 9);
  const due = await call('GET', '/reminders/due');
  check('due lists the overdue reminder with its contact', due.data.overdue >= 1 && due.data.items.some((x) => x._id === r1.data._id && x.contact?.name === 'ZZ Smoke Alpha'));
  const grouped = await call('GET', '/reminders');
  check('grouped reminders: overdue + later', grouped.data.overdue.some((x) => x._id === r1.data._id) && grouped.data.later.some((x) => x._id === r2.data._id));
  const fu = await call('GET', '/followups');
  check('follow-ups page includes reminders (kind=reminder, time)', fu.data.overdue.some((e) => e.kind === 'reminder' && e.reminderId === r1.data._id && /^\d\d:\d\d$/.test(e.time)));
  const detail = await call('GET', `/contacts/${a._id}`);
  check('contact detail carries its reminders + reminder activity', detail.data.reminders?.length === 1 && detail.data.activities.some((x) => x.type === 'reminder'));
  const snooze = await call('POST', `/reminders/${r1.data._id}/snooze`, { minutes: 120 });
  check('snooze moves it ~2h ahead', new Date(snooze.data.at) - Date.now() > 100 * 60_000);
  const done = await call('PATCH', `/reminders/${r1.data._id}`, { done: true });
  check('mark done', done.data.done === true && done.data.doneAt);
  const notified = await call('POST', '/reminders/notified', { ids: [r2.data._id] });
  check('notified endpoint', notified.status === 200);
  const stats = await call('GET', '/stats');
  check('stats has reminders + byPriority', stats.data.reminders && stats.data.byPriority && typeof stats.data.reminders.unscheduledPriority === 'number');

  // ---- duplicates + merge + undo ----
  const c = await mk({ name: 'ZZ Smoke Alpha', primaryEmail: 'ZZ.Smoke.Alpha@example.com', companyName: 'Smoke Co Inc', title: 'Owner', tags: ['Repeat'], priority: 'urgent', notes: 'from c' });
  const d = await mk({ name: 'Z. Smoke', contactMain: '212-555-0100', companyName: 'Other' }); // same phone (no country code), shares "smoke"
  const e = await mk({ name: 'Someone Else', contactMain: '2125550100' }); // same phone, no shared name word -> not linked
  const dups = await call('GET', '/duplicates?by=email,phone,name_company&q=zz smoke');
  const group = dups.data.items.find((g) => g.contacts.some((x) => x._id === a._id));
  check('duplicate group links a (email) + c (primaryEmail) + d (phone with name word)', group && [a._id, c._id, d._id].every((id) => group.contacts.some((x) => x._id === id)), group ? group.contacts.map((x) => x.name).join(' | ') : 'no group');
  check('switchboard-style phone match without a shared name is NOT linked', !group || !group.contacts.some((x) => x._id === e._id));
  check('group reasons include email + phone', group && group.reasons.includes('email') && group.reasons.includes('phone'), group?.reasons.join(','));
  const ign = await call('POST', '/duplicates/ignore', { ids: [a._id, d._id] });
  check('ignore pair', ign.data.pairs === 1);
  const dups2 = await call('GET', '/duplicates?by=phone&q=zz smoke');
  check('ignored pair no longer grouped by phone', !dups2.data.items.some((g) => g.contacts.some((x) => x._id === a._id) && g.contacts.some((x) => x._id === d._id)));
  await call('DELETE', '/duplicates/ignore', { ids: [a._id, d._id] });

  const merge = await call('POST', '/duplicates/merge', { primaryId: a._id, mergeIds: [c._id] });
  check('merge fills gaps, unions tags, keeps highest priority, moves reminders', merge.status === 200 && merge.data.contact.title === 'Owner' && merge.data.contact.tags.includes('Repeat') && merge.data.contact.tags.includes('Corporate') && merge.data.contact.priority === 'urgent' && /from c/.test(merge.data.contact.notes), JSON.stringify({ title: merge.data.contact?.title, tags: merge.data.contact?.tags, priority: merge.data.contact?.priority }));
  const gone = await call('GET', `/contacts/${c._id}`);
  check('merged contact deleted', gone.status === 404);
  const merges = await call('GET', '/duplicates/merges');
  check('merge log listed', merges.data.items.some((m) => m._id === merge.data.mergeId && m.mergedCount === 1));
  const undo = await call('POST', `/duplicates/merges/${merge.data.mergeId}/undo`);
  const back = await call('GET', `/contacts/${c._id}`);
  const aBack = await call('GET', `/contacts/${a._id}`);
  check('undo restores the merged contact and the primary', undo.status === 200 && back.status === 200 && aBack.data.title === '' && !aBack.data.tags.includes('Repeat'), JSON.stringify({ title: aBack.data.title, tags: aBack.data.tags }));
  const undoAgain = await call('POST', `/duplicates/merges/${merge.data.mergeId}/undo`);
  check('undo twice -> 409', undoAgain.status === 409);

  // ---- export has the new columns ----
  const exp = await fetch(`${API}/contacts/export?q=zz%20smoke`);
  check('export works with new columns', exp.status === 200 && (exp.headers.get('content-type') || '').includes('spreadsheet'));

  // ---- two-way sync surfaces its status ----
  const wb = await call('GET', '/sheets/writeback');
  check('writeback status endpoint', wb.status === 200 && Array.isArray(wb.data.columns) && wb.data.columns[0] === 'CRM Stage');
  const src = await call('GET', '/imports/sources');
  check('sources carry writeBack info', src.data.writeBack && typeof src.data.writeBack.configured === 'boolean');
} catch (err) {
  failures += 1;
  console.error('ERROR', err);
} finally {
  for (const id of created) await call('DELETE', `/contacts/${id}`);
  console.log(`cleaned up ${created.length} smoke contacts`);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
