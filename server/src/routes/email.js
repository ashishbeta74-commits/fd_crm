import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { Contact } from '../models/Contact.js';
import { EmailTemplate } from '../models/EmailTemplate.js';
import { mailInfo, sendMail } from '../services/mailer.js';

export const emailRouter = Router();

const emailInput = z
  .object({
    contactId: z.string().min(1),
    templateId: z.string().optional(),
    to: z.string().trim().email(),
    subject: z.string().trim().min(1).max(200),
    body: z.string().max(20000).default(''),
  })
  .strict();

async function recordEmail({ contact, templateId, to, subject, how }) {
  let templateName = '';
  if (templateId) {
    const t = await EmailTemplate.findByIdAndUpdate(templateId, { $inc: { usedCount: 1 }, $set: { lastUsedAt: new Date() } }, { new: true }).lean();
    templateName = t?.name || '';
  }
  const message = `${how === 'sent' ? 'Email sent' : 'Email opened in mail app'} to ${to}: "${subject}"${templateName ? ` (template: ${templateName})` : ''}`;
  contact.activities.push({ type: 'email', message });
  contact.lastContactedAt = new Date();
  await contact.save();
  return message;
}

// Is direct sending configured? (Otherwise the UI opens a mailto: link.)
emailRouter.get('/status', (req, res) => {
  res.json(mailInfo());
});

// Send through SMTP / Gmail and log it on the contact.
emailRouter.post('/send', async (req, res) => {
  const body = emailInput.parse(req.body);
  if (!mailInfo().configured) throw new HttpError(400, 'Email sending is not configured. Add GMAIL_USER + GMAIL_APP_PASSWORD (or SMTP_*) to server/.env, or use "Open in mail app".');
  const contact = await Contact.findById(body.contactId);
  if (!contact) throw new HttpError(404, 'Contact not found');
  let result;
  try {
    result = await sendMail({ to: body.to, subject: body.subject, text: body.body });
  } catch (err) {
    throw new HttpError(502, `Could not send the email: ${err.message}`);
  }
  const message = await recordEmail({ contact, templateId: body.templateId, to: body.to, subject: body.subject, how: 'sent' });
  res.json({ ok: true, ...result, message });
});

// The mailto: path: nothing is sent by the server, but the activity is logged and template usage counted.
emailRouter.post('/log', async (req, res) => {
  const body = emailInput.parse(req.body);
  const contact = await Contact.findById(body.contactId);
  if (!contact) throw new HttpError(404, 'Contact not found');
  const message = await recordEmail({ contact, templateId: body.templateId, to: body.to, subject: body.subject, how: 'opened' });
  res.json({ ok: true, message });
});
