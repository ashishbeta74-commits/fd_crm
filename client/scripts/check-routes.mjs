// Smoke-check routes against the running Next.js dev server.
// Usage: node client/scripts/check-routes.mjs [/route ...]   (defaults to all app routes)
// Prints status code and whether the HTML carries a Next.js compile/runtime error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lockFile = path.join(here, '..', '.next', 'dev', 'lock');
let base = process.env.NEXT_URL || 'http://localhost:3000';
try {
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  if (lock?.appUrl) base = lock.appUrl;
  else if (lock?.port) base = `http://localhost:${lock.port}`;
} catch {
  /* no lock file - use default */
}

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/', '/contacts', '/contacts/000000000000000000000000', '/follow-ups', '/linkedin', '/duplicates', '/templates', '/import'];
const ERROR_MARKERS = [/Build Error/i, /Failed to compile/i, /Module not found/i, /Unhandled Runtime Error/i, /Internal Server Error/i, /__next_error__/, /"err":\{"name"/];

let failed = 0;
for (const route of routes) {
  const url = base + route;
  try {
    const res = await fetch(url, { headers: { accept: 'text/html' } });
    const html = await res.text();
    const marker = ERROR_MARKERS.find((rx) => rx.test(html));
    const ok = res.status === 200 && !marker;
    if (!ok) failed += 1;
    let detail = '';
    if (!ok) {
      const m = html.match(/"message":"((?:\\.|[^"\\])*)"/) || html.match(/<pre[^>]*>([\s\S]{0,800}?)<\/pre>/);
      if (m) detail = `\n      ${m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\s+/g, ' ').slice(0, 700)}`;
    }
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${res.status} ${route}${marker ? `  [${marker}]` : ''}${detail}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL --- ${route}  (${err.message}) - is the dev server running at ${base}?`);
  }
}
console.log(failed ? `${failed} route(s) failed` : 'all routes OK');
process.exit(failed ? 1 : 0);
