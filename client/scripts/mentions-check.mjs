// node scripts/mentions-check.mjs - the @tag parsing behind note tagging (src/lib/mentions.js).
import assert from 'node:assert/strict';
import { extractMentions, splitMentions, tagQueryAt } from '../src/lib/mentions.js';

const team = [
  { _id: 'u1', displayName: 'Haroon' },
  { _id: 'u2', displayName: 'Abdul' },
  { _id: 'u3', displayName: 'Ali Khan' },
];

assert.deepEqual(extractMentions('@Haroon can you call back?', team), { mentions: ['u1'], mentionAll: false });
assert.deepEqual(extractMentions('ping @haroon and @Ali Khan', team), { mentions: ['u1', 'u3'], mentionAll: false });
assert.deepEqual(extractMentions('heads up @all', team), { mentions: [], mentionAll: true });
assert.deepEqual(extractMentions('mail abdul@all.com, @Haroonx', team), { mentions: [], mentionAll: false }, 'emails and longer words are not tags');

assert.deepEqual(splitMentions('Hi @Haroon, see @all.', ['Haroon']), [
  { text: 'Hi ', tag: false },
  { text: '@Haroon', tag: true },
  { text: ', see ', tag: false },
  { text: '@all', tag: true },
  { text: '.', tag: false },
]);
assert.deepEqual(splitMentions('no tags here', ['Haroon']), [{ text: 'no tags here', tag: false }]);

assert.equal(tagQueryAt('hello @Ha', 9), 'Ha');
assert.equal(tagQueryAt('hello @', 7), '');
assert.equal(tagQueryAt('hello Ha', 8), null);
assert.equal(tagQueryAt('a@b', 3), null, 'not inside an email');

console.log('mentions-check: ok');
