// node scripts/sheet-edit-check.js - the "skip unchanged sheets" check behind the automatic syncs (sheetEditCheck).
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });

let modifiedTime = '2026-10-17T10:00:00.000Z';
let driveCalls = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
  driveCalls += 1;
  return modifiedTime ? new Response(JSON.stringify({ modifiedTime })) : new Response('{"error":{"message":"nope"}}', { status: 404 });
};

const { sheetEditCheck } = await import('../src/services/sheetLink.js');

let c = await sheetEditCheck('a', 'id1');
assert.equal(c.unchanged, false, 'first check always downloads');
c.done();
assert.equal((await sheetEditCheck('a', 'id1')).unchanged, true, 'same modifiedTime after done() -> skip');
assert.equal((await sheetEditCheck('b', 'id1')).unchanged, false, 'keys are separate');

modifiedTime = '2026-10-17T11:00:00.000Z';
c = await sheetEditCheck('a', 'id1');
assert.equal(c.unchanged, false, 'edited -> download');
assert.equal((await sheetEditCheck('a', 'id1')).unchanged, false, 'not remembered until done()');
c.done();
assert.equal((await sheetEditCheck('a', 'id1')).unchanged, true);

const realNow = Date.now;
Date.now = () => realNow() + 61 * 60 * 1000;
assert.equal((await sheetEditCheck('a', 'id1')).unchanged, false, 'full download at least hourly');
Date.now = realNow;

modifiedTime = '';
c = await sheetEditCheck('a', 'id1');
assert.equal(c.unchanged, false, 'Drive error -> fall back to download');
c.done();
assert.ok(driveCalls > 0);
console.log('sheet-edit-check: ok');
