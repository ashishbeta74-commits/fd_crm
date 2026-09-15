import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { SavedView } from '../models/SavedView.js';
import { listQuery } from './contacts.js';

export const viewsRouter = Router();

// Only the keys GET /contacts understands are stored; page / limit are never part of a view.
const paramsInput = listQuery.omit({ page: true, limit: true }).partial();

const viewInput = z.object({
  name: z.string().trim().min(1).max(60),
  params: paramsInput.default({}),
  pinned: z.boolean().optional(),
  order: z.number().int().optional(),
});

/** Drop empty / default values so two views with the same filters compare equal. */
export function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    // the list's defaults (sheet order) need not be stored
    if (k === 'sort' && v === 'createdAt') continue;
    if (k === 'dir' && v === 'asc') continue;
    out[k] = v;
  }
  return out;
}

viewsRouter.get('/', async (req, res) => {
  const items = await SavedView.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json({ items });
});

viewsRouter.post('/', async (req, res) => {
  const body = viewInput.parse(req.body);
  const params = cleanParams(body.params);
  const existing = await SavedView.findOne({ name: body.name }).collation({ locale: 'en', strength: 2 });
  if (existing) throw new HttpError(409, `A view called "${existing.name}" already exists`, { existing: { _id: existing._id, name: existing.name } });
  const last = await SavedView.findOne().sort({ order: -1 }).select('order').lean();
  const item = await SavedView.create({ name: body.name, params, pinned: body.pinned ?? true, order: body.order ?? (last ? last.order + 1 : 0) });
  res.status(201).json(item);
});

viewsRouter.patch('/:id', async (req, res) => {
  const body = viewInput.partial().parse(req.body);
  const item = await SavedView.findById(req.params.id);
  if (!item) throw new HttpError(404, 'View not found');
  if (body.name !== undefined) {
    const clash = await SavedView.findOne({ name: body.name, _id: { $ne: item._id } }).collation({ locale: 'en', strength: 2 });
    if (clash) throw new HttpError(409, `A view called "${clash.name}" already exists`);
    item.name = body.name;
  }
  if (body.params !== undefined) item.params = cleanParams(body.params);
  if (body.pinned !== undefined) item.pinned = body.pinned;
  if (body.order !== undefined) item.order = body.order;
  await item.save();
  res.json(item);
});

// Reorder: { ids: [...] } in the wanted order.
viewsRouter.post('/reorder', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(200) }).parse(req.body);
  await Promise.all(ids.map((id, i) => SavedView.updateOne({ _id: id }, { $set: { order: i } })));
  res.json({ items: await SavedView.find().sort({ order: 1, createdAt: 1 }).lean() });
});

viewsRouter.delete('/:id', async (req, res) => {
  const r = await SavedView.findByIdAndDelete(req.params.id);
  if (!r) throw new HttpError(404, 'View not found');
  res.json({ ok: true });
});
