import './config/timezone.js'; // must come first: pins the process to New York time
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { errorHandler, notFound } from './lib/errors.js';
import { metaRouter } from './routes/meta.js';
import { contactsRouter } from './routes/contacts.js';
import { importsRouter } from './routes/imports.js';
import { STATS_TTL, computeStats, statsRouter } from './routes/stats.js';
import { META_TTL, computeMeta } from './routes/meta.js';
import { startCacheWarming, warm } from './lib/cache.js';
import { followupsRouter } from './routes/followups.js';
import { sheetsRouter } from './routes/sheets.js';
import { viewsRouter } from './routes/views.js';
import { remindersRouter } from './routes/reminders.js';
import { duplicatesRouter } from './routes/duplicates.js';
import { templatesRouter } from './routes/templates.js';
import { emailRouter } from './routes/email.js';
import { linkedinRouter } from './routes/linkedin.js';
import { getDbUri } from './config/db.js';
import { startAutoSync } from './services/sync.js';
import { startWriteback } from './services/writeback.js';
import { startPush } from './services/push.js';
import { startDailyReports } from './services/dailyReport.js';
import { pushRouter } from './routes/push.js';
import { seedTemplates } from './services/emailTemplates.js';
import { seedScripts } from './services/scripts.js';
import { scriptsRouter } from './routes/scripts.js';
import { mailInfo } from './services/mailer.js';
import { authRouter } from './routes/auth.js';
import { loadSecret, requireAuth } from './lib/auth.js';
import { seedUsers } from './services/users.js';

export function createApp() {
  startAutoSync();
  startWriteback();
  startPush();
  startDailyReports();
  // The dashboard's counts and the filter lists are recomputed in the background, so a page load
  // reads them from memory instead of waiting on the database (which may be a continent away).
  warm('stats', STATS_TTL, computeStats);
  warm('meta', META_TTL, computeMeta);
  startCacheWarming();
  loadSecret()
    .then(() => seedUsers())
    .catch((err) => console.error('[auth] start-up failed:', err.message));
  seedTemplates()
    .then((n) => n && console.log(`[email] seeded ${n} built-in email templates`))
    .catch((err) => console.error('[email] could not seed templates:', err.message));
  seedScripts()
    .then((n) => n && console.log(`[scripts] seeded ${n} built-in phone scripts and Q&A entries`))
    .catch((err) => console.error('[scripts] could not seed:', err.message));
  console.log(mailInfo().configured ? `[email] sending as ${mailInfo().from}` : '[email] direct sending is off (mailto: fallback); set GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_* to enable');
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '5mb' }));

  // Reports the database state too: a ping fails when the connection is down, so monitors see it.
  app.get('/api/health', async (req, res) => {
    const state = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
    let dbOk = false;
    try {
      await mongoose.connection.db?.admin().ping();
      dbOk = mongoose.connection.readyState === 1;
    } catch {
      dbOk = false;
    }
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: getDbUri(), dbState: state, time: new Date().toISOString() });
  });
  // Everything below needs a signed-in user (or the static API_TOKEN); only /api/health and /api/auth/login are open.
  app.use('/api', requireAuth);
  app.use('/api/auth', authRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/followups', followupsRouter);
  app.use('/api/sheets', sheetsRouter);
  app.use('/api/views', viewsRouter);
  app.use('/api/reminders', remindersRouter);
  app.use('/api/duplicates', duplicatesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/scripts', scriptsRouter);
  app.use('/api/email', emailRouter);
  app.use('/api/linkedin', linkedinRouter);
  app.use('/api/push', pushRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
