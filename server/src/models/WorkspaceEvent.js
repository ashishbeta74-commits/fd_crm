import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// A status or reach-out type change made in the CRM on a sheet-workspace row (Client Reach Out, Reservations: the workspaces
// with `activity: true`), for the personal dashboard. Written by PATCH /api/workspaces/:key/:id; sheet
// syncs and imports write none, so they count for nobody.
const WorkspaceEventSchema = new Schema({
  workspace: { type: String, required: true },
  rowId: { type: Schema.Types.ObjectId, required: true },
  // 'status': from / to are statuses; 'type': from / to are reach-out types (Call / Email / Text)
  kind: { type: String, enum: ['status', 'type'], default: 'status' },
  // the row's name at the time (client / passenger), for the dashboard list
  label: { type: String, default: '' },
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  // the row's reach-out type (Call / Email / Text) after the edit, when the workspace has one
  reachType: { type: String, default: '' },
  byId: { type: Schema.Types.ObjectId, default: null },
  at: { type: Date, default: Date.now },
});

WorkspaceEventSchema.index({ byId: 1, at: -1 });

export const WorkspaceEvent = model('WorkspaceEvent', WorkspaceEventSchema);
