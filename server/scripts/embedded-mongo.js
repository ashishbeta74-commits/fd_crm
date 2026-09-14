// Starts a local MongoDB without installing anything system-wide.
// Data is persisted under <repo>/.data/mongo (outside server/, so the API's file watcher
// does not restart on every database write) and survives restarts.
// If something already listens on the port (a real MongoDB, or a previous run), it does nothing.
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import mms from 'mongodb-memory-server';

const { MongoMemoryServer } = mms;
const port = Number(process.env.EMBEDDED_MONGO_PORT) || 27017;
const dataDir = path.resolve(process.cwd(), process.env.EMBEDDED_MONGO_DATA || '../.data/mongo');

// When MONGODB_URI points at an external database (Atlas, a local install), there is nothing to do.
const configured = (process.env.MONGODB_URI || '').trim();
if (configured && !/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(configured)) {
  console.log(`[embedded-mongo] MONGODB_URI points to an external database (${configured.replace(/\/\/([^@/]+)@/, '//***@')}); embedded MongoDB not started.`);
  process.exit(0);
}

function portInUse(p) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port: p });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

if (await portInUse(port)) {
  console.log(`[embedded-mongo] port ${port} is already in use (MongoDB is probably running). Nothing to do.`);
  process.exit(0);
}

fs.mkdirSync(dataDir, { recursive: true });
console.log(`[embedded-mongo] starting MongoDB on 127.0.0.1:${port}, data in ${dataDir}`);
console.log('[embedded-mongo] first run downloads the MongoDB binary (100-300 MB), this can take a few minutes...');

let server;
try {
  server = await MongoMemoryServer.create({
    instance: { port, ip: '127.0.0.1', dbPath: dataDir, storageEngine: 'wiredTiger' },
  });
} catch (err) {
  console.error('[embedded-mongo] failed to start:', err.message);
  console.error('If a previous run is still alive, end the mongod.exe process in Task Manager and try again.');
  process.exit(1);
}

const actualPort = server.instanceInfo?.port;
console.log(`[embedded-mongo] ready at ${server.getUri('crm')}`);
if (actualPort && actualPort !== port) {
  console.warn(`[embedded-mongo] WARNING: wanted port ${port} but got ${actualPort}. Set MONGODB_URI=mongodb://127.0.0.1:${actualPort}/crm`);
}

const stop = async () => {
  console.log('\n[embedded-mongo] stopping...');
  try {
    await server.stop({ doCleanup: false });
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
