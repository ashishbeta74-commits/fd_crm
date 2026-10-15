// The LinkedIn outreach CRM: a second pipeline on the same contacts, modelled on the team's
// "FamousDrive_LinkedIn_Dashboard.xlsx" workbook (Playbook + Lists tabs). The stage is calculated
// from the dates logged, like the workbook's "Current Stage" column; an outcome override parks or
// closes a prospect.

export const LI_GROUPS = [
  { key: 'warmup', label: '1 Warm-Up' },
  { key: 'connect', label: '2 Connect' },
  { key: 'convert', label: '3 Convert' },
  { key: 'closed', label: '4 Closed' },
];

// Funnel order matters: a prospect's stage is the furthest step with a date logged.
export const LI_STAGES = [
  { key: 'identified', label: 'Identified', group: 'warmup', closed: false, description: 'On your list, nothing done yet', step: 1, day: 'Day 0' },
  { key: 'followed', label: 'Followed', group: 'warmup', closed: false, description: 'You followed them; no engagement yet', step: 2, day: 'Day 0', dateField: 'dateFollowed' },
  { key: 'engaged', label: 'Engaged With Content', group: 'warmup', closed: false, description: 'You have liked / commented on their posts', step: 3, day: 'Day 1-4', dateField: 'dateEngaged' },
  { key: 'request_sent', label: 'Request Sent', group: 'connect', closed: false, description: 'Connection request pending', step: 4, day: 'Day 5', dateField: 'requestSentAt' },
  { key: 'connected', label: 'Connected', group: 'connect', closed: false, description: 'They accepted', step: 5, day: 'Day 6-10', dateField: 'acceptedAt' },
  { key: 'welcome_sent', label: 'Welcome Sent', group: 'connect', closed: false, description: 'Thank-you note sent, no pitch yet', step: 6, day: 'Day 7-11', dateField: 'welcomeSentAt' },
  { key: 'in_conversation', label: 'In Conversation', group: 'connect', closed: false, description: 'They replied - a real thread is open', step: 7, day: 'Day 8-20', dateField: 'firstReplyAt' },
  { key: 'need_identified', label: 'Need Identified', group: 'convert', closed: false, description: 'You know what transport they actually buy', step: 8, day: 'Day 12-25', dateField: 'needAt' },
  { key: 'offer_sent', label: 'Offer Sent', group: 'convert', closed: false, description: 'Rate card or corporate account proposal sent', step: 9, day: 'Day 15-30', dateField: 'offerSentAt' },
  { key: 'trial_booked', label: 'Trial Ride Booked', group: 'convert', closed: false, description: 'First ride on the calendar', step: 10, day: 'Day 20-40', dateField: 'trialRideDate' },
  { key: 'client_won', label: 'Client Won', group: 'convert', closed: true, description: 'Booked and billing - counts as converted', step: 11, day: 'Day 30+', dateField: 'convertedDate' },
  // exits (set through the outcome override)
  { key: 'nurture', label: 'Nurture - Not Now', group: 'closed', closed: false, description: 'Right person, wrong timing - revisit later', override: true },
  { key: 'no_response', label: 'No Response', group: 'closed', closed: true, description: 'Ghosted after several touches', override: true },
  { key: 'not_fit', label: 'Not A Fit', group: 'closed', closed: true, description: 'Outside the service area or budget', override: true },
  { key: 'declined', label: 'Declined', group: 'closed', closed: true, description: 'Said no explicitly', override: true },
  { key: 'withdrew', label: 'Withdrew Request', group: 'closed', closed: true, description: 'You pulled the connection request back', override: true },
];
export const LI_STAGE_KEYS = LI_STAGES.map((s) => s.key);
export const LI_FUNNEL = LI_STAGES.filter((s) => !s.override);
export const LI_OVERRIDES = LI_STAGES.filter((s) => s.override);
export const liStage = (key) => LI_STAGES.find((s) => s.key === key) || LI_STAGES[0];
export const liStageLabel = (key) => liStage(key).label;

