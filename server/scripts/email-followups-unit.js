// Unit checks for the Email Evaluation follow-up sends (no database).
// Usage: node scripts/email-followups-unit.js
import assert from 'node:assert/strict';
import { addWorkdays, channelsFor, followUpState, parseSent } from '../src/services/emailEvaluation.js';

const d = (s) => new Date(`${s}T00:00:00Z`);
const iso = (x) => x?.toISOString().slice(0, 10) ?? null;

// 10 working days skip weekends: Fri 2 Oct 2026 -> Fri 16 Oct; Mon 28 Sep -> Mon 12 Oct
assert.equal(iso(addWorkdays(d('2026-10-02'), 10)), '2026-10-16');
assert.equal(iso(addWorkdays(d('2026-09-28'), 10)), '2026-10-12');

// the team's DATE OF FOLLOW UP text, as found in the sheet
const row2026 = d('2026-09-01');
const sent = (t) => {
  const r = parseSent(t, row2026);
  return r && [r.n, iso(r.date)];
};
assert.deepEqual(sent('4th ReSent 30/09'), [4, '2026-09-30']);
assert.deepEqual(sent('3rd RE Sent 1/10'), [3, '2026-10-01']);
assert.deepEqual(sent('2nd RE Sent2/10'), [2, '2026-10-02']);
assert.deepEqual(sent('3rdRE Sent 2/10'), [3, '2026-10-02']);
assert.deepEqual(sent('2rd RE Sent 1/10'), [2, '2026-10-01']);
assert.deepEqual(sent('2nd Re sent 09/29/2026'), [2, '2026-09-29']);
assert.deepEqual(sent('3rd RE SENT09/29/2026'), [3, '2026-09-29']);
assert.deepEqual(sent('4th sent10/6/2026'), [4, '2026-10-06']);
assert.deepEqual(sent('2nd Follow up 10-02-2026'), [2, '2026-10-02']);
assert.deepEqual(sent('Sent 10-5-2026'), [1, '2026-10-05']);
assert.deepEqual(sent('2026-09-23'), [1, '2026-09-23']);
assert.equal(sent('BOOKED 09/24/2026'), null);
assert.equal(sent(''), null);

// state: sheet text, CRM sends, row date, booked, all five sent, Reservations
const st = (doc) => {
  const s = followUpState({ tab: 'HARRY', status: '', followUpDate: '', date: null, sends: [], ...doc });
  return [s.sentCount, iso(s.lastSentAt), iso(s.nextFollowUpAt)];
};
assert.deepEqual(st({ date: row2026 }), [1, '2026-09-01', '2026-09-15']);
assert.deepEqual(st({ followUpDate: '3rd RE Sent 2/10' }), [3, '2026-10-02', '2026-10-16']);
assert.deepEqual(st({ followUpDate: '3rd RE Sent 2/10', sends: [{ n: 4, date: d('2026-10-16') }] }), [4, '2026-10-16', '2026-10-30']);
assert.deepEqual(st({ followUpDate: '5th RE Sent 2/10' }), [5, '2026-10-02', null]);
assert.deepEqual(st({ followUpDate: '09/15/2026 BOOKED', date: row2026 }), [1, '2026-09-01', null]);
assert.deepEqual(st({ status: 'NEVER BOOKED', date: row2026 }), [1, '2026-09-01', '2026-09-15']);
assert.deepEqual(st({ tab: 'Reservations@', followUpDate: '2026-09-21' }), [0, null, null]);
assert.deepEqual(st({}), [0, null, null]);

assert.deepEqual(channelsFor('HARRY'), ['email']);
assert.deepEqual(channelsFor(''), ['email', 'text', 'whatsapp', 'call']);
assert.deepEqual(channelsFor('Reservations@'), []);

console.log('email follow-up checks passed');
