import mongoose from 'mongoose';
import { ACTIVITY_TYPES, CATEGORY_KEYS, PRIORITY_KEYS, STAGE_KEYS, priorityRank } from '../fields.js';
import { computeDedupeKey } from '../lib/mapping.js';
import { events } from '../lib/events.js';
import { LI_CONNECTION_KEYS, LI_OVERRIDE_KEYS, LI_STAGE_KEYS, LI_STATUS_KEYS, computeLinkedinStage, countTouchpoints, lastTouch, liStage } from '../linkedin.js';

const { Schema, model } = mongoose;

const ActivitySchema = new Schema({
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  message: { type: String, default: '' },
  fromStage: { type: String, default: null },
  toStage: { type: String, default: null },
  at: { type: Date, default: Date.now },
  // How a follow-up was done (call / message / email); only on `followup` entries.
  channel: { type: String, enum: ['', 'call', 'message', 'email'], default: '' },
  // 'import' = written by a sheet import (kept as the audit trail). No default on purpose: entries that
  // predate this field must fall through to the type / message check below, on hydrated docs too.
  source: { type: String, enum: ['app', 'import'] },
});

/** True for history entries a sheet import wrote. Older entries have no `source`: recognised by type / message. */
export function isImportActivity(a) {
  if (!a) return false;
  if (a.source === 'import') return true;
  if (a.source === 'app') return false;
  if (a.type === 'import') return true;
  const msg = a.message || '';
  return /\(import\)\s*$/.test(msg) || (a.type === 'call' && /^(\d+(st|nd|rd|th) call|follow-?up \d+)\s*:/i.test(msg));
}

const text = (extra = {}) => ({ type: String, trim: true, default: '', ...extra });

