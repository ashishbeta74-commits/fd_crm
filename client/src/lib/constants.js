// Mirrors server/src/fields.js (stages). Keep the two lists in sync.

export const STAGES = [
  { key: 'new', label: 'New', description: 'Imported, not contacted yet' },
  { key: 'started', label: 'Started', description: 'Called at least once' },
  { key: 'connected', label: 'Connected', description: 'Spoke with the contact' },
  { key: 'voicemail', label: 'Voice Mail', description: 'Left a voicemail / no answer' },
  { key: 'wrong_number', label: 'Wrong Number', description: 'Number was wrong or out of service' },
  { key: 'hung_up', label: 'Hung Up', description: 'Picked up and hung up / cut the call' },
  { key: 'not_interested', label: 'Not Interested', description: 'Spoke, but they do not need the service' },
  { key: 'prospect', label: 'Prospect', description: 'Showed interest' },
  { key: 'ready', label: 'Ready', description: 'Ready to convert' },
  { key: 'converted', label: 'Converted', description: 'Became a customer' },
  { key: 'done', label: 'Done', description: 'Completed / closed' },
  { key: 'future_booking', label: 'Future Booking', description: 'Booked for a later date and time' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const stageLabel = (key) => STAGE_MAP[key]?.label || key || '';

// Mirrors PRIORITIES in server/src/fields.js. '' = no priority.
export const PRIORITIES = [
  { key: 'urgent', label: 'Urgent', rank: 4, description: 'Needs action today' },
  { key: 'high', label: 'High', rank: 3, description: 'Important - work on it this week' },
  { key: 'medium', label: 'Medium', rank: 2, description: 'Normal priority' },
  { key: 'low', label: 'Low', rank: 1, description: 'When there is time' },
];
export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);
export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));
export const priorityLabel = (key) => PRIORITY_MAP[key]?.label || '';
export const priorityRank = (key) => PRIORITY_MAP[key]?.rank || 0;

// Lead quality presets (mirrors LEAD_QUALITIES in server/src/fields.js). Free text on the contact, so "Other…" lets the team name their own.
export const LEAD_QUALITIES = ['Money minded', 'Cheap rate', 'Services'];
export const LEAD_QUALITY_STYLES = {
  'money minded': { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900', dot: 'bg-emerald-500' },
  'cheap rate': { badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900', dot: 'bg-amber-500' },
  services: { badge: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900', dot: 'bg-sky-500' },
};
export const LEAD_QUALITY_OTHER = { badge: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900', dot: 'bg-violet-500' };
export const leadQualityStyle = (v) => LEAD_QUALITY_STYLES[String(v || '').toLowerCase()] || LEAD_QUALITY_OTHER;

// How a follow-up was done (activity `channel` on the server).
export const FOLLOW_UP_CHANNELS = [
  { key: 'call', label: 'Call', description: 'Phoned them' },
  { key: 'message', label: 'Message', description: 'Text / WhatsApp / LinkedIn message' },
  { key: 'email', label: 'Email', description: 'Sent an email' },
];

// Mirrors CATEGORIES in server/src/fields.js. Who the contact is; '' = not set.
export const CATEGORIES = [
  { key: 'travel_advisor', label: 'Travel Advisor', short: 'TA', description: 'Travel advisors, agents and travel managers' },
  { key: 'executive_assistant', label: 'Executive Assistant', short: 'EA', description: 'Executive / personal assistants and office managers who book for others' },
  { key: 'other', label: 'Other', short: 'Other', description: 'Everyone else' },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const categoryLabel = (key) => CATEGORY_MAP[key]?.label || '';

export const CATEGORY_STYLES = {
  travel_advisor: { badge: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-900', dot: 'bg-cyan-500' },
  executive_assistant: { badge: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-200 dark:border-fuchsia-900', dot: 'bg-fuchsia-500' },
  other: { badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', dot: 'bg-slate-400' },
};

export const PRIORITY_STYLES = {
  urgent: { badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900', dot: 'bg-red-500' },
  high: { badge: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-900', dot: 'bg-orange-500' },
  medium: { badge: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900', dot: 'bg-blue-500' },
  low: { badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', dot: 'bg-slate-400' },
};

// Tailwind classes for badges / kanban headers (light + dark).
export const STAGE_STYLES = {
  new: { badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700', dot: 'bg-slate-400' },
  started: { badge: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900', dot: 'bg-sky-500' },
  connected: { badge: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-900', dot: 'bg-teal-500' },
  voicemail: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-900', dot: 'bg-yellow-500' },
  wrong_number: { badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900', dot: 'bg-red-500' },
  hung_up: { badge: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-900', dot: 'bg-orange-500' },
  not_interested: { badge: 'bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700', dot: 'bg-stone-500' },
  prospect: { badge: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900', dot: 'bg-violet-500' },
  ready: { badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900', dot: 'bg-amber-500' },
  converted: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900', dot: 'bg-emerald-500' },
  done: { badge: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-900', dot: 'bg-green-600' },
  future_booking: { badge: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-950 dark:text-pink-200 dark:border-pink-900', dot: 'bg-pink-500' },
};

// Editable text fields on a contact, grouped for forms.
export const CONTACT_FIELD_GROUPS = [
  {
    title: 'Contact',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'primaryEmail', label: 'Primary Email', type: 'email' },
      { key: 'secondaryEmail', label: 'Second Email', type: 'email' },
      { key: 'contactMain', label: 'Contact Main', type: 'tel' },
      { key: 'contactL1', label: 'Contact LI (LinkedIn)', type: 'url' },
    ],
  },
  {
    title: 'Company',
    fields: [
      { key: 'companyName', label: 'Company Name', type: 'text' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'companyNo', label: 'Company No', type: 'tel' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'state', label: 'State', type: 'text' },
      { key: 'country', label: 'Country', type: 'text' },
      { key: 'location', label: 'Location (as shown)', type: 'text', hint: 'Filled from city / state / country when left empty' },
      { key: 'companyInfo', label: 'Company Info', type: 'textarea' },
    ],
  },
];