export const LI_PERSONAS = [
  'Executive Assistant / Chief of Staff',
  'Founder / CEO / Managing Partner',
  'Private Equity / Hedge Fund Ops',
  'Event Planner / Producer',
  'Hotel Concierge / GM',
  'Luxury Travel Advisor',
  'Private Aviation / FBO Broker',
  'Corporate Travel Manager',
  'Entertainment / Production Manager',
  'Wedding Planner',
  'Family Office Manager',
  'Real Estate / Brokerage Principal',
];

export const LI_NEEDS = [
  'Airport Transfers (JFK / EWR / LGA)',
  'Teterboro / Private Aviation Runs',
  'Executive Roadshows',
  'Client Hosting & Dinners',
  'Hamptons Weekend Runs',
  'Galas & Black-Tie Events',
  'Conference & Summit Transport',
  'Wedding Party Transport',
  'Production / Crew Transport',
  'Daily Executive Chauffeur (Retainer)',
  'Out-of-Town Guest Transport',
  'Roadshow + Multi-Car Fleet',
];

export const LI_NEXT_ACTIONS = [
  'Follow the profile',
  'Like / comment on a post',
  'Send connection request',
  'Send welcome message',
  'Send value message',
  'Ask the qualifying question',
  'Send rate card',
  'Offer complimentary first ride',
  'Propose corporate account',
  'Confirm trial booking',
  'Check in (nurture)',
  'Move to closed',
];

export const LI_CONNECTION_STATUSES = [
  { key: 'not_sent', label: 'Not Sent Yet' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'ignored', label: 'Ignored' },
  { key: 'withdrawn', label: 'Withdrawn' },
  { key: 'already_connected', label: 'Already Connected' },
];
export const LI_CONNECTION_KEYS = LI_CONNECTION_STATUSES.map((c) => c.key);

export const LI_VALUE_BANDS = [1000, 2500, 5000, 10000, 25000, 50000];

// Manual work status of a prospect, independent of the calculated stage.
export const LI_STATUSES = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
];
export const LI_STATUS_KEYS = LI_STATUSES.map((s) => s.key);
export const liStatusLabel = (key) => LI_STATUSES.find((s) => s.key === key)?.label || 'Not started';

// The steps a user "logs" from the UI and what each one records + suggests next (days from the workbook's Playbook).
export const LI_STEPS = [
  { key: 'followed', label: 'Followed the profile', sets: { dateFollowed: 'date' }, next: { action: 'Like / comment on a post', inDays: 2 } },
  { key: 'engaged', label: 'Engaged with a post', sets: { dateEngaged: 'date' }, next: { action: 'Send connection request', inDays: 3 } },
  { key: 'request_sent', label: 'Sent connection request', sets: { requestSentAt: 'date', connectionStatus: 'pending' }, next: { action: 'Check acceptance / withdraw after 14 days', inDays: 14 } },
  { key: 'accepted', label: 'They accepted', sets: { acceptedAt: 'date', connectionStatus: 'accepted' }, next: { action: 'Send welcome message', inDays: 1 } },
  { key: 'welcome_sent', label: 'Sent welcome message', sets: { welcomeSentAt: 'date' }, next: { action: 'Ask the qualifying question', inDays: 4 } },
  { key: 'replied', label: 'They replied', sets: { firstReplyAt: 'date' }, next: { action: 'Send value message', inDays: 2 } },
  { key: 'need', label: 'Need identified', sets: { needAt: 'date' }, requires: 'need', next: { action: 'Send rate card', inDays: 3 } },
  { key: 'offer_sent', label: 'Sent the offer', sets: { offerSentAt: 'date' }, next: { action: 'Offer complimentary first ride', inDays: 5 } },
  { key: 'trial_booked', label: 'Trial ride booked', sets: { trialRideDate: 'date' }, next: { action: 'Confirm trial booking', inDays: 0 } },
  { key: 'client_won', label: 'Client won', sets: { convertedDate: 'date' }, requires: 'monthlyValue', next: { action: 'Check in (nurture)', inDays: 30 } },
  { key: 'withdrawn', label: 'Withdrew the request', sets: { connectionStatus: 'withdrawn', outcomeOverride: 'withdrew' }, next: null },
];

