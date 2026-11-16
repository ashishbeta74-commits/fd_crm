// What is due across the CRM, for the bell and the morning push: one line per area with a count and
// the page (pre-filtered) that lists those rows. Areas with nothing due are left out.
import { Contact } from '../models/Contact.js';
import { EmailEvaluation } from '../models/EmailEvaluation.js';
import { SheetRow } from '../models/SheetRow.js';
import { addDays, parseDate, todayUtc } from '../lib/dates.js';

const VEHICLE_EXPIRIES = ['registrationExp', 'insuranceExp', 'inspectionExp', 'diamondStickerExp'];
const VEHICLE_WARN_DAYS = 14;
const nyToday = () => parseDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));

const AREAS = [
  {
    key: 'followups',
    label: 'Contact follow-ups due',
    href: '/follow-ups',
    count: () => Contact.countDocuments({ followUp: { $lt: addDays(todayUtc(), 1) } }),
  },
  {
    key: 'emailEvaluation',
    label: 'Email Evaluation follow-ups due',
    href: '/email-evaluation?due=yes',
    count: () => EmailEvaluation.countDocuments({ nextFollowUpAt: { $ne: null, $lte: todayUtc() } }),
  },
  {
    key: 'violations',
    label: 'Unpaid vehicle violations',
    href: '/violations?f.status=Unpaid',
    count: () => SheetRow.countDocuments({ workspace: 'violations', 'values.status': 'Unpaid' }),
  },
  {
    key: 'vehicles',
    label: `Vehicles with a document expired or expiring in ${VEHICLE_WARN_DAYS} days`,
    href: '/vehicles',
    count: () => {
      const soon = addDays(todayUtc(), VEHICLE_WARN_DAYS);
      return SheetRow.countDocuments({ workspace: 'vehicles', $or: VEHICLE_EXPIRIES.map((f) => ({ [`values.${f}`]: { $type: 'date', $lte: soon } })) });
    },
  },
  {
    key: 'enquiries',
    label: 'Enquiries awaiting a response',
    href: '/enquiries?f.status=RESPONSE%20AWAITED',
    count: () => SheetRow.countDocuments({ workspace: 'enquiries', 'values.status': 'RESPONSE AWAITED' }),
  },
  {
    key: 'pricechecks',
    label: 'New BMC price checks to follow up',
    href: '/price-checks?f.followUp=New',
    // same rule as the page: a price check whose ride date has passed is not shown
    count: () => SheetRow.countDocuments({ workspace: 'pricechecks', 'values.followUp': 'New', 'values.rideDate': { $not: { $lt: nyToday() } } }),
  },
];

/** [{ key, label, href, count }] for every area with something due. */
export async function dueSummary() {
  const counts = await Promise.all(AREAS.map((a) => a.count().catch(() => 0)));
  return AREAS.map(({ key, label, href }, i) => ({ key, label, href, count: counts[i] })).filter((a) => a.count > 0);
}
