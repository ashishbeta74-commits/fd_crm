// Date helpers. Calendar dates from the API (followUp, booking.date) are UTC midnight,
// so they are always rendered from their UTC parts. Timestamps (createdAt, activity.at)
// are real instants and are rendered in New York time (see lib/tz.js), whatever the browser's zone.

import { zonedDateIso, zonedParts } from '@/lib/tz';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDate = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

/** "YYYY-MM-DD" (UTC parts) - the format to send back to the API and to feed <input type="date">. */
export function isoDate(d) {
  const dt = toDate(d);
  return dt ? dt.toISOString().slice(0, 10) : '';
}

/** "12 Sep 2026" from a calendar date. */
export function formatDate(d) {
  const dt = toDate(d);
  if (!dt) return '';
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** "Thursday" - the weekday of a calendar date (UTC parts); '' when empty / invalid. */
export function weekdayName(d) {
  const dt = toDate(d);
  return dt ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getUTCDay()] : '';
}

/** "Thu, 25 Sep 2026" - a calendar date with its weekday (UTC parts, like formatDate). */
export function formatDateWithDay(d) {
  const dt = toDate(d);
  if (!dt) return '';
  return `${WEEKDAYS[dt.getUTCDay()]}, ${formatDate(dt)}`;
}

/** New York date + time for timestamps: "10 Sep 2026, 14:32". */
export function formatDateTime(d) {
  const dt = toDate(d);
  if (!dt) return '';
  const p = zonedParts(dt);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "10:30" -> "10:30 AM"; passes through anything that is not HH:mm. */
export function formatTime(t) {
  if (!t) return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  const h = +m[1];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** Today's calendar date in New York as "YYYY-MM-DD" (matches how the API stores dates). */
export function todayIso() {
  return zonedDateIso(new Date());
}

/** Whole days between today and a calendar date (negative = in the past). */
export function daysFromToday(d) {
  const dt = toDate(d);
  if (!dt) return null;
  const today = new Date(`${todayIso()}T00:00:00.000Z`);
  return Math.round((dt.getTime() - today.getTime()) / 86400000);
}

/** "Today", "Tomorrow", "In 5 days", "3 days overdue", "Yesterday". */
export function relativeDay(d) {
  const n = daysFromToday(d);
  if (n === null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1) return `In ${n} days`;
  return `${-n} days overdue`;
}

/** Relative time for timestamps: "just now", "5 min ago", "3 h ago", else a date. */
export function timeAgo(d) {
  const dt = toDate(d);
  if (!dt) return '';
  const diff = Date.now() - dt.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateTime(dt);
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';
}

export function pluralize(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
