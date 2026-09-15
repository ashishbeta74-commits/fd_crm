import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const SCRIPT_KINDS = ['script', 'qa'];

// The calling playbook: phone scripts (what to say) and Q&A (how to answer what they say back).
// `kind: 'script'` -> title = the script's name, body = the script. `kind: 'qa'` -> title = the
// question / objection, body = the answer. Anyone signed in can add, edit and delete entries;
// built-ins are seeded once and can be restored if deleted.
const ScriptSchema = new Schema(
  {
    kind: { type: String, enum: SCRIPT_KINDS, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 20000 },
    // free text, e.g. "Opening", "Voicemail", "Objections", "Pricing"
    category: { type: String, trim: true, default: '', maxlength: 40 },
    order: { type: Number, default: 0 },
    builtIn: { type: Boolean, default: false },
    builtInKey: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

ScriptSchema.index({ kind: 1, order: 1 });

export const Script = model('Script', ScriptSchema);
