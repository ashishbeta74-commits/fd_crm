import './config/timezone.js'; // must come first: pins the process to New York time
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { runMigrations } from './lib/migrations.js';

const port = Number(process.env.PORT) || 4000;

await connectDb();
await runMigrations();
const app = createApp();
app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
