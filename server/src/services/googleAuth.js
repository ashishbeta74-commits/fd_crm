// Google service-account auth without the googleapis package: sign a JWT with the account's
// private key (RS256), swap it for an access token, cache the token until it expires.
//
// Configure ONE of:
//   GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json   (path relative to server/)
//   GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":...}'           (the key file inline)
// and share each Google Sheet with the account's client_email as Editor.
import fs from 'node:fs';
import path from 'node:path';
import { createSign } from 'node:crypto';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'];
const TOKEN_TTL_MARGIN_S = 60;

let account = null; // { client_email, private_key, token_uri } | null
let loadError = '';
let token = null; // { value, expiresAt }

function loadAccount() {
  if (account || loadError) return account;
  const inline = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  const file = (process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '').trim();
  if (!inline && !file) {
    loadError = 'not configured';
    return null;
  }
  try {
    const raw = inline || fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) throw new Error('client_email / private_key missing');
    account = { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch (err) {
    loadError = `Could not read the Google service account (${inline ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : file}): ${err.message}`;
    console.warn(`[google] ${loadError}`);
  }
  return account;
}

/** { configured, email, error } - shown on the Import page so the user knows whom to share sheets with. */
export function googleAuthInfo() {
  const acc = loadAccount();
  return { configured: Boolean(acc), email: acc?.client_email || '', error: acc ? '' : loadError === 'not configured' ? '' : loadError };
}

export const isGoogleConfigured = () => Boolean(loadAccount());

const b64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** A valid access token for the Sheets + Drive (read) scopes; throws when auth is not configured. */
export async function getAccessToken() {
  const acc = loadAccount();
  if (!acc) throw new Error(loadError === 'not configured' ? 'Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_FILE)' : loadError);
  const now = Math.floor(Date.now() / 1000);
  if (token && token.expiresAt - TOKEN_TTL_MARGIN_S > now) return token.value;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: acc.client_email, scope: SCOPES.join(' '), aud: acc.token_uri, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(acc.private_key, 'base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(acc.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google token request failed: ${data.error_description || data.error || res.status}`);
  token = { value: data.access_token, expiresAt: now + (Number(data.expires_in) || 3600) };
  return token.value;
}

/** fetch() against a Google API with the bearer token; JSON errors become readable messages. */
export async function googleFetch(url, { method = 'GET', body, timeoutMs = 60_000, raw = false } = {}) {
  const access = await getAccessToken();
  const headers = { Authorization: `Bearer ${access}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (raw) return res;
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_description || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(res.status === 403 ? `Google denied access (share the sheet with ${account?.client_email} as Editor): ${msg}` : msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
