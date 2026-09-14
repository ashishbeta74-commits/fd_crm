// Calendar dates (follow-ups, booking dates) are stored as UTC midnight so that the
// same calendar day is shown regardless of the viewer's timezone.

export function utcDate(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function dateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** UTC-midnight representation of today's local calendar date. */
export function todayUtc() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

export function isoDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
}

const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const DATE_ORDER = (process.env.IMPORT_DATE_ORDER || 'dmy').toLowerCase();

/**
 * Parse anything a spreadsheet cell or an API client may send into a UTC-midnight Date.
 * Accepts Date objects (ExcelJS gives UTC-based dates), Excel serial numbers,
 * ISO strings, dd/mm/yyyy or mm/dd/yyyy (IMPORT_DATE_ORDER decides ambiguous ones),
 * and free text such as "15 Sep 2026". Returns null when nothing sensible is found.
 */
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dateOnly(v);
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return dateOnly(new Date(Math.round((v - 25569) * 86400000)));
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return utcDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    let d;
    let mo;
    if (a > 12 && b <= 12) {
      d = a;
      mo = b;
    } else if (b > 12 && a <= 12) {
      mo = a;
      d = b;
    } else if (DATE_ORDER === 'mdy') {
      mo = a;
      d = b;
    } else {
      d = a;
      mo = b;
    }
    return utcDate(y, mo, d);
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    return utcDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return null;
}

/** Parse a time cell/string into "HH:mm" (24h) or '' when not recognisable. */
export function parseTime(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    if (h === 0 && m === 0) return '';
    return hhmm(h, m);
  }
  if (typeof v === 'number') {
    let frac = v;
    if (frac < 0) return '';
    if (frac >= 1) frac -= Math.floor(frac); // date+time serial: keep the time part
    if (!frac) return '';
    const mins = Math.round(frac * 24 * 60);
    return hhmm(Math.floor(mins / 60) % 24, mins % 60);
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m?\.?/i) || s.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return '';
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  const ap = m[3] ? m[3].toLowerCase() : '';
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (h > 23 || mi > 59) return '';
  return hhmm(h, mi);
}
