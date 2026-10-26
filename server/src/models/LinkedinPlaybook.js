import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// The LinkedIn outreach playbook as edited in the app (one document). Until someone saves an edit
// the built-in LI_PLAYBOOK / LI_RULES / LI_MEETING_LINK in linkedin.js are shown instead.
const LinkedinPlaybookSchema = new Schema(
  {
    playbook: { type: Schema.Types.Mixed, default: [] },
    rules: { type: [String], default: [] },
    meetingLink: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

export const LinkedinPlaybook = model('LinkedinPlaybook', LinkedinPlaybookSchema);
