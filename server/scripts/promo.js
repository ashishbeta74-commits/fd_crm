// Shared by import-promo-claims.js and import-price-checks.js: a promo claim is one person, matched to their
// BMC price checks by email or phone (last 10 digits, so "+1 (727) 776-3409" = "+17277763409").
import { SheetRow } from '../src/models/SheetRow.js';

export const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const samePerson = (a, b) => Boolean((a.email && a.email.toLowerCase() === String(b.email || '').toLowerCase()) || (digits(a.phone) && digits(a.phone) === digits(b.phone)));

/** A claim row is keyed by its promo code; any other row with a promo got it merged in. */
export const isClaimRow = (r) => Boolean(r.values?.promo) && r.key === String(r.values.promo).toLowerCase();

/**
 * Merge promo claim rows into the person's price checks: every matching price check gets the promo code,
 * and the claim row goes. A claim row someone already worked in the CRM (follow-up / note) is kept, so
 * that work isn't lost; it still lends its code to the matching price checks.
 */
export async function mergePromoRows(ws, { dry = false } = {}) {
  const rows = await SheetRow.find({ workspace: ws.key }).select('key values editedAt').lean();
  const claims = rows.filter(isClaimRow);
  let merged = 0;
  for (const c of claims) {
    const matches = rows.filter((r) => !isClaimRow(r) && samePerson(c.values, r.values));
    if (!matches.length) continue;
    merged += 1;
    console.log(`  ${c.values.promo} (${c.values.email || c.values.phone}) -> ${matches.map((m) => m.values.ref).join(', ')}${c.editedAt ? ' (claim row worked in the CRM, kept)' : ''}`);
    if (dry) continue;
    await SheetRow.updateMany({ _id: { $in: matches.map((m) => m._id) } }, { $set: { 'values.promo': c.values.promo, 'sheet.promo': c.values.promo } });
    if (!c.editedAt) await SheetRow.deleteOne({ _id: c._id });
  }
  return merged;
}
