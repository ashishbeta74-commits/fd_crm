import { FIELDS, isCrmColumn } from '../fields.js';

/** Lower-case, strip punctuation, collapse whitespace: "Contact L1 Info." -> "contact l1 info". */
export function normalizeHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[_\-/\\.,:;#()[\]{}'"?!*&+|]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokens = (s) => new Set(normalizeHeader(s).split(' ').filter(Boolean));

function scoreHeader(header, field) {
  const n = normalizeHeader(header);
  if (!n) return 0;
  // Aliases starting with '=' only match the whole header (e.g. '=date' matches "Date" but not "Research Date").
  const exactOnly = field.aliases.filter((a) => a.startsWith('=')).map((a) => normalizeHeader(a.slice(1)));
  if (exactOnly.includes(n)) return 1;
  const candidates = [field.label, ...field.aliases.filter((a) => !a.startsWith('='))].map(normalizeHeader).filter(Boolean);
  if (candidates.includes(n)) return 1;
  const ht = tokens(n);
  let best = 0;
  for (const c of candidates) {
    // whole-phrase containment, e.g. "next follow up date" contains "follow up"
    if (n.includes(c) && new RegExp(`(^| )${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(n)) {
      best = Math.max(best, 0.6 + 0.3 * (c.length / n.length));
    }
    const ct = tokens(c);
    let inter = 0;
    for (const t of ht) if (ct.has(t)) inter += 1;
    const union = new Set([...ht, ...ct]).size;
    if (union) best = Math.max(best, inter / union);
  }
  return best;
}

const MULTI_MAX_COLUMNS = 2;

/** Position of the best-matching alias (lower = preferred) so "Company City" beats "Contact Location - ZIP". */
function aliasRank(header, field) {
  const n = normalizeHeader(header);
  const list = [field.label, ...field.aliases.map((a) => a.replace(/^=/, ''))].map(normalizeHeader);
  const i = list.indexOf(n);
  return i === -1 ? list.length : i;
}

/**
 * Suggest which contact field each spreadsheet header maps to.
 * Greedy best-score-first assignment: one field per header; one header per field, except
 * `multi` fields (location, notes...) which may collect up to MULTI_MAX_COLUMNS columns
 * (raw Seamless exports have 20+ location-ish columns; the user can add more by hand).
 * @returns {Record<string, string>} header -> field key ('' when unmapped)
 */
export function suggestMapping(headers) {
  const scored = [];
  for (const h of headers) {
    if (isCrmColumn(h)) continue; // columns the CRM itself wrote back (two-way sync) are never read
    for (const f of FIELDS) {
      const s = scoreHeader(h, f);
      if (s >= 0.5) scored.push({ h, key: f.key, s, multi: Boolean(f.multi), rank: aliasRank(h, f) });
    }
  }
  scored.sort((a, b) => b.s - a.s || a.rank - b.rank);
  const result = {};
  const used = new Map(); // field key -> number of columns assigned
  for (const { h, key, s, multi } of scored) {
    if (result[h] !== undefined) continue;
    const count = used.get(key) || 0;
    if (count >= 1 && !(multi && s >= 0.6 && count < MULTI_MAX_COLUMNS)) continue;
    result[h] = key;
    used.set(key, count + 1);
  }
  for (const h of headers) if (result[h] === undefined) result[h] = '';
  return result;
}

/** Build a de-duplication key: email first, then name+company, then name+phone. */
export function computeDedupeKey(c) {
  for (const k of ['email', 'primaryEmail']) {
    const e = String(c[k] || '').trim().toLowerCase();
    if (e.includes('@')) return `e:${e}`;
  }
  const n = normalizeHeader(c.name || '');
  const co = normalizeHeader(c.companyName || '');
  if (n && co) return `nc:${n}|${co}`;
  const p = String(c.contactMain || c.companyNo || '').replace(/\D/g, '');
  if (n && p.length >= 6) return `np:${n}|${p}`;
  return null;
}