// "Famous_Drive_LinkedIn_Outreach_Playbook.docx": seven stages to a 10-15 minute meeting with the Director of
// Operations. Each stage has one or more messages to copy; `stage` only picks the card colour (its group).
export const LI_MEETING_LINK = 'https://calendar.app.google/qipcRzb4BpTRXict7';

export const LI_PLAYBOOK = [
  {
    step: 1,
    stage: 'request_sent',
    title: 'Send the connection request',
    messages: [{ label: 'Connection note', text: "Hi [Name], Famous Drive supports concierge teams with VIP airport transfers, dedicated coordination and worldwide chauffeur service. I'd be pleased to connect." }],
  },
  {
    step: 2,
    stage: 'connected',
    title: 'Introduce the partnership after acceptance',
    messages: [
      {
        label: 'Introduction and meeting invitation',
        text: "Thank you for connecting, [Name]. Famous Drive offers 10-15% commission on the base fare of every ride you book, with tiers based on volume.\n\nWe'd be delighted to assist with your clients' upcoming itineraries in New York and major cities worldwide. Would you be open to a 10-15-minute introduction with our Director of Operations to explore the partnership?",
      },
    ],
  },
  {
    step: 3,
    stage: 'welcome_sent',
    title: 'Follow up if there is no response',
    messages: [
      { label: 'First follow up after three business days', text: 'Hi [Name], the introduction would cover partner commissions, worldwide coverage and how our 24/7 team handles last-minute changes. Would a brief conversation next week be convenient?' },
      {
        label: 'Final follow up another five to seven business days later',
        text: `Hi [Name], I'll leave this with you for now. If exploring a chauffeur partnership becomes relevant, I'd be happy to arrange a brief introduction with our Director of Operations.\n\nSchedule a Quick Meeting: ${LI_MEETING_LINK}`,
        note: 'Stop outreach after this if they remain silent.',
      },
    ],
  },
  {
    step: 4,
    stage: 'in_conversation',
    title: 'Secure a specific time after a positive reply',
    note: "Offer times your Director can attend and use the prospect's time zone.",
    messages: [
      { label: 'Offer two available times', text: 'Thank you, [Name]. Would [Day, Date, Time] or [Day, Date, Time] work for a 10-15-minute call? Both are in [Time Zone].' },
      { label: 'Once they choose', text: "Perfect. What's the best email address for the calendar invitation? Is there anything specific you'd like our Director of Operations to cover?" },
    ],
  },
  {
    step: 5,
    stage: 'need_identified',
    title: 'Respond to hesitation or a decline',
    note: "Choose the reply that matches the prospect's response. Answer their question before inviting the meeting.",
    messages: [
      { label: 'Send me information', text: "Certainly, [Name]. We provide airport and FBO transfers, VIP chauffeur services and group transportation worldwide, with dedicated support and partner commissions. I'll send a brief overview. Would you also welcome a short introduction after reviewing it?" },
      { label: 'We already have a provider', text: "Understood, [Name]. Would an additional partner be useful when your regular provider is unavailable or you need another destination covered? Our Director of Operations could explain how we'd support those situations in a brief call." },
      { label: 'I am busy or not right now', text: 'Of course, [Name]. Would you prefer that I reconnect in a couple of weeks, or is there a better month for a brief introduction?', note: 'Follow their requested timing.' },
      { label: 'How does the commission work', text: 'Our standard commission is 10% of the base fare, increasing up to 15% based on booking volume. Would you welcome a 10-15-minute call with our Director of Operations to discuss the terms and support available?' },
      { label: 'Service and reliability matter more than commission', text: "Absolutely, [Name]. Your clients' experience reflects on your recommendation. Our Director of Operations can walk you through flight monitoring, chauffeur coordination and handling schedule changes. Would that be a useful 10-15-minute conversation?" },
      { label: 'I am not the right person', text: "Thank you for clarifying, [Name]. Who would be the best colleague to speak with about ground transportation partnerships? I'd appreciate an introduction or their name." },
      { label: 'Not interested or please stop contacting me', text: "Thank you for letting me know, [Name]. I appreciate your time and won't follow up further.", note: 'Record the decline or removal request and stop outreach.' },
    ],
  },
  {
    step: 6,
    stage: 'offer_sent',
    title: 'Confirm the meeting',
    note: 'Send this after the calendar invitation has been issued.',
    messages: [{ label: 'Meeting confirmation', text: "Confirmed, [Name]: [Date] at [Time, Time Zone] for 10-15 minutes with our Director of Operations. The invitation has been sent to [Email]. We'll discuss your requirements, service coordination and partnership terms." }],
  },
  {
    step: 7,
    stage: 'trial_booked',
    title: 'Manage reminders and meeting changes',
    messages: [
      { label: 'Reminder on the meeting day', text: 'Hi [Name], looking forward to our introduction today at [Time, Time Zone]. Our Director of Operations will join you using the link in your calendar invitation.' },
      { label: 'If they request a different time', text: "Of course, [Name]. Would [Option 1] or [Option 2, Time Zone] be more convenient? I'll update the invitation once you confirm." },
      { label: 'If they miss the meeting', text: 'Hi [Name], we missed connecting today. Would you like to reschedule for [Option 1] or [Option 2, Time Zone], or would a later date be better?' },
    ],
  },
];

