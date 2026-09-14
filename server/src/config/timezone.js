// The CRM runs on New York time no matter where the API is hosted: "today", the 09:00 reminder
// default, follow-up grouping and every local-time calculation use this zone. Import this module
// FIRST (index.js / app.js) so it is applied before any Date work happens.
export const TIME_ZONE = process.env.CRM_TIMEZONE || 'America/New_York';
process.env.TZ = TIME_ZONE;

const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "2026-09-12 14:32" in the CRM's time zone (for exports and logs). */
export function formatZoned(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const p = Object.fromEntries(stamp.formatToParts(dt).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}
