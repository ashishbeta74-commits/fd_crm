import { Contact } from '../models/Contact.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { LinkedSheet } from '../models/LinkedSheet.js';
import { SavedView } from '../models/SavedView.js';
import { HttpError } from '../lib/errors.js';
import { escapeRegex } from '../lib/pool.js';

const exact = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });

/**
 * Rename a list (the name contacts carry as source.sheetName, shown as "sheet" in the filters).
 * Touches every place the name lives so a later sync keeps the new name: the contacts, the import
 * batches (their listName seeds the next resync), the saved sheet entry, multi-tab sub-lists
 * ("<list> - <tab>") and saved views filtering on it.
 */
export async function renameList(fromRaw, toRaw, { sheetId = null } = {}) {
  const from = String(fromRaw || '').trim();
  const to = String(toRaw || '').trim().replace(/\s+/g, ' ');
  if (!from) throw new HttpError(400, 'Which list should be renamed?');
  if (!to) throw new HttpError(400, 'Give the list a new name');
  if (to.length > 120) throw new HttpError(400, 'Keep the name under 120 characters');
  if (from === to) return { from, to, contacts: 0, batches: 0, sheets: 0, views: 0 };

  if (from.toLowerCase() !== to.toLowerCase()) {
    const clash =
      (await Contact.exists({ 'source.sheetName': exact(to) })) ||
      (await ImportBatch.exists({ 'source.listName': exact(to), undoneAt: null })) ||
      (await LinkedSheet.exists({ name: exact(to), ...(sheetId ? { _id: { $ne: sheetId } } : {}) }));
    if (clash) throw new HttpError(409, `A list called "${to}" already exists`);
  }

  const prefix = `${from} - `;
  const [contacts, subLists, batches, sheets, views] = await Promise.all([
    Contact.updateMany({ 'source.sheetName': from }, { $set: { 'source.sheetName': to } }),
    Contact.updateMany({ 'source.sheetName': { $regex: `^${escapeRegex(prefix)}` } }, [
      { $set: { 'source.sheetName': { $replaceOne: { input: '$source.sheetName', find: prefix, replacement: `${to} - ` } } } },
    ]),
    ImportBatch.updateMany({ 'source.listName': from }, { $set: { 'source.listName': to } }),
    LinkedSheet.updateMany(sheetId ? { $or: [{ _id: sheetId }, { name: from }] } : { name: from }, { $set: { name: to } }),
    SavedView.updateMany({ 'params.sheet': from }, { $set: { 'params.sheet': to } }),
  ]);
  return {
    from,
    to,
    contacts: (contacts.modifiedCount || 0) + (subLists.modifiedCount || 0),
    batches: batches.modifiedCount || 0,
    sheets: sheets.modifiedCount || 0,
    views: views.modifiedCount || 0,
  };
}
