// Single source of truth for pipeline stages and importable contact fields.
// The client fetches this through GET /api/meta (and mirrors the stage list in
// client/src/lib/constants.js for instant rendering).

export const STAGES = [
  { key: 'new', label: 'New', description: 'Imported, not contacted yet' },
  { key: 'started', label: 'Started', description: 'Called at least once' },
  { key: 'connected', label: 'Connected', description: 'Spoke with the contact' },
  { key: 'voicemail', label: 'Voice Mail', description: 'Left a voicemail / no answer' },
  { key: 'wrong_number', label: 'Wrong Number', description: 'Number was wrong or out of service' },
  { key: 'prospect', label: 'Prospect', description: 'Showed interest' },
  { key: 'ready', label: 'Ready', description: 'Ready to convert' },
  { key: 'converted', label: 'Converted', description: 'Became a customer' },
  { key: 'done', label: 'Done', description: 'Completed / closed' },
  { key: 'future_booking', label: 'Future Booking', description: 'Booked for a later date and time' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || key || '';

export const ACTIVITY_TYPES = ['import', 'note', 'call', 'followup', 'stage', 'booking', 'edit', 'merge', 'reminder', 'email', 'linkedin'];

// Priority of a contact (and of a reminder). Higher rank = more urgent; '' = no priority set.
export const PRIORITIES = [
  { key: 'urgent', label: 'Urgent', rank: 4, description: 'Needs action today' },
  { key: 'high', label: 'High', rank: 3, description: 'Important - work on it this week' },
  { key: 'medium', label: 'Medium', rank: 2, description: 'Normal priority' },
  { key: 'low', label: 'Low', rank: 1, description: 'When there is time' },
];
export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);
export const priorityRank = (key) => PRIORITIES.find((p) => p.key === key)?.rank || 0;
export const priorityLabel = (key) => PRIORITIES.find((p) => p.key === key)?.label || '';

// Who the contact is (which kind of list they came from). '' = not set. Filterable on the contacts page;
// auto-detected on import from the list name and the job title, editable per contact or per list.
export const CATEGORIES = [
  { key: 'travel_advisor', label: 'Travel Advisor', short: 'TA', description: 'Travel advisors, agents and travel managers' },
  { key: 'executive_assistant', label: 'Executive Assistant', short: 'EA', description: 'Executive / personal assistants and office managers who book for others' },
  { key: 'other', label: 'Other', short: 'Other', description: 'Everyone else' },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label || '';

const EA_TITLE = /\b(executive|personal|administrative|admin|office|virtual|travel)\s+(assistant|asst|manager\s+to)\b|\bassistant\b|\b(ea|pa|chief of staff|office manager|receptionist|secretary)\b|\bassistant to\b/i;
const EA_LIST = /\bEA\b|\bE\.A\.|executive assist|exec assist|assistant/i;
const TA_TITLE = /\btravel\b|\badvisor\b|\bagent\b|\bconcierge\b|\btour\b|\bcruise\b|\bvacation\b|\bluxury\b|\bcurator\b/i;
const TA_LIST = /travel|advisor|agent|virtuoso|fora|tour|cruise|vacation/i;

/**
 * Best guess for a contact's type from where it came from and what they do. The job title wins when it
 * is clearly one or the other; else the list name decides ("Travel Advisors 2" -> TA, "US Open (EA)" -> EA).
 * Returns '' when nothing gives it away.
 */
export function guessCategory({ sheetName = '', title = '' } = {}) {
  const t = String(title || '');
  const s = String(sheetName || '');
  if (t && EA_TITLE.test(t)) return 'executive_assistant';
  if (t && TA_TITLE.test(t)) return 'travel_advisor';
  const ea = EA_LIST.test(s);
  const ta = TA_LIST.test(s);
  if (ea && !ta) return 'executive_assistant';
  if (ta && !ea) return 'travel_advisor';
  // A mixed list ("Travel & EA - …"): whichever the name puts last after the dash tends to be the tab's content.
  if (ea && ta) return /\bEA\b[^-]*$/i.test(s) ? 'executive_assistant' : 'travel_advisor';
  return '';
}

// Columns the CRM writes back into linked Google Sheets (two-way sync). They are ignored on import.
export const CRM_COLUMN_PREFIX = 'CRM ';
export const isCrmColumn = (header) => /^crm\s/i.test(String(header || '').trim());

// Plain text fields stored directly on the contact document.
export const TEXT_FIELDS = [
  'name',
  'email',
  'title',
  'companyName',
  'website',
  'primaryEmail',
  'secondaryEmail',
  'contactL1',
  'companyInfo',
  'companyNo',
  'contactMain',
  'location',
  'city',
  'state',
  'country',
  'status',
  'followUpNote',
  'notes',
];

// Text fields that may be fed by several spreadsheet columns (values are joined).
export const MULTI_FIELDS = { location: ', ', companyInfo: '\n', notes: '\n', followUpNote: ' / ' };

// Fields a spreadsheet column can be mapped to. `aliases` are alternative header names
// (case/punctuation-insensitive) used to auto-suggest the mapping. The naming follows the
// team's "Calling Sheet Format": Contact Full Name | Title | Company Name | Website |
// Primary Email | Contact LI Profile URL | Email 1 | Contact Phone 1 | Company Phone 1 |
// Date Of Calling | Status | Remarks | Follow Up 1 | Status | Follow Up 2 | Status.
export const FIELDS = [
  { key: 'name', label: 'Name', type: 'text', group: 'contact', aliases: ['full name', 'contact full name', 'contact name', 'contact person', 'person', 'customer name', 'client name', 'lead name', 'first name'] },
  { key: 'email', label: 'Email', type: 'email', group: 'contact', aliases: ['email 1', 'email1', 'email address', 'e mail', 'mail', 'email id', 'emailid', 'mail id', 'work email'] },
  { key: 'title', label: 'Title', type: 'text', group: 'contact', aliases: ['job title', 'designation', 'position', 'role', 'job'] },
  { key: 'companyName', label: 'Company Name', type: 'text', group: 'company', aliases: ['company', 'company name cleaned', 'organization', 'organisation', 'org', 'business', 'business name', 'firm', 'account', 'account name', 'employer'] },
  { key: 'website', label: 'Website', type: 'url', group: 'company', aliases: ['web', 'url', 'site', 'domain', 'company website', 'company website domain', 'web site', 'website url', 'link'] },
  { key: 'primaryEmail', label: 'Primary Email', type: 'email', group: 'contact', aliases: ['main email', 'first email', 'primary e mail', 'primary mail', 'official email', 'best email'] },
  { key: 'secondaryEmail', label: 'Second Email', type: 'email', group: 'contact', aliases: ['secondary email', 'email 2', 'email2', 'alt email', 'alternate email', 'alternative email', 'other email', 'second e mail', 'personal email', 'secondary mail'] },
  { key: 'contactL1', label: 'Contact LI (LinkedIn)', type: 'url', group: 'contact', aliases: ['contact li profile url', 'contact li profile', 'contact li', 'li profile url', 'li profile', 'li url', 'linkedin', 'linkedin url', 'linkedin profile', 'linkedin profile url', 'contact l1 info', 'contact l1', 'l1 info', 'l1', 'contact linkedin'] },
  { key: 'companyInfo', label: 'Company Info', type: 'textarea', group: 'company', multi: true, aliases: ['company information', 'company details', 'about company', 'company description', 'company industry', 'industry', 'description', 'about', '=company profile'] },
  { key: 'companyNo', label: 'Company No', type: 'phone', group: 'company', aliases: ['company phone 1', 'company phone', 'company number', 'company contact', 'company contact no', 'office phone', 'office number', 'office no', 'landline', 'company tel', 'board line', 'main line', 'hq phone'] },
  { key: 'contactMain', label: 'Contact Main', type: 'phone', group: 'contact', aliases: ['contact phone 1', 'contact phone', 'main contact', 'main number', 'main no', 'main phone', 'primary phone', 'primary contact', 'primary number', 'direct', 'direct number', 'direct line', 'direct phone', 'phone', 'phone number', 'phone 1', 'mobile', 'mobile number', 'mobile no', 'cell', 'cell phone', 'telephone', 'tel', 'contact number', 'contact no', 'main'] },
  // City / state / country are the filterable parts; `location` is the free-text line the sheets carry. Either fills the other on import.
  { key: 'city', label: 'City', type: 'text', group: 'company', aliases: ['company city', 'contact city', 'town', 'hq city', 'office city'] },
  { key: 'state', label: 'State', type: 'text', group: 'company', aliases: ['company state', 'contact state', 'province', 'region', 'state province', 'hq state'] },
  { key: 'country', label: 'Country', type: 'text', group: 'company', aliases: ['company country', 'contact country', 'nation', 'hq country'] },
  { key: 'location', label: 'Location', type: 'text', group: 'company', multi: true, aliases: ['contact location', 'company location', 'address', 'area', 'place', 'hq', 'headquarters', 'city state', 'city/state', 'location'] },
  { key: 'status', label: 'Status', type: 'text', group: 'pipeline', aliases: ['current status', 'lead status', 'call status', 'contact status', 'remark status', 'state of lead', 'status 1', 'outreach status'] },
  { key: 'calledOn', label: 'Date of calling (1st call)', type: 'date', group: 'pipeline', aliases: ['date of calling', 'calling date', 'call date', 'called on', 'date called', 'last contacted', 'last contact', 'contacted on', 'date of call', 'call 1 date'] },
  { key: 'followUp1', label: 'Follow-up 1 date', type: 'date', group: 'pipeline', aliases: ['follow up 1', 'followup 1', 'follow up 1 date', '1st follow up', 'first follow up', 'follow up date 1'] },
  { key: 'followUp1Status', label: 'Follow-up 1 status', type: 'text', group: 'pipeline', aliases: ['status 2', 'follow up 1 status', 'followup 1 status', 'status follow up 1', '1st follow up status'] },
  { key: 'followUp2', label: 'Follow-up 2 date', type: 'date', group: 'pipeline', aliases: ['follow up 2', 'followup 2', 'follow up 2 date', '2nd follow up', 'second follow up', 'follow up date 2'] },
  { key: 'followUp2Status', label: 'Follow-up 2 status', type: 'text', group: 'pipeline', aliases: ['status 3', 'follow up 2 status', 'followup 2 status', 'status follow up 2', '2nd follow up status'] },
  { key: 'followUp', label: 'Next follow-up', type: 'date', group: 'pipeline', aliases: ['follow up', 'followup', 'follow up date', 'followup date', 'next follow up', 'next followup', 'next action', 'follow up on', 'f u', 'fu', 'next call', 'callback date', 'call back date', 'reminder', 'follow up due'] },
  // `multi`: a sheet may carry both a "Stage" and a "Started" (call result) column; the importer keeps the stronger one.
  { key: 'stage', label: 'Stage', type: 'enum', group: 'pipeline', multi: true, aliases: ['pipeline', 'pipeline stage', 'funnel', 'funnel stage', 'progress', 'phase', 'lead stage', 'started', 'call outcome', 'outcome', 'call result', 'result', 'response', 'call response', 'contacted', 'call'] },
  { key: 'bookingDate', label: 'Booking Date', type: 'date', group: 'pipeline', aliases: ['=date', 'booking', 'appointment date', 'appointment', 'meeting date', 'meeting', 'booked date', 'booked on', 'schedule date', 'scheduled', 'scheduled date', 'demo date', 'event date'] },
  { key: 'bookingTime', label: 'Booking Time', type: 'time', group: 'pipeline', aliases: ['=time', 'appointment time', 'meeting time', 'booked time', 'slot', 'time slot', 'schedule time', 'scheduled time', 'demo time'] },
  { key: 'priority', label: 'Priority', type: 'enum', group: 'pipeline', aliases: ['pri', 'prio', 'importance', 'urgency', 'lead priority', 'contact priority'] },
  { key: 'tags', label: 'Tags', type: 'text', group: 'pipeline', multi: true, aliases: ['tag', 'labels', 'label', 'category', 'categories', 'segment', 'list type', 'lead type'] },
  { key: 'notes', label: 'Notes', type: 'textarea', group: 'pipeline', multi: true, aliases: ['note', 'comments', 'comment', 'remarks', 'remark', 'feedback', 'details', 'observation', 'summary', 'next action'] },
];
export const FIELD_KEYS = FIELDS.map((f) => f.key);
export const fieldLabel = (key) => FIELDS.find((f) => f.key === key)?.label || key;
export const isMultiField = (key) => Boolean(FIELDS.find((f) => f.key === key)?.multi);
