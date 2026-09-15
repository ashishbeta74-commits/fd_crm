import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { SCRIPT_KINDS, Script } from '../models/Script.js';
import { DEFAULT_SCRIPTS, seedScripts } from '../services/scripts.js';

export const scriptsRouter = Router();

const scriptInput = z
  .object({
    kind: z.enum(SCRIPT_KINDS),
    title: z.string().trim().min(1).max(200),
    body: z.string().max(20000).default(''),
    category: z.string().trim().max(40).default(''),
    order: z.number().int().optional(),
  })
  .strict();

const list = () => Script.find().sort({ kind: 1, order: 1, createdAt: 1 }).lean();
const who = (req) => req.user?.displayName || req.user?.username || '';

// GET /api/scripts -> { items: [...both kinds...], builtInCount }
scriptsRouter.get('/', async (req, res) => {
  res.json({ items: await list(), builtInCount: DEFAULT_SCRIPTS.length });
});

// Anyone signed in can add to the playbook.
scriptsRouter.post('/', async (req, res) => {
  const body = scriptInput.parse(req.body);
  const last = await Script.findOne({ kind: body.kind }).sort({ order: -1 }).select('order').lean();
  const item = await Script.create({ ...body, order: body.order ?? (last ? last.order + 1 : 0), createdBy: who(req), updatedBy: who(req) });
  res.status(201).json(item);
});

// Re-adds any built-in that was deleted (existing ones are left untouched).
scriptsRouter.post('/restore', async (req, res) => {
  const added = await seedScripts({ force: true });
  res.json({ added, items: await list() });
});

scriptsRouter.patch('/:id', async (req, res) => {
  const body = scriptInput.partial().parse(req.body);
  const item = await Script.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Not found');
  Object.assign(item, body, { updatedBy: who(req) });
  await item.save();
  res.json(item);
});

scriptsRouter.delete('/:id', async (req, res) => {
  const r = await Script.findByIdAndDelete(req.params.id);
  if (!r) throw new HttpError(404, 'Not found');
  res.json({ ok: true });
});
