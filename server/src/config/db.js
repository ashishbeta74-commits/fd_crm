import mongoose from 'mongoose';

export const DEFAULT_URI = 'mongodb://127.0.0.1:27017/crm';

let connectedUri = '';
export const getDbUri = () => connectedUri;

const redact = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

/** Connect to MongoDB, retrying forever (the embedded DB may still be downloading/starting). */
export async function connectDb() {
  const uri = (process.env.MONGODB_URI || '').trim() || DEFAULT_URI;
  mongoose.set('strictQuery', true);
  let attempt = 0;
  for (;;) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
      connectedUri = redact(uri);
      console.log(`[db] connected to ${connectedUri}`);
      return connectedUri;
    } catch (err) {
      attempt += 1;
      if (attempt === 1 || attempt % 6 === 0) {
        console.log(`[db] waiting for MongoDB at ${redact(uri)} (attempt ${attempt}): ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }
}
