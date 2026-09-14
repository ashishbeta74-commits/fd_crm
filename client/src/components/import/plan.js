// Pure helpers for the import wizard's per-sheet plans (no React in here).
// A plan is { name, include, defaultStage, mapping: { header: fieldKey | SKIP } }.

/** Radix Select items cannot use '' as a value, so "not mapped" is this sentinel in the UI. */
export const SKIP = 'skip';

/** Longest list name the API accepts (POST /imports/commit `listName`). */
export const LIST_NAME_MAX = 120;

/** Default "List name" for a preview: the Google Sheet title, otherwise the file name without its extension. */
export function defaultListName(preview) {
  const title = preview?.source?.type === 'google-sheet' ? preview.source.title : '';
  const name = title || String(preview?.fileName || '').replace(/\.[^.]+$/, '');
  return name.trim().slice(0, LIST_NAME_MAX);
}

/** True when `name` is already used by a list (case-insensitive exact match); the API then appends a number. */
export function isListNameTaken(name, names = []) {
  const wanted = String(name || '').trim().toLowerCase();
  return Boolean(wanted) && names.some((n) => String(n).trim().toLowerCase() === wanted);
}

const GROUP_LABELS = { contact: 'Contact', company: 'Company', pipeline: 'Pipeline' };
const GROUP_ORDER = ['contact', 'company', 'pipeline'];

/**
 * Preview sheets -> editable plans, seeded from the server's suggested mapping and its include flag
 * (a Google Sheet link preview turns only the linked tab on; file uploads include every sheet).
 */
export function buildPlans(sheets) {
  return sheets.map((s) => ({
    name: s.name,
    include: s.include !== false,
    defaultStage: 'new',
    // '' = detect the contact type from the list name and each row's job title
    category: '',
    mapping: Object.fromEntries(s.headers.map((h) => [h, s.suggestedMapping?.[h] || SKIP])),
  }));
}

/** Fields flagged `multi` in meta (location, notes, companyInfo, followUpNote) may collect several columns; the values are joined. */
export const isMultiField = (fields, key) => Boolean(fields?.find((f) => f.key === key)?.multi);

/** Headers currently mapped to `key`. */
export const columnsForField = (mapping, key) =>
  Object.entries(mapping || {})
    .filter(([, k]) => k === key)
    .map(([h]) => h);

/**
 * Map `header` to `key`. A single-column field can only feed one column, so any other column using it is
 * cleared (reported as `movedFrom`). Multi-column fields keep the other columns - their values are joined.
 */
export function applyMapping(mapping, header, key, fields = []) {
  const next = { ...mapping, [header]: key };
  let movedFrom = null;
  if (key !== SKIP && !isMultiField(fields, key)) {
    for (const [h, k] of Object.entries(mapping)) {
      if (h !== header && k === key) {
        next[h] = SKIP;
        movedFrom = h;
      }
    }
  }
  return { mapping: next, movedFrom };
}

export const mappedCount = (plan) => Object.values(plan.mapping).filter((k) => k !== SKIP).length;

/** Why the import cannot run yet, or null when the plans are valid. */
export function validatePlans(plans) {
  const included = plans.filter((p) => p.include);
  if (!included.length) return 'Include at least one sheet to import';
  const empty = included.find((p) => mappedCount(p) === 0);
  if (empty) return `Map at least one column in "${empty.name}" (or exclude the sheet)`;
  return null;
}

/** Plans -> the `sheets` array for POST /imports/commit (SKIP becomes ''). */
export function toCommitSheets(plans) {
  return plans.map((p) => ({
    name: p.name,
    include: p.include,
    defaultStage: p.defaultStage,
    category: p.category || '',
    mapping: Object.fromEntries(Object.entries(p.mapping).map(([h, k]) => [h, k === SKIP ? '' : k])),
  }));
}

/** Meta fields grouped for the "Maps to" select: [{ key, label, fields }], known groups first. */
export function groupFields(fields = []) {
  const byGroup = new Map();
  for (const f of fields) {
    const g = f.group || 'other';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(f);
  }
  const keys = [...GROUP_ORDER.filter((g) => byGroup.has(g)), ...[...byGroup.keys()].filter((g) => !GROUP_ORDER.includes(g))];
  return keys.map((key) => ({ key, label: GROUP_LABELS[key] || key[0].toUpperCase() + key.slice(1), fields: byGroup.get(key) }));
}

export const fieldLabel = (fields, key) => fields?.find((f) => f.key === key)?.label || key;

/** First `n` non-empty sample values of one column. */
export function sampleValues(sheet, header, n = 3) {
  const out = [];
  for (const row of sheet.sample || []) {
    const v = row?.[header];
    if (v !== undefined && v !== null && String(v).trim()) out.push(String(v).trim());
    if (out.length >= n) break;
  }
  return out;
}
