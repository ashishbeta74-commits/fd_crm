// Unit checks for the pure helpers of the Google Sheet write-back (no network).
// Usage: node scripts/writeback-unit.js
import assert from 'node:assert/strict';
import { cellsToRanges, columnLetter, contactKeys, nameHeaders, rowKeys, CRM_COLUMNS } from '../src/services/writeback.js';
import { contentHash } from '../src/services/sheetLink.js';
import { suggestMapping } from '../src/lib/mapping.js';
import { buildContact } from '../src/services/importer.js';

assert.equal(columnLetter(1), 'A');
assert.equal(columnLetter(26), 'Z');
assert.equal(columnLetter(27), 'AA');
assert.equal(columnLetter(52), 'AZ');

// header naming matches excel.js (duplicates -> " (2)", blanks -> "Column X")
assert.deepEqual(nameHeaders(['Name', 'Status', '', 'Status', 'Status']), ['Name', 'Status', 'Column C', 'Status (2)', 'Status (3)']);

// contact / row keys agree, including +1 vs bare phone numbers
const c = { name: 'Jane Doe', email: 'Jane@Example.com', companyName: 'Acme, Inc.', contactMain: '+1 (212) 555-0100' };
const headers = ['Contact Full Name', 'Email 1', 'Company Name', 'Contact Phone 1'];
const mapping = suggestMapping(headers);
assert.equal(mapping['Contact Full Name'], 'name');
assert.equal(mapping['Email 1'], 'email');
assert.equal(mapping['Company Name'], 'companyName');
assert.equal(mapping['Contact Phone 1'], 'contactMain');
const cols = { emails: [1], name: 0, company: 2, phones: [3] };
const rk = rowKeys(['Jane Doe', 'jane@example.com', 'ACME Inc', '212-555-0100'], cols);
const ck = contactKeys(c);
assert.ok(ck.includes('e:jane@example.com') && rk.includes('e:jane@example.com'));
assert.ok(ck.includes('nc:jane doe|acme inc') && rk.includes('nc:jane doe|acme inc'));
assert.ok(ck.includes('np:jane doe|2125550100') && rk.includes('np:jane doe|2125550100'));

// adjacent cells collapse into one range per row; gaps split
const cells = new Map([
  [5, new Map([[3, 'a'], [4, 'b'], [6, 'c']])],
  [1, new Map([[19, 'CRM Stage']])],
]);
const ranges = cellsToRanges("Sheet '1", cells);
assert.deepEqual(ranges.map((r) => r.range), ["'Sheet ''1'!D5:E5", "'Sheet ''1'!G5:G5", "'Sheet ''1'!T1:T1"]);
assert.deepEqual(ranges[0].values, [['a', 'b']]);

// CRM columns never get suggested as import fields, are dropped from `extra`, and do not change the fingerprint
const withCrm = [...headers, ...CRM_COLUMNS.map((x) => x.header)];
const m2 = suggestMapping(withCrm);
assert.ok(CRM_COLUMNS.every((x) => m2[x.header] === ''), 'CRM columns must stay unmapped');
const built = buildContact({ 'Contact Full Name': 'Jane Doe', 'CRM Stage': 'Prospect', 'CRM Notes': 'x' }, m2, { fileName: 'f', listName: 'L', sheetName: 'S', rowNumber: 2, batchId: null });
assert.equal(built.stage, 'new');
assert.deepEqual(built.extra, {});
const sheetA = [{ name: 'S', headers, rows: [{ rowNumber: 2, values: { 'Contact Full Name': 'Jane Doe' } }] }];
const sheetB = [{ name: 'S', headers: withCrm, rows: [{ rowNumber: 2, values: { 'Contact Full Name': 'Jane Doe', 'CRM Stage': 'Prospect' } }] }];
assert.equal(contentHash(sheetA), contentHash(sheetB), 'CRM columns must not affect the content hash');

// tags / priority import
const m3 = suggestMapping(['Name', 'Pri', 'Category']);
assert.equal(m3.Pri, 'priority');
assert.equal(m3.Category, 'tags');
const t = buildContact({ Name: 'A B', Pri: 'P1', Category: 'VIP, nj; vip' }, m3, { fileName: 'f', listName: 'L', sheetName: 'S', rowNumber: 2, batchId: null });
assert.equal(t.priority, 'urgent');
assert.deepEqual(t.tags, ['VIP', 'nj']);
console.log('writeback-unit: all assertions passed');
