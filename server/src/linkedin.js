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

export const LI_PLAYBOOK = [
  { step: 1, day: 'Day 0', stage: 'identified', title: 'Identified', do: 'Qualify the profile before you spend a single action on it. NYC / tri-state metro, and someone who either books cars or sits next to whoever does. Tag the persona and priority.', say: 'Nothing yet - this step is silent.', log: 'LinkedIn URL + Persona + Priority', watch: 'Volume for its own sake. Fifty right profiles beat five hundred random ones.' },
  { step: 2, day: 'Day 0', stage: 'followed', title: 'Followed', do: 'Follow, do not connect. Following is a low-friction signal that puts you in their feed and often shows up in their notifications without demanding anything back.', say: 'No message. Following is the message.', log: 'Date Followed', watch: 'Sending the connection request on the same day as the follow. Let them see you first.' },
  { step: 3, day: 'Day 1-4', stage: 'engaged', title: 'Engaged With Content', do: "Leave two or three genuine comments across a few days. Add a fact or a view, never 'Great post!'. If they post about a summit, a client event, a new office, that is your opening later.", say: 'The Midtown-to-Teterboro run at 4pm is brutal this month - we build in 40 minutes for clients flying private on Thursdays. Curious whether you have seen the same.', log: 'Date Engaged', watch: 'Commenting on five posts in one hour. Spread it over days so it reads as attention, not automation.' },
  { step: 4, day: 'Day 5', stage: 'request_sent', title: 'Request Sent', do: 'Now send the connection request with a short personal note. Reference the actual post you engaged with. No service pitch, no calendar link, no rate card.', say: 'Hi [Name] - your post on [specific thing] was the clearest take I have read on it. I run ground transport for executives across Manhattan and the Hamptons, so I follow how teams handle travel. Would like to stay connected.', log: 'Connection Request Sent + Connection Status = Pending', watch: 'Pitching inside the request. It is the single fastest way to get ignored or reported.' },
  { step: 5, day: 'Day 6-10', stage: 'connected', title: 'Connected', do: 'When they accept, set the status and the acceptance date. If nothing after 14 days, withdraw the request - it keeps your pending list clean and protects your acceptance rate.', say: 'No message on acceptance day. Wait a day.', log: 'Connection Status = Accepted + Date Accepted', watch: 'Messaging the second they accept. It reads as a bot.' },
  { step: 6, day: 'Day 7-11', stage: 'welcome_sent', title: 'Welcome Sent', do: 'One warm note the day after they accept. Say who you are in one line and ask a question about their world. Still no pitch.', say: 'Thanks for connecting, [Name]. I run Famous Drive - chauffeured cars for executives and events across NYC, Teterboro and out to the Hamptons. Out of curiosity, how does your team handle car service today: an app, a corporate account, or whoever is available that morning?', log: 'Welcome Message Sent', watch: 'Two paragraphs about your fleet. Ask, do not broadcast.' },
  { step: 7, day: 'Day 8-20', stage: 'in_conversation', title: 'In Conversation', do: 'They replied - this is the real start. Trade two or three messages. Be useful before you are commercial: traffic windows, event-week gridlock, which terminal actually saves twenty minutes.', say: 'That is the usual setup. The one thing that trips teams up during UNGA week is the East Side freeze - we pre-position cars west of Sixth. Happy to send the map we give clients if it is useful.', log: 'Date First Reply', watch: 'Jumping to price on their first reply. Earn a second one first.' },
  { step: 8, day: 'Day 12-25', stage: 'need_identified', title: 'Need Identified', do: 'Name the actual job to be done. Airport runs, roadshows, client dinners, Hamptons Fridays, a gala, a retainer. Log it - it drives what you send next and it is how you spot your best segment.', say: 'When your principals fly private out of Teterboro, who books the car on the ground side - you or the flight department?', log: 'Need / Use Case', watch: 'Guessing the need. If you cannot write it in the column, you have not asked yet.' },
  { step: 9, day: 'Day 15-30', stage: 'offer_sent', title: 'Offer Sent', do: 'Match the offer to the need. One page: the specific service, the vehicles, the chauffeur standard, and simple pricing. Corporate account terms if they book repeatedly.', say: 'Sending the one-pager for airport and roadshow coverage - sedans and Sprinters, chauffeurs vetted and in uniform, flight tracking so we adjust when the tail number moves. Corporate accounts get consolidated monthly billing.', log: 'Offer Sent', watch: 'A generic rate card. The offer should name the thing they told you in step 8.' },
  { step: 10, day: 'Day 20-40', stage: 'trial_booked', title: 'Trial Ride Booked', do: 'Ask for one ride, not a contract. A single flawless airport pickup closes better than any deck: on time, water, the right car, a chauffeur who does not need directions.', say: 'Rather than talk about it, let us just run one. Next airport pickup, put it on us - if it is not the smoothest one your principal has had this year, you have lost nothing.', log: 'Trial Ride Date', watch: 'Over-promising a vehicle you cannot guarantee that day. Confirm the car before you confirm the ride.' },
  { step: 11, day: 'Day 30+', stage: 'client_won', title: 'Client Won', do: 'They book again, or open an account. Record the date and a realistic monthly value so the dashboard shows what the channel is genuinely worth.', say: 'Glad it went well. I will set you up with an account so bookings go through one email and you get a single monthly invoice.', log: 'Converted Date + Est. Monthly Value', watch: 'Treating the first booking as the finish line. The account is the win, not the ride.' },
  { step: 12, day: 'Ongoing', stage: 'nurture', title: 'Nurture / Closed', do: 'Anyone not converting goes to Nurture with a next-action date 60-90 days out, or to a closed stage. A parked prospect with a date is an asset; one without is clutter.', say: 'Understood - timing is timing. I will check back before the autumn event season.', log: 'Outcome Override + Next Action + Next Action Date', watch: 'Leaving prospects in limbo. If it is not moving, park it with a date or close it.' },
];

export const LI_RULES = [
  'Daily target to start: follow 15-20 new profiles, leave 5-8 real comments, send 10-15 connection requests, and move 5 existing conversations forward. Two focused hours covers it.',
  "Stay well under LinkedIn's limits. Roughly 100 connection requests a week is a safe ceiling on a normal account; a pending list above 200 or an acceptance rate under 30% is a signal to slow down and write better notes.",
  'Withdraw requests older than 14 days. It protects your acceptance rate, which LinkedIn watches.',
  'Never paste the same message twice in a row. If two prospects could receive the identical note, it is not personal enough to send.',
  'Comment before you connect, and connect before you pitch. The order is the whole method - skipping a step is what turns outreach into spam.',
  'Sort your week by the action flag: clear Overdue first, then Due This Week.',
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