const ContactSchema = new Schema(
  {
    name: text({ index: true }),
    email: text({ lowercase: true }),
    title: text(),
    companyName: text({ index: true }),
    website: text(),
    primaryEmail: text({ lowercase: true }),
    secondaryEmail: text({ lowercase: true }),
    contactL1: text(),
    companyInfo: text(),
    companyNo: text(),
    contactMain: text(),
    location: text({ index: true }),
    // Where they are, as filterable parts (see lib/geo.js); `location` stays the display line.
    city: text({ index: true }),
    state: text({ index: true }),
    country: text({ index: true }),
    // Set once the start-up pass tried to fill state / country from the city (see lib/migrations.js).
    placeGuessed: { type: Boolean, default: false },
    status: text(),
    // What the call revealed about the lead ("Money minded", "Cheap rate", "Services", or the team's own label)
    leadQuality: text({ index: true }),
    followUp: { type: Date, default: null, index: true },
    followUpNote: text(),
    // Follow-up rounds done so far ("Follow Up 1", "Follow Up 2" in the calling sheets); the next one is #count+1.
    followUpCount: { type: Number, default: 0 },
    stage: { type: String, enum: STAGE_KEYS, default: 'new', index: true },
    // When the contact entered its current stage (set on every stage change). Drives the "In stage since"
    // filter / column and the dashboard's "Prospects by day".
    stageChangedAt: { type: Date, default: null, index: true },
    booking: {
      date: { type: Date, default: null },
      time: { type: String, default: '' },
      note: { type: String, default: '' },
      // When the booking (its date) was made or last moved.
      bookedAt: { type: Date, default: null },
    },
    notes: { type: String, default: '' },
    // Free-form labels ("VIP", "NJ", "Corporate") - filterable, kept lower-case-insensitive but stored as typed.
    tags: { type: [String], default: [], index: true },
    // '' = no priority. priorityRank mirrors it as a number so lists can sort by priority.
    priority: { type: String, enum: ['', ...PRIORITY_KEYS], default: '', index: true },
    priorityRank: { type: Number, default: 0, index: true },
    // Who they are: travel advisor / executive assistant / other ('' = not set). See CATEGORIES in fields.js.
    category: { type: String, enum: ['', ...CATEGORY_KEYS], default: '', index: true },
    activities: { type: [ActivitySchema], default: [] },
    // The LinkedIn outreach pipeline (second CRM on the same contact). Dates drive `stage`; see linkedin.js.
    linkedin: {
      persona: { type: String, trim: true, default: '' },
      dateFollowed: { type: Date, default: null },
      dateEngaged: { type: Date, default: null },
      requestSentAt: { type: Date, default: null },
      connectionStatus: { type: String, enum: ['', ...LI_CONNECTION_KEYS], default: '' },
      acceptedAt: { type: Date, default: null },
      welcomeSentAt: { type: Date, default: null },
      firstReplyAt: { type: Date, default: null },
      need: { type: String, trim: true, default: '' },
      needAt: { type: Date, default: null },
      offerSentAt: { type: Date, default: null },
      trialRideDate: { type: Date, default: null },
      convertedDate: { type: Date, default: null },
      monthlyValue: { type: Number, default: 0 },
      outcomeOverride: { type: String, enum: ['', ...LI_OVERRIDE_KEYS], default: '' },
      nextAction: { type: String, trim: true, default: '' },
      nextActionDate: { type: Date, default: null },
      notes: { type: String, default: '' },
      // manual work status shown next to the actions (Not started / In progress / Waiting / Done)
      status: { type: String, enum: LI_STATUS_KEYS, default: 'not_started' },
      // derived on save
      stage: { type: String, enum: LI_STAGE_KEYS, default: 'identified' },
      stageIndex: { type: Number, default: 0 },
      group: { type: String, default: 'warmup' },
      closed: { type: Boolean, default: false },
      touchpoints: { type: Number, default: 0 },
      lastTouchAt: { type: Date, default: null },
      // true once anything LinkedIn-related was logged (so the LinkedIn CRM can show "worked" prospects first)
      active: { type: Boolean, default: false },
    },
    source: {
      fileName: { type: String, default: '' },
      // The list the contact belongs to in the CRM (the import's list name, e.g. "Fora Travel").
      sheetName: { type: String, default: '' },
      // The workbook tab the row came from (e.g. "Sheet1").
      tabName: { type: String, default: '' },
      row: { type: Number, default: null },
      batchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', default: null },
    },
    importBatchIds: { type: [Schema.Types.ObjectId], default: [] },
    // Unmapped spreadsheet columns are kept here so nothing from the sheet is lost.
    extra: { type: Schema.Types.Mixed, default: () => ({}) },
    dedupeKey: { type: String, default: null, index: true },
    lastContactedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

ContactSchema.index({ 'booking.date': 1 });
ContactSchema.index({ 'source.sheetName': 1 });
ContactSchema.index({ 'source.batchId': 1 });
ContactSchema.index({ importBatchIds: 1 });
// The list sorts by a column then `_id`, so the indexes carry both and the sort needs no extra pass.
ContactSchema.index({ updatedAt: -1, _id: 1 });
ContactSchema.index({ createdAt: 1, _id: 1 }); // the list's default order
ContactSchema.index({ lastContactedAt: -1, _id: 1 }); // "calls today" and the last-contact sort
// Daily progress reports and "recent activity" pick history entries by time.
ContactSchema.index({ 'activities.at': -1 });
ContactSchema.index({ 'linkedin.stage': 1 });
ContactSchema.index({ 'linkedin.nextActionDate': 1 });
ContactSchema.index({ 'linkedin.lastTouchAt': -1 });
ContactSchema.index({ contactL1: 1 });

/** Trim, drop empties and case-insensitive duplicates, keep the first spelling. */
export function normalizeTags(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const t = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 30);
}

ContactSchema.pre('save', function preSave(next) {
  this.dedupeKey = computeDedupeKey(this);
  this.tags = normalizeTags(this.tags);
  this.priorityRank = priorityRank(this.priority);
  if (this.isModified('stage') || (this.isNew && !this.stageChangedAt)) this.stageChangedAt = new Date();
  // LinkedIn pipeline: derive the stage and the dashboard helpers from what was logged.
  const li = this.linkedin || {};
  const stage = computeLinkedinStage(li);
  const def = liStage(stage);
  li.stage = stage;
  li.stageIndex = def.step || 0;
  li.group = def.group;
  li.closed = Boolean(def.closed);
  li.touchpoints = countTouchpoints(li);
  li.lastTouchAt = lastTouch(li);
  li.active = Boolean(li.touchpoints || li.persona || li.need || li.nextAction || li.nextActionDate || li.outcomeOverride || li.connectionStatus || li.notes);
  this.linkedin = li;
  next();
});

// Lets the Google Sheet write-back queue changed contacts without a circular import.
ContactSchema.post('save', function postSave(doc) {
  events.emit('contact:saved', doc);
});

export const Contact = model('Contact', ContactSchema);
