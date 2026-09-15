// Thin fetch wrapper for the CRM API. The Next.js server proxies /api/* to the Express API
// (see next.config.mjs), so everything here uses relative URLs.

const BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function toQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---- session token (localStorage) ----
const TOKEN_KEY = 'crm:token';
export const AUTH_EVENT = 'crm:auth-changed';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EVENT));
}

// The signed-in user, remembered alongside the token. On a reload the app renders from this straight
// away and re-checks the session in the background, instead of holding the whole page behind one
// round trip to the API. A token the server rejects still lands on the sign-in screen (api.js clears
// it on a 401); nothing here grants access, the server checks every request.
const USER_KEY = 'crm:user';

/** The remembered user for `token` (`{ user, at }`), or null when there is none for it. */
export function getCachedUser(token) {
  try {
    const raw = token && localStorage.getItem(USER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v?.user && v.token === token ? v : null;
  } catch {
    return null;
  }
}

export function setCachedUser(token, user) {
  try {
    if (token && user) localStorage.setItem(USER_KEY, JSON.stringify({ token, user, at: Date.now() }));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode */
  }
}

async function request(path, { method = 'GET', body, formData, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the API. Is the server running (npm run dev)?');
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    // A rejected session (expired, password changed, deactivated) sends the app back to the sign-in screen.
    if (res.status === 401 && token && !path.startsWith('/auth/login')) setToken('');
    throw new ApiError(res.status, data?.error || `${res.status} ${res.statusText}`, data?.details);
  }
  return data;
}

export const api = {
  get: (path, params) => request(`${path}${toQuery(params)}`),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),

  meta: () => request('/meta'),
  health: () => request('/health'),

  auth: {
    login: (body) => request('/auth/login', { method: 'POST', body }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST', body: {} }),
    changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),
    users: () => request('/auth/users'),
    resetPassword: (id) => request(`/auth/users/${id}/reset-password`, { method: 'POST', body: {} }),
    updateUser: (id, body) => request(`/auth/users/${id}`, { method: 'PATCH', body }),
  },
  stats: () => request('/stats'),
  // Daily Progress Report: one day's work + end-of-day pipeline, and the per-day strip for the day picker.
  dailyReport: (date) => request(`/stats/daily${toQuery({ date })}`),
  dailyHistory: (days) => request(`/stats/daily/history${toQuery({ days })}`),
  dailyRange: (from, to) => request(`/stats/daily/range${toQuery({ from, to })}`),
  followups: () => request('/followups'),

  contacts: {
    list: (params) => request(`/contacts${toQuery(params)}`),
    get: (id) => request(`/contacts/${id}`),
    create: (body) => request('/contacts', { method: 'POST', body }),
    update: (id, body) => request(`/contacts/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
    bulk: (body) => request('/contacts/bulk', { method: 'POST', body }),
    addActivity: (id, body) => request(`/contacts/${id}/activities`, { method: 'POST', body }),
    removeLastFollowUp: (id) => request(`/contacts/${id}/followups/last`, { method: 'DELETE' }),
    removeActivity: (id, activityId) => request(`/contacts/${id}/activities/${activityId}`, { method: 'DELETE' }),
    exportUrl: (params) => `${BASE}/contacts/export${toQuery(params)}`,
  },

  imports: {
    preview: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request('/imports/preview', { method: 'POST', formData: fd });
    },
    // Google Sheets link (shared as "Anyone with the link"); same response shape as preview + source/linkedSheet
    previewLink: (url) => request('/imports/link/preview', { method: 'POST', body: { url } }),
    commit: (body) => request('/imports/commit', { method: 'POST', body }),
    list: () => request('/imports'),
    get: (id) => request(`/imports/${id}`),
    sources: () => request('/imports/sources'),
    listNames: () => request('/imports/list-names'),
    resync: (id, body) => request(`/imports/${id}/resync`, { method: 'POST', body: body || {} }),
    undo: (id) => request(`/imports/${id}`, { method: 'DELETE' }),
    templateUrl: `${BASE}/imports/template`,
  },
  // The saved list of calling sheets (name, date, link) - same rows as imports.sources
  sheets: {
    list: () => request('/sheets'),
    save: (body) => request('/sheets', { method: 'POST', body }),
    update: (id, body) => request(`/sheets/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/sheets/${id}`, { method: 'DELETE' }),
    // rename a list everywhere: { from, to, sheetId? }
    rename: (body) => request('/sheets/rename', { method: 'POST', body }),
    // two-way sync: push CRM state into the sheet now / auth status
    push: (id) => request(`/sheets/${id}/push`, { method: 'POST', body: {} }),
    writeback: () => request('/sheets/writeback'),
  },

  // Saved filter sets for the Contacts page
  views: {
    list: () => request('/views'),
    create: (body) => request('/views', { method: 'POST', body }),
    update: (id, body) => request(`/views/${id}`, { method: 'PATCH', body }),
    reorder: (ids) => request('/views/reorder', { method: 'POST', body: { ids } }),
    remove: (id) => request(`/views/${id}`, { method: 'DELETE' }),
  },

  reminders: {
    list: (scope) => request(`/reminders${toQuery({ scope })}`),
    due: () => request('/reminders/due'),
    create: (body) => request('/reminders', { method: 'POST', body }),
    update: (id, body) => request(`/reminders/${id}`, { method: 'PATCH', body }),
    snooze: (id, body) => request(`/reminders/${id}/snooze`, { method: 'POST', body }),
    remove: (id) => request(`/reminders/${id}`, { method: 'DELETE' }),
    notified: (ids) => request('/reminders/notified', { method: 'POST', body: { ids } }),
  },

  // Web Push (notifications even when the app is closed)
  push: {
    key: () => request('/push/key'),
    subscribe: (subscription) => request('/push/subscribe', { method: 'POST', body: { subscription } }),
    unsubscribe: (endpoint) => request('/push/subscribe', { method: 'DELETE', body: { endpoint } }),
    test: () => request('/push/test', { method: 'POST', body: {} }),
    status: () => request('/push/status'),
  },

  // Phone scripts + Q&A (the calling playbook)
  scripts: {
    list: () => request('/scripts'),
    create: (body) => request('/scripts', { method: 'POST', body }),
    update: (id, body) => request(`/scripts/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/scripts/${id}`, { method: 'DELETE' }),
    restore: () => request('/scripts/restore', { method: 'POST', body: {} }),
  },
  // Email templates ({{mergeFields}}) and sending
  templates: {
    list: () => request('/templates'),
    create: (body) => request('/templates', { method: 'POST', body }),
    update: (id, body) => request(`/templates/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
    restore: () => request('/templates/restore', { method: 'POST', body: {} }),
    render: (body) => request('/templates/render', { method: 'POST', body }),
  },
  email: {
    status: () => request('/email/status'),
    send: (body) => request('/email/send', { method: 'POST', body }),
    log: (body) => request('/email/log', { method: 'POST', body }),
  },

  // LinkedIn outreach CRM (second pipeline on the same contacts)
  linkedin: {
    meta: () => request('/linkedin/meta'),
    list: (params) => request(`/linkedin/contacts${toQuery(params)}`),
    stats: (params) => request(`/linkedin/stats${toQuery(params)}`),
    update: (id, body) => request(`/linkedin/contacts/${id}`, { method: 'PATCH', body }),
    step: (id, body) => request(`/linkedin/contacts/${id}/step`, { method: 'POST', body }),
    bulk: (body) => request('/linkedin/bulk', { method: 'POST', body }),
    exportUrl: (params) => `${BASE}/linkedin/export${toQuery(params)}`,
  },

  duplicates: {
    find: (params) => request(`/duplicates${toQuery(params)}`),
    merge: (body) => request('/duplicates/merge', { method: 'POST', body }),
    merges: () => request('/duplicates/merges'),
    undoMerge: (id) => request(`/duplicates/merges/${id}/undo`, { method: 'POST', body: {} }),
    ignore: (ids) => request('/duplicates/ignore', { method: 'POST', body: { ids } }),
  },
};

// How often list / dashboard queries re-fetch while their page is open, so changes made by teammates show up.
// Pages poll at this pace while open; a tab that regains focus refreshes at once anyway (see providers.js).
// A minute keeps a hosted API on a small instance responsive for everyone.
export const LIVE_MS = 60_000;

// React Query keys, shared so mutations can invalidate the right lists.
export const qk = {
  meta: ['meta'],
  stats: ['stats'],
  dailyReport: (date) => ['stats', 'daily', date || 'today'],
  dailyHistory: (days) => ['stats', 'daily', 'history', days || 14],
  dailyRange: (from, to) => ['stats', 'daily', 'range', from, to],
  followups: ['followups'],
  contacts: (params) => ['contacts', params || {}],
  contact: (id) => ['contact', id],
  imports: ['imports'],
  importSources: ['imports', 'sources'],
  views: ['views'],
  reminders: ['reminders'],
  remindersDue: ['reminders', 'due'],
  duplicates: (params) => ['duplicates', params || {}],
  merges: ['duplicates', 'merges'],
  templates: ['templates'],
  scripts: ['scripts'],
  emailStatus: ['email', 'status'],
  linkedinMeta: ['linkedin', 'meta'],
  linkedinList: (params) => ['linkedin', 'list', params || {}],
  linkedinStats: (params) => ['linkedin', 'stats', params || {}],
};
