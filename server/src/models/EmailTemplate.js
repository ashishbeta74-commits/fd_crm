import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const TEMPLATE_CATEGORIES = ['outreach', 'follow-up', 'booking', 'other'];

// A reusable email: subject + plain-text body with {{mergeFields}} (see services/emailTemplates.js).
// Built-in templates are seeded once and can be edited or deleted; "Restore built-ins" brings back the missing ones.
const EmailTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    subject: { type: String, trim: true, default: '', maxlength: 200 },
    body: { type: String, default: '', maxlength: 20000 },
    category: { type: String, enum: TEMPLATE_CATEGORIES, default: 'other' },
    builtIn: { type: Boolean, default: false },
    // identifies a built-in template across renames, so it is not re-seeded after being deleted on purpose
    builtInKey: { type: String, default: '' },
    order: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

EmailTemplateSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const EmailTemplate = model('EmailTemplate', EmailTemplateSchema);
