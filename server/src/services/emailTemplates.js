// Email templates: merge fields, rendering against a contact, and the built-in set that is seeded
// on first start (a chauffeur company writing to travel advisors / executive assistants).
import { EmailTemplate } from '../models/EmailTemplate.js';
import { isoDate } from '../lib/dates.js';

export const SENDER = () => ({
  name: (process.env.SENDER_NAME || '').trim(),
  phone: (process.env.SENDER_PHONE || '').trim(),
  company: (process.env.COMPANY_NAME || 'Famous Drive NYC').trim(),
});

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const longDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const time12 = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t || '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Every {{field}} a template may use, with a description for the editor. */
export const MERGE_FIELDS = [
  { key: 'firstName', label: 'First name', get: (c) => firstName(c.name) },
  { key: 'name', label: 'Full name', get: (c) => c.name || '' },
  { key: 'company', label: 'Contact company', get: (c) => c.companyName || '' },
  { key: 'title', label: 'Job title', get: (c) => c.title || '' },
  { key: 'email', label: 'Email', get: (c) => c.email || c.primaryEmail || c.secondaryEmail || '' },
  { key: 'phone', label: 'Phone', get: (c) => c.contactMain || c.companyNo || '' },
  { key: 'location', label: 'Location', get: (c) => c.location || '' },
  { key: 'followUpDate', label: 'Follow-up date', get: (c) => longDate(c.followUp) },
  { key: 'bookingDate', label: 'Booking date', get: (c) => longDate(c.booking?.date) },
  { key: 'bookingTime', label: 'Booking time', get: (c) => time12(c.booking?.time) },
  { key: 'bookingNote', label: 'Booking note', get: (c) => c.booking?.note || '' },
  { key: 'senderName', label: 'Your name (SENDER_NAME)', get: () => SENDER().name },
  { key: 'senderPhone', label: 'Your phone (SENDER_PHONE)', get: () => SENDER().phone },
  { key: 'companyName', label: 'Your company (COMPANY_NAME)', get: () => SENDER().company },
  { key: 'today', label: "Today's date", get: () => longDate(isoDate(new Date())) },
];

const FIELD_BY_KEY = new Map(MERGE_FIELDS.map((f) => [f.key.toLowerCase(), f]));

/**
 * Replace {{field}} placeholders (case-insensitive, spaces allowed) with the contact's values.
 * Returns the text plus the fields that had no value, so the UI can warn before sending.
 */
export function renderText(text, contact = {}, overrides = {}) {
  const missing = new Set();
  const out = String(text || '').replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, key) => {
    const k = key.toLowerCase();
    if (overrides[key] !== undefined) return overrides[key];
    const f = FIELD_BY_KEY.get(k);
    if (!f) return m; // unknown placeholder stays visible
    const v = f.get(contact) || '';
    if (!v) missing.add(f.key);
    return v;
  });
  return { text: out, missing: [...missing] };
}

export function renderTemplate({ subject, body }, contact, overrides) {
  const s = renderText(subject, contact, overrides);
  const b = renderText(body, contact, overrides);
  return { subject: s.text, body: b.text, missing: [...new Set([...s.missing, ...b.missing])] };
}

const SIGN = '\n\nBest regards,\n{{senderName}}\n{{companyName}}\n{{senderPhone}}';

