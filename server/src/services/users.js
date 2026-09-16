// The team roster. Missing accounts are created on start-up with a generated password each; the
// passwords are printed once and written to server/initial-passwords.txt (git-ignored) so the
// super admin can hand them out. Existing accounts are never changed here.
import fs from 'node:fs';
import path from 'node:path';
import { User } from '../models/User.js';
import { generatePassword, hashPassword } from '../lib/auth.js';

export const TEAM = [
  { userId: 'FD-001', displayName: 'Charan', username: 'charan', role: 'admin' },
  { userId: 'FD-002', displayName: 'Haroon', username: 'haroon' },
  { userId: 'FD-003', displayName: 'Abdul', username: 'abdul' },
  { userId: 'FD-004', displayName: 'Munish', username: 'munish' },
  { userId: 'FD-005', displayName: 'Jasleen', username: 'jasleen' },
  { userId: 'FD-006', displayName: 'Gurleen', username: 'gurleen' },
  { userId: 'FD-007', displayName: 'Azam', username: 'azam' },
  { userId: 'FD-008', displayName: 'Sukhpreet', username: 'sukhpreet' },
  { userId: 'FD-009', displayName: 'Ashish', username: 'ashish' },
  { userId: 'FD-010', displayName: 'Sameer', username: 'sameer' },
  { userId: 'FD-011', displayName: 'Rahul', username: 'rahul' },
];

const PASSWORD_FILE = path.resolve(process.cwd(), 'initial-passwords.txt');

/** Create the team accounts that do not exist yet. Returns [{ userId, username, password }] for the new ones. */
export async function seedUsers({ log = console.log } = {}) {
  const existing = new Set((await User.find().select('username').lean()).map((u) => u.username));
  const created = [];
  for (const member of TEAM) {
    if (existing.has(member.username)) continue;
    const password = generatePassword();
    await User.create({ ...member, role: member.role || 'agent', passwordHash: hashPassword(password) });
    created.push({ userId: member.userId, username: member.username, displayName: member.displayName, role: member.role || 'agent', password });
  }
  if (created.length) {
    const lines = created.map((u) => `${u.userId}  ${u.displayName.padEnd(10)} username: ${u.username.padEnd(10)} password: ${u.password}${u.role === 'admin' ? '   (super admin)' : ''}`);
    const text = `Initial passwords generated ${new Date().toISOString()} - hand out, then delete this file. Users can change their password in the app.\n\n${lines.join('\n')}\n`;
    try {
      fs.appendFileSync(PASSWORD_FILE, text);
      log(`[auth] created ${created.length} account(s); passwords written to ${PASSWORD_FILE}`);
    } catch (err) {
      log(`[auth] created ${created.length} account(s) (could not write ${PASSWORD_FILE}: ${err.message})`);
    }
    log(`[auth]\n${lines.join('\n')}`);
  }
  return created;
}
