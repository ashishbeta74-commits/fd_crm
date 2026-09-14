// Mirrors server/src/linkedin.js (stages, groups, steps). Keep the two lists in sync.
import { zonedTodayUtc } from '@/lib/tz';

export const LI_GROUPS = [
  { key: 'warmup', label: 'Warm-Up', short: '1', description: 'Follow and engage before you connect' },
  { key: 'connect', label: 'Connect', short: '2', description: 'Request, accept, welcome, converse' },
  { key: 'convert', label: 'Convert', short: '3', description: 'Need, offer, trial ride, client' },
  { key: 'closed', label: 'Parked / Closed', short: '4', description: 'Nurture later or closed' },
];

export const LI_STAGES = [
  { key: 'identified', label: 'Identified', group: 'warmup', closed: false, step: 1 },
  { key: 'followed', label: 'Followed', group: 'warmup', closed: false, step: 2 },
  { key: 'engaged', label: 'Engaged With Content', group: 'warmup', closed: false, step: 3 },
  { key: 'request_sent', label: 'Request Sent', group: 'connect', closed: false, step: 4 },
  { key: 'connected', label: 'Connected', group: 'connect', closed: false, step: 5 },
  { key: 'welcome_sent', label: 'Welcome Sent', group: 'connect', closed: false, step: 6 },
  { key: 'in_conversation', label: 'In Conversation', group: 'connect', closed: false, step: 7 },
  { key: 'need_identified', label: 'Need Identified', group: 'convert', closed: false, step: 8 },
  { key: 'offer_sent', label: 'Offer Sent', group: 'convert', closed: false, step: 9 },
  { key: 'trial_booked', label: 'Trial Ride Booked', group: 'convert', closed: false, step: 10 },
  { key: 'client_won', label: 'Client Won', group: 'convert', closed: true, step: 11 },
  { key: 'nurture', label: 'Nurture - Not Now', group: 'closed', closed: false, override: true },
  { key: 'no_response', label: 'No Response', group: 'closed', closed: true, override: true },
  { key: 'not_fit', label: 'Not A Fit', group: 'closed', closed: true, override: true },
  { key: 'declined', label: 'Declined', group: 'closed', closed: true, override: true },
  { key: 'withdrew', label: 'Withdrew Request', group: 'closed', closed: true, override: true },
];
export const LI_STAGE_MAP = Object.fromEntries(LI_STAGES.map((s) => [s.key, s]));
export const liStageLabel = (key) => LI_STAGE_MAP[key]?.label || 'Identified';
export const liStage = (contact) => contact?.linkedin?.stage || 'identified';

// One hue per group; the shade deepens along the funnel so the pipeline reads as a progression.
export const LI_GROUP_STYLES = {
  warmup: { badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700', dot: 'bg-slate-400', bar: 'bg-slate-400' },
  connect: { badge: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900', dot: 'bg-sky-500', bar: 'bg-sky-500' },
  convert: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  closed: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700', dot: 'bg-zinc-400', bar: 'bg-zinc-400' },
};
export const liStageStyle = (key) => LI_GROUP_STYLES[LI_STAGE_MAP[key]?.group || 'warmup'];

export const LI_CONNECTION_STATUSES = [
  { key: 'not_sent', label: 'Not Sent Yet' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'ignored', label: 'Ignored' },
  { key: 'withdrawn', label: 'Withdrawn' },
  { key: 'already_connected', label: 'Already Connected' },
];
export const liConnectionLabel = (key) => LI_CONNECTION_STATUSES.find((c) => c.key === key)?.label || '';

// Manual work status (independent of the calculated stage). Missing = not started.
export const LI_STATUSES = [
  { key: 'not_started', label: 'Not started', dot: 'bg-slate-400', badge: 'text-muted-foreground' },
  { key: 'in_progress', label: 'In progress', dot: 'bg-sky-500', badge: 'text-sky-700 dark:text-sky-300' },
  { key: 'waiting', label: 'Waiting', dot: 'bg-amber-500', badge: 'text-amber-700 dark:text-amber-300' },
  { key: 'done', label: 'Done', dot: 'bg-emerald-500', badge: 'text-emerald-700 dark:text-emerald-300' },
];
export const LI_STATUS_MAP = Object.fromEntries(LI_STATUSES.map((s) => [s.key, s]));
export const liStatus = (contact) => contact?.linkedin?.status || 'not_started';

// The steps a user logs; `requires` = extra input asked for in the dialog; `field` = the date it writes (cleared by 'Remove').
export const LI_STEPS = [
  { key: 'followed', field: 'dateFollowed', label: 'Followed the profile', stage: 'followed' },
  { key: 'engaged', field: 'dateEngaged', label: 'Engaged with a post', stage: 'engaged' },
  { key: 'request_sent', field: 'requestSentAt', label: 'Sent connection request', stage: 'request_sent' },
  { key: 'accepted', field: 'acceptedAt', label: 'They accepted', stage: 'connected' },
  { key: 'welcome_sent', field: 'welcomeSentAt', label: 'Sent welcome message', stage: 'welcome_sent' },
  { key: 'replied', field: 'firstReplyAt', label: 'They replied', stage: 'in_conversation' },
  { key: 'need', field: 'needAt', label: 'Need identified', stage: 'need_identified', requires: 'need' },
  { key: 'offer_sent', field: 'offerSentAt', label: 'Sent the offer', stage: 'offer_sent' },
  { key: 'trial_booked', field: 'trialRideDate', label: 'Trial ride booked', stage: 'trial_booked', askDate: 'Trial ride date' },
  { key: 'client_won', field: 'convertedDate', label: 'Client won', stage: 'client_won', requires: 'monthlyValue' },
  { key: 'withdrawn', label: 'Withdrew the request', stage: 'withdrew' },
];

/** The next step the playbook expects for a contact's current stage (null when closed / won). */
export function nextStepFor(contact) {
  const stage = liStage(contact);
  const def = LI_STAGE_MAP[stage];
  if (!def || def.override || stage === 'client_won') return null;
  const order = ['followed', 'engaged', 'request_sent', 'accepted', 'welcome_sent', 'replied', 'need', 'offer_sent', 'trial_booked', 'client_won'];
  const idx = LI_STAGES.findIndex((s) => s.key === stage); // identified=0 -> next 'followed'
  return LI_STEPS.find((s) => s.key === order[idx]) || null;
}

/** Steps already logged on a contact (have a date), so they can be removed again. */
export const loggedSteps = (contact) => LI_STEPS.filter((s) => s.field && contact?.linkedin?.[s.field]);

/** PATCH body that removes one logged step: clears its date and any connection status it implied. */
export function removeStepInput(contact, step) {
  const li = contact?.linkedin || {};
  const input = { [step.field]: null };
  if (step.key === 'request_sent' && li.connectionStatus === 'pending') input.connectionStatus = '';
  if (step.key === 'accepted' && li.connectionStatus === 'accepted') input.connectionStatus = li.requestSentAt ? 'pending' : '';
  return input;
}

export const money = (n) => (n ? `$${Number(n).toLocaleString('en-US')}` : '');

/** Overdue / due-soon flag for the next action. */
export function actionFlag(contact, today = new Date()) {
  const li = contact?.linkedin || {};
  if (li.closed) return null;
  if (!li.nextActionDate) return li.active ? 'none' : null;
  const d = new Date(li.nextActionDate);
  const t0 = zonedTodayUtc(today); // "today" on the New York calendar
  if (d < t0) return 'overdue';
  if (d < new Date(t0.getTime() + 7 * 86400000)) return 'week';
  return 'later';
}
