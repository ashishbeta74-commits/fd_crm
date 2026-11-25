// Shared by import-promo-claims.js and import-price-checks.js: a promo claim is one person, matched to their
// BMC price checks by email or phone (last 10 digits, so "+1 (727) 776-3409" = "+17277763409").
import { SheetRow } from '../src/models/SheetRow.js';
import { WorkspaceEvent } from '../src/models/WorkspaceEvent.js';

export const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const samePerson = (a, b) => Boolean((a.email && a.email.toLowerCase() === String(b.email || '').toLowerCase()) || (digits(a.phone) && digits(a.phone) === digits(b.phone)));

/** A claim row is keyed by its promo code; any other row with a promo got it merged in. */
export const isClaimRow = (r) => Boolean(r.values?.promo) && r.key === String(r.values.promo).toLowerCase();

/**
 * Merge promo claim rows into the person's price checks: every matching price check gets the promo code,
 * and the claim row goes. When the claim row was worked in the CRM, its follow-up / note (and who did it)
 * move onto the matching price checks nobody has worked yet, and its status changes on My dashboard follow.
 * Only when every match was worked as well is the claim row kept, so neither side's work is overwritten.
 */
export async function mergePromoRows(ws, { dry = false } = {}) {
  const rows = await SheetRow.find({ workspace: ws.key }).select('key values editedAt updatedBy').lean();
  const claims = rows.filter(isClaimRow);
  let merged = 0;
  for (const c of claims) {
    const matches = rows.filter((r) => !isClaimRow(r) && samePerson(c.values, r.values));
    if (!matches.length) continue;
    const open = matches.filter((m) => !m.editedAt);
    const keep = Boolean(c.editedAt) && !open.length;
    merged += 1;
    console.log(`  ${c.values.promo} (${c.values.email || c.values.phone}) -> ${matches.map((m) => m.values.ref).join(', ')}${c.editedAt ? (keep ? ' (both sides worked in the CRM, claim row kept)' : ` (carried ${c.values.followUp} + note)`) : ''}`);
    if (dry) continue;
    await SheetRow.updateMany({ _id: { $in: matches.map((m) => m._id) } }, { $set: { 'values.promo': c.values.promo, 'sheet.promo': c.values.promo } });
    if (keep) continue;
    if (c.editedAt) {
      for (const m of open) {
        const note = [m.values.note, c.values.note].filter(Boolean).join(' · ');
        await SheetRow.updateOne({ _id: m._id }, { $set: { 'values.followUp': c.values.followUp, 'values.note': note, 'values.discount': c.values.discount || m.values.discount || '', editedAt: c.editedAt, updatedBy: c.updatedBy } });
      }
      await WorkspaceEvent.updateMany({ workspace: ws.key, rowId: c._id }, { $set: { rowId: open[0]._id, label: open[0].values.ref } });
    }
    await SheetRow.deleteOne({ _id: c._id });
  }
  return merged;
}
