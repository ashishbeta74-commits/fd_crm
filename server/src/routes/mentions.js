// "Tagged me": notes that tagged the signed-in person (@Name / @all) and replies to their notes.
import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { Contact } from '../models/Contact.js';
import { Mention } from '../models/Mention.js';

export const mentionsRouter = Router();

const LIMIT = 50;

mentionsRouter.get('/', async (req, res) => {
  if (!req.user?._id) return res.json({ items: [], unread: 0 });
  const userId = req.user._id;
  const [items, unread] = await Promise.all([Mention.find({ userId }).sort({ createdAt: -1 }).limit(LIMIT).lean(), Mention.countDocuments({ userId, readAt: null })]);
  const contacts = new Map(
    (await Contact.find({ _id: { $in: [...new Set(items.map((m) => String(m.contactId)))] } }).select('name companyName').lean()).map((c) => [String(c._id), c]),
  );
  res.json({ items: items.map((m) => ({ ...m, contact: contacts.get(String(m.contactId)) || null })), unread });
});

// Mark some (ids) or all of the signed-in person's rows as read.
mentionsRouter.post('/read', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).max(200).optional() }).parse(req.body || {});
  if (!req.user?._id) return res.json({ updated: 0 });
  const filter = { userId: req.user._id, readAt: null };
  if (ids) filter._id = { $in: ids.filter((id) => mongoose.isValidObjectId(id)) };
  const r = await Mention.updateMany(filter, { $set: { readAt: new Date() } });
  res.json({ updated: r.modifiedCount });
});
