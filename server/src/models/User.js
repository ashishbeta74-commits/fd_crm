import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const ROLES = ['admin', 'agent'];

// A team member who may sign in. `username` is what they type (case-insensitive), `userId` is the
// short unique staff id shown in the app (FD-001 ...). Passwords are stored as scrypt hashes.
const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    userId: { type: String, required: true, unique: true, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true },
    // 'admin' = super admin (may manage email templates and users); 'agent' = everything else, no special powers
    role: { type: String, enum: ROLES, default: 'agent' },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = model('User', UserSchema);

// Key/value settings that must survive restarts (e.g. the session signing secret when SESSION_SECRET is unset).
const SettingSchema = new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed }, { timestamps: true });
export const Setting = model('Setting', SettingSchema);