export const LI_RULES = [
  "Use the appropriate message for the prospect's latest response. Once they reply, stop the timed follow-ups and continue the conversation.",
  'Replace all bracketed fields before sending.',
  'Track the outcome: Awaiting acceptance; Connected; Replied; Follow up later; Meeting scheduled; Meeting held; Declined. Record the next action and date for each contact.',
  'Once a meeting is scheduled, stop prospecting messages and send only relevant meeting coordination.',
];

const OVERRIDE_TO_STAGE = { nurture: 'nurture', no_response: 'no_response', not_fit: 'not_fit', declined: 'declined', withdrew: 'withdrew' };
export const LI_OVERRIDE_KEYS = Object.keys(OVERRIDE_TO_STAGE);

/**
 * Current stage from the dates logged (furthest funnel step wins), unless an outcome override
 * parks / closes the prospect. Mirrors the workbook's calculated "Current Stage".
 */
export function computeLinkedinStage(li = {}) {
  if (li.outcomeOverride && OVERRIDE_TO_STAGE[li.outcomeOverride]) return OVERRIDE_TO_STAGE[li.outcomeOverride];
  if (li.connectionStatus === 'withdrawn') return 'withdrew';
  let stage = 'identified';
  for (const s of LI_FUNNEL) {
    if (!s.dateField) continue;
    if (s.key === 'connected' && !li.acceptedAt && (li.connectionStatus === 'accepted' || li.connectionStatus === 'already_connected')) {
      stage = s.key;
      continue;
    }
    if (li[s.dateField]) stage = s.key;
  }
  return stage;
}

/** Number of dated touches logged (the workbook's "Touchpoints"). */
export function countTouchpoints(li = {}) {
  return ['dateFollowed', 'dateEngaged', 'requestSentAt', 'acceptedAt', 'welcomeSentAt', 'firstReplyAt', 'needAt', 'offerSentAt', 'trialRideDate', 'convertedDate'].filter((k) => li[k]).length;
}

export function lastTouch(li = {}) {
  const dates = ['dateFollowed', 'dateEngaged', 'requestSentAt', 'acceptedAt', 'welcomeSentAt', 'firstReplyAt', 'needAt', 'offerSentAt', 'trialRideDate', 'convertedDate']
    .map((k) => li[k])
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  return dates.length ? new Date(Math.max(...dates)) : null;
}
