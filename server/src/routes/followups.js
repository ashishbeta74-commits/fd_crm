import { Router } from 'express';
import { Contact } from '../models/Contact.js';
import { Reminder } from '../models/Reminder.js';
import { addDays, todayUtc, utcDate } from '../lib/dates.js';

export const followupsRouter = Router();

const CONTACT_FIELDS = '-activities -notes -extra';
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Everything with a follow-up date, a booking date or an open reminder, grouped for the Follow-ups page.
followupsRouter.get('/', async (req, res) => {
  const [items, reminders] = await Promise.all([
    Contact.find({ $or: [{ followUp: { $ne: null } }, { 'booking.date': { $ne: null } }] }).select(CONTACT_FIELDS).limit(3000).lean(),
    Reminder.find({ done: false }).sort({ at: 1 }).limit(3000).lean(),
  ]);
  const today = todayUtc();
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  const now = new Date();
  const groups = { overdue: [], today: [], week: [], later: [], past: [] };

  const place = (e) => {
    const d = new Date(e.date);
    let g;
    if (d < today) g = e.kind === 'booking' ? 'past' : 'overdue';
    else if (d < tomorrow) g = 'today';
    else if (d < week) g = 'week';
    else g = 'later';
    groups[g].push(e);
  };

  for (const c of items) {
    if (c.followUp) place({ kind: 'followUp', date: c.followUp, note: c.followUpNote || '', priority: c.priority || '', priorityRank: c.priorityRank || 0, contact: c });
    if (c.booking?.date) place({ kind: 'booking', date: c.booking.date, time: c.booking.time || '', note: c.booking.note || '', priority: c.priority || '', priorityRank: c.priorityRank || 0, contact: c });
  }

  // Reminders carry a local date + time; group them by their local calendar day (stored as UTC midnight like the others).
  if (reminders.length) {
    const ids = [...new Set(reminders.map((r) => String(r.contactId)))];
    const contacts = new Map((await Contact.find({ _id: { $in: ids } }).select(CONTACT_FIELDS).lean()).map((c) => [String(c._id), c]));
    for (const r of reminders) {
      const contact = contacts.get(String(r.contactId));
      if (!contact) continue;
      const at = new Date(r.at);
      place({
        kind: 'reminder',
        reminderId: r._id,
        date: utcDate(at.getFullYear(), at.getMonth() + 1, at.getDate()),
        time: hhmm(at),
        at: r.at,
        overdue: at < now,
        note: r.note || '',
        priority: r.priority || '',
        priorityRank: r.priorityRank || 0,
        contact,
      });
    }
  }

  // Same day: most urgent first, then by time.
  const byDate = (a, b) => new Date(a.date) - new Date(b.date) || (b.priorityRank || 0) - (a.priorityRank || 0) || (a.time || '').localeCompare(b.time || '');
  for (const k of Object.keys(groups)) groups[k].sort(byDate);
  groups.past.reverse();
  groups.past = groups.past.slice(0, 50);
  res.json(groups);
});
