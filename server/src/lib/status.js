// Turns free-text status values from spreadsheets ("Voicemail", "wrong number", "not in service",
// "busy said to call back", "Converted - paid") into a pipeline stage.
// Order matters: the first matching pattern wins.

const STAGE_PATTERNS = [
  ['future_booking', /future|booking|booked|appointment|schedul|reschedule|postpone/],
  ['converted', /convert|conversion|\bwon\b|closed\s*won|customer|client|\bsold\b|signed|paid|purchased|onboard/],
  ['done', /\bdone\b|complete|finished|\bclosed\b|delivered|archive/],
  ['ready', /\bready\b/],
  ['prospect', /prospect|interested|\bwarm\b|\bhot\b|qualified|potential|meeting\s*set|demo|quoted|quote\s*sent/],
  ['wrong_number', /wrong\s*(no|num|number)?\b|invalid\s*(no|num|number)?|faulty|disabled|not\s*in\s*service|out\s*of\s*service|disconnected|dead\s*(line|number)|(does\s*not|doesn'?t)\s*exist|number\s*not\s*valid|not\s*found|no\s*such\s*number|unallocated/],
  ['connected', /connected|spoke|talked|answered|reached|picked\s*up|in\s*conversation|call\s*done|had\s*a\s*call|discussed|said\s*to|call\s*back|callback|will\s*call|asked\s*to|requested|send\s*(email|mail|details|quote)/],
  ['voicemail', /voice\s*mail|\bvm\b|left\s*(a\s*)?(message|msg|voicemail)|no\s*answer|not\s*answer|unanswered|didn'?t\s*pick|no\s*pick|not\s*picking|ringing|\bbusy\b|switched\s*off|not\s*reachable|unreachable|no\s*response|no\s*reply/],
  ['started', /\bstart|\bcalled\b|attempt|contacted|in\s*progress|follow|trying|tried|next\s*week|not\s*needed|not\s*required|no\s*requirement|declined|refused|hung\s*up|hangup|do\s*not\s*call|\bdnc\b|not\s*relevant|no\s*thanks/],
  ['new', /\bnew\b|fresh|not\s*(yet\s*)?called|pending|\bopen\b|untouched|to\s*do|todo|not\s*started|uncontacted|to\s*contact/],
];

const clean = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function matchStage(text) {
  let s = clean(text);
  if (!s) return null;
  // "not interested" / "dont need" must not read as "interested" (prospect); they do mean the call happened (Started).
  const declined = /not\s*interested|no\s*need|don'?t\s*need|dont\s*need|do\s*not\s*need/.test(s);
  s = s.replace(/not\s*interested/g, ' ').replace(/no\s*need|don'?t\s*need|dont\s*need|do\s*not\s*need/g, ' ');
  for (const [key, rx] of STAGE_PATTERNS) if (rx.test(s)) return key;
  return declined ? 'started' : null;
}

const PRIORITY_PATTERNS = [
  ['urgent', /urgent|asap|critical|p0|\bp1\b|immediately|today|\btop\b|highest|hottest|!!/],
  ['high', /\bhigh\b|\bhot\b|important|\bp2\b|\ba\b|\b1\b|\bvip\b|\bkey\b|priority/],
  ['low', /\blow\b|\bcold\b|\bp4\b|\bc\b|\b3\b|\b4\b|later|someday|minor|whenever/],
  ['medium', /medium|\bmed\b|normal|\bp3\b|\bb\b|\b2\b|\bwarm\b|standard|regular/],
];

/** "High", "P1", "urgent", "A", "1" ... -> priority key or null. */
export function matchPriority(text) {
  const s = clean(text);
  if (!s) return null;
  for (const [key, rx] of PRIORITY_PATTERNS) if (rx.test(s)) return key;
  return null;
}

/** Split a "Tags" cell: "VIP, NJ; corporate | repeat" -> ['VIP', 'NJ', 'corporate', 'repeat']. */
export function splitTags(text) {
  return String(text ?? '')
    .split(/[,;|\n/]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** @returns {{ stage: string|null }} */
export function parseStatus(text) {
  return { stage: matchStage(text) };
}