export const DEFAULT_TEMPLATES = [
  {
    builtInKey: 'intro-advisor',
    name: 'Intro - travel advisors',
    category: 'outreach',
    subject: 'Chauffeur partner for your {{company}} clients in New York',
    body:
      "Hi {{firstName}},\n\nI'm {{senderName}} with {{companyName}}, a chauffeured car service based in New York City. We work with travel advisors who need a reliable partner for airport transfers, hourly city service and out-of-town runs for their clients.\n\nWhat advisors like about working with us:\n- Flight tracking and meet-and-greet at JFK, LGA, EWR and Teterboro\n- Late-model sedans, SUVs and Sprinters, always immaculate\n- One point of contact and monthly billing for agencies\n\nWould you be open to a quick call this week? I'd be glad to set up an agency rate for {{company}}." +
      SIGN,
  },
  {
    builtInKey: 'intro-ea',
    name: 'Intro - executive assistants',
    category: 'outreach',
    subject: 'Reliable chauffeur service for your executives',
    body:
      "Hi {{firstName}},\n\nI'm {{senderName}} from {{companyName}}. We provide chauffeured transportation in and around New York for executives and their guests: airport pickups with flight tracking, meetings across the city, roadshows and dinners.\n\nAssistants rely on us because every booking is confirmed in writing, the driver's details arrive ahead of time, and you can reach a real person 24/7.\n\nIf it would help to have a dependable car service on file for {{company}}, I'd be happy to send our corporate rates or arrange a trial ride." +
      SIGN,
  },
  {
    builtInKey: 'after-voicemail',
    name: 'After voicemail',
    category: 'follow-up',
    subject: 'Following up on my call - {{companyName}}',
    body:
      "Hi {{firstName}},\n\nI left you a voicemail earlier and wanted to follow up by email. I'm {{senderName}} with {{companyName}}, a chauffeured car service in New York.\n\nWe help teams like {{company}} with airport transfers, hourly service and event transportation, with flight tracking, professional drivers and simple monthly billing.\n\nIs there a good time for a short call, or may I send over our rates?" +
      SIGN,
  },
  {
    builtInKey: 'quote-follow-up',
    name: 'Quote follow-up',
    category: 'follow-up',
    subject: 'Your chauffeur quote from {{companyName}}',
    body:
      "Hi {{firstName}},\n\nThank you for speaking with me. As discussed, I've attached our rates for {{company}}. The quote is valid for 30 days and includes tolls, gratuity and waiting time as noted.\n\nIf you'd like to adjust the vehicle type or add stops, just reply here and I'll update it the same day.\n\nLooking forward to driving your clients." +
      SIGN,
  },
  {
    builtInKey: 'booking-confirmation',
    name: 'Booking confirmation',
    category: 'booking',
    subject: 'Confirmed: your chauffeur on {{bookingDate}} at {{bookingTime}}',
    body:
      "Hi {{firstName}},\n\nYour booking with {{companyName}} is confirmed.\n\nDate: {{bookingDate}}\nTime: {{bookingTime}}\nDetails: {{bookingNote}}\n\nYour chauffeur's name and phone number will be sent the day before. If anything changes, reply to this email or call {{senderPhone}} any time." +
      SIGN,
  },
  {
    builtInKey: 'day-before',
    name: 'Day-before reminder',
    category: 'booking',
    subject: 'Reminder: chauffeur tomorrow at {{bookingTime}}',
    body:
      "Hi {{firstName}},\n\nA quick reminder that your chauffeur from {{companyName}} is scheduled for {{bookingDate}} at {{bookingTime}}.\n\n{{bookingNote}}\n\nThe driver will text you on arrival. For any last-minute changes call {{senderPhone}}." +
      SIGN,
  },
  {
    builtInKey: 'thank-you',
    name: 'Thank you after the ride',
    category: 'booking',
    subject: 'Thank you for riding with {{companyName}}',
    body:
      "Hi {{firstName}},\n\nThank you for choosing {{companyName}}. I hope everything went smoothly.\n\nIf you have a moment, I'd love to hear how the ride was - and if there's anything we could do better. We're here whenever you or your clients need a car in New York." +
      SIGN,
  },
  {
    builtInKey: 're-engage',
    name: 'Re-engagement',
    category: 'follow-up',
    subject: 'Still here when {{company}} needs a car',
    body:
      "Hi {{firstName}},\n\nIt's been a while since we last spoke, so I wanted to check in. {{companyName}} is still here for airport transfers, hourly city service and events across New York, and we've added new SUVs and Sprinters to the fleet this year.\n\nIf a trip is coming up for {{company}}, I'd be glad to send a quote." +
      SIGN,
  },
];

/** Insert the built-in templates that are not in the database yet (by builtInKey). Returns how many were added. */
export async function seedTemplates({ force = false } = {}) {
  const existing = new Set((await EmailTemplate.find().select('builtInKey').lean()).map((t) => t.builtInKey).filter(Boolean));
  const any = await EmailTemplate.countDocuments();
  // First start: seed everything. Later: only on an explicit "restore" (force), so deleted built-ins stay deleted.
  if (any && !force) return 0;
  let added = 0;
  for (const [i, t] of DEFAULT_TEMPLATES.entries()) {
    if (existing.has(t.builtInKey)) continue;
    await EmailTemplate.updateOne({ name: t.name }, { $setOnInsert: { ...t, builtIn: true, order: i } }, { upsert: true, collation: { locale: 'en', strength: 2 } });
    added += 1;
  }
  return added;
}
