// BMC Price Checks charts: every price check (ride date passed or not) counted by day, hour, place, trip, car and lead time.
// ponytail: counts in JS over every row's values; move to a Mongo $facet if the page grows past ~50k price checks.
import { isoDate } from '../lib/dates.js';

const AIRPORTS = [
  [/laguardia|\blga\b/i, 'LaGuardia (LGA)'],
  [/kennedy|\bjfk\b/i, 'JFK'],
  [/newark|\bewr\b/i, 'Newark (EWR)'],
  [/westchester county airport|\bhpn\b/i, 'Westchester (HPN)'],
  [/teterboro|\bteb\b/i, 'Teterboro (TEB)'],
];

/** "LaGuardia Airport · 94-00 Grand Central Pkwy, ..." -> "LaGuardia (LGA)"; "Omni Berkshire Place · ..." -> "Omni Berkshire Place". */
export function placeName(s) {
  const t = String(s || '').trim();
  if (!t || /^by the hour/i.test(t)) return '';
  for (const [rx, name] of AIRPORTS) if (rx.test(t)) return name;
  return t.split(' · ')[0].split(',')[0].trim();
}

const tripName = (t) => (/hour/i.test(t || '') ? 'By the hour' : t || 'Not recorded');

function top(values, n = 8) {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([label, count]) => ({ label, count }));
}

const LEAD = ['Same day', '1-2 days', '3-7 days', '8-30 days', '31+ days'];
const leadBucket = (days) => (days <= 0 ? 0 : days <= 2 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4);

/** rows: [{ values }] of the pricechecks workspace. */
export function priceCheckInsights(rows) {
  const v = rows.map((r) => r.values || {});
  const booked = v.filter((x) => x.booked && x.booked !== 'No').length;
  const economy = v.map((x) => Number(String(x.prices || '').match(/Economy \$(\d+)/)?.[1])).filter(Boolean).sort((a, b) => a - b);

  // one bar per day from the first price check to the last, empty days included
  const perDay = new Map();
  for (const x of v) {
    const d = isoDate(x.checkDate);
    if (d) perDay.set(d, (perDay.get(d) || 0) + 1);
  }
  const days = [];
  const sorted = [...perDay.keys()].sort();
  if (sorted.length) {
    for (let d = new Date(sorted[0]); isoDate(d) <= sorted.at(-1); d = new Date(d.getTime() + 86400000)) days.push({ date: isoDate(d), count: perDay.get(isoDate(d)) || 0 });
  }

  const hours = Array(24).fill(0);
  for (const x of v) {
    const h = Number(String(x.checkTime || '').match(/^(\d{1,2}):/)?.[1]);
    if (h >= 0 && h < 24) hours[h] += 1;
  }

  const lead = LEAD.map((label) => ({ label, count: 0 }));
  for (const x of v) {
    if (!x.checkDate || !x.rideDate) continue;
    const days = Math.round((new Date(x.rideDate) - new Date(x.checkDate)) / 86400000);
    if (days >= 0) lead[leadBucket(days)].count += 1;
  }

  return {
    total: v.length,
    booked,
    withPhone: v.filter((x) => x.phone).length,
    withEmail: v.filter((x) => x.email).length,
    medianEconomy: economy.length ? economy[Math.floor(economy.length / 2)] : null,
    days,
    hours,
    pickups: top(v.map((x) => placeName(x.pickup))),
    dropoffs: top(v.map((x) => placeName(x.dropoff))),
    // the airport a ride starts or ends at (a ride between two airports counts for the pickup one)
    airports: top(v.map((x) => [placeName(x.pickup), placeName(x.dropoff)].find((p) => AIRPORTS.some(([, name]) => name === p)) || 'No airport')),
    trips: top(v.map((x) => tripName(x.trip))),
    cars: top(v.map((x) => x.carPicked || 'None picked')),
    lead,
  };
}
