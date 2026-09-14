// Outgoing email. Optional: with GMAIL_USER + GMAIL_APP_PASSWORD (or SMTP_* variables) the CRM sends
// directly; otherwise the web app falls back to opening the user's mail client with a mailto: link.
import nodemailer from 'nodemailer';
import { SENDER } from './emailTemplates.js';

let transport = null;
let config = null;

function readConfig() {
  if (config) return config;
  const env = process.env;
  const gmailUser = (env.GMAIL_USER || '').trim();
  const gmailPass = (env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const host = (env.SMTP_HOST || '').trim();
  const user = (env.SMTP_USER || '').trim();
  const pass = env.SMTP_PASS || '';
  const senderName = SENDER().name || SENDER().company;
  if (gmailUser && gmailPass) {
    config = { kind: 'gmail', transport: { service: 'gmail', auth: { user: gmailUser, pass: gmailPass } }, from: (env.SMTP_FROM || '').trim() || `"${senderName}" <${gmailUser}>` };
  } else if (host) {
    const port = Number(env.SMTP_PORT) || 587;
    config = {
      kind: 'smtp',
      transport: { host, port, secure: String(env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465, auth: user ? { user, pass } : undefined },
      from: (env.SMTP_FROM || '').trim() || (user ? `"${senderName}" <${user}>` : ''),
    };
  } else {
    config = { kind: 'none', from: '' };
  }
  return config;
}

/** { configured, from, kind } for the UI. */
export function mailInfo() {
  const c = readConfig();
  return { configured: c.kind !== 'none' && Boolean(c.from), from: c.from, kind: c.kind, sender: SENDER() };
}

export async function sendMail({ to, subject, text, replyTo }) {
  const c = readConfig();
  if (c.kind === 'none') throw new Error('Email sending is not configured (set GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_* in server/.env)');
  if (!transport) transport = nodemailer.createTransport(c.transport);
  const info = await transport.sendMail({ from: c.from, to, subject, text, replyTo: replyTo || undefined });
  return { messageId: info.messageId, accepted: info.accepted || [], rejected: info.rejected || [] };
}
