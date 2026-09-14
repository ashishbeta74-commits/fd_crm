import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { Contact } from '../models/Contact.js';
import { EmailTemplate, TEMPLATE_CATEGORIES } from '../models/EmailTemplate.js';
import { DEFAULT_TEMPLATES, MERGE_FIELDS, SENDER, renderTemplate, seedTemplates } from '../services/emailTemplates.js';
import { requireAdmin } from '../lib/auth.js';

export const templatesRouter = Router();

const templateInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    subject: z.string().trim().max(200).default(''),
    body: z.string().max(20000).default(''),
    category: z.enum(TEMPLATE_CATEGORIES).default('other'),
    order: z.number().int().optional(),
  })
  .strict();

const mergeFieldsPublic = () => MERGE_FIELDS.map((f) => ({ key: f.key, label: f.label }));

templatesRouter.get('/', async (req, res) => {
  const items = await EmailTemplate.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json({ items, mergeFields: mergeFieldsPublic(), sender: SENDER(), builtInCount: DEFAULT_TEMPLATES.length });
});

templatesRouter.post('/', requireAdmin, async (req, res) => {
  const body = templateInput.parse(req.body);
  const clash = await EmailTemplate.findOne({ name: body.name }).collation({ locale: 'en', strength: 2 });
  if (clash) throw new HttpError(409, `A template called "${clash.name}" already exists`);
  const last = await EmailTemplate.findOne().sort({ order: -1 }).select('order').lean();
  const item = await EmailTemplate.create({ ...body, order: body.order ?? (last ? last.order + 1 : 0) });
  res.status(201).json(item);
});

// Re-adds any built-in template that was deleted (existing ones are left untouched).
templatesRouter.post('/restore', requireAdmin, async (req, res) => {
  const added = await seedTemplates({ force: true });
  res.json({ added, items: await EmailTemplate.find().sort({ order: 1, createdAt: 1 }).lean() });
});

/**
 * Fill a template (by id, or an ad-hoc subject/body) with a contact's details.
 * -> { subject, body, missing: [fieldKeys without a value], to: [candidate addresses] }
 */
templatesRouter.post('/render', async (req, res) => {
  const body = z
    .object({ templateId: z.string().optional(), subject: z.string().max(200).optional(), body: z.string().max(20000).optional(), contactId: z.string().min(1) })
    .parse(req.body);
  const contact = await Contact.findById(body.contactId).select('-activities').lean();
  if (!contact) throw new HttpError(404, 'Contact not found');
  let tpl = { subject: body.subject || '', body: body.body || '' };
  if (body.templateId) {
    const t = await EmailTemplate.findById(body.templateId).lean();
    if (!t) throw new HttpError(404, 'Template not found');
    tpl = { subject: body.subject ?? t.subject, body: body.body ?? t.body };
  }
  const rendered = renderTemplate(tpl, contact);
  const to = [...new Set([contact.email, contact.primaryEmail, contact.secondaryEmail].map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  res.json({ ...rendered, to });
});

templatesRouter.patch('/:id', requireAdmin, async (req, res) => {
  const body = templateInput.partial().parse(req.body);
  const item = await EmailTemplate.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Template not found');
  if (body.name !== undefined) {
    const clash = await EmailTemplate.findOne({ name: body.name, _id: { $ne: item._id } }).collation({ locale: 'en', strength: 2 });
    if (clash) throw new HttpError(409, `A template called "${clash.name}" already exists`);
  }
  Object.assign(item, body);
  await item.save();
  res.json(item);
});

templatesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const r = await EmailTemplate.findByIdAndDelete(req.params.id);
  if (!r) throw new HttpError(404, 'Template not found');
  res.json({ ok: true });
});
