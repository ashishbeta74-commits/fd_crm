// The CRM shows and enters every time in New York time, whatever the browser's own zone.
// Calendar dates (follow-ups, bookings) are still UTC-midnight values from the API; these helpers
// are for real instants (timestamps, reminder times) and for "what day is it in New York".

export const TIME_ZONE = 'America/New_York';
export const TIME_ZONE_LABEL = 'New York';

const pad = (n) => String(n).padStart(2, '0');
const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long' });

/** The wall-clock parts of an instant in New York: { year, month (1-12), day, hour, minute, weekday }. */
export function zonedParts(d = new Date()) {
  const p = Object.fromEntries(parts.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour === 24 ? 0 : +p.hour, minute: +p.minute, weekday: p.weekday };
}

/** "YYYY-MM-DD" of an instant as seen in New York. */
export function zonedDateIso(d = new Date()) {
  const p = zonedParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:mm" of an instant as seen in New York. */
export function zonedTime(d = new Date()) {
  const p = zonedParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** New York's calendar date as a UTC-midnight Date (how the API stores calendar dates). */
export function zonedTodayUtc(d = new Date()) {
  const p = zonedParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** "YYYY-MM-DD" for `days` after today, New York calendar. */
export function zonedDayAt(days, from = new Date()) {
  return new Date(zonedTodayUtc(from).getTime() + days * 86400000).toISOString().slice(0, 10);
}
