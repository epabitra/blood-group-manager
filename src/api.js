// Thin client for the Google Apps Script backend.
// Requests use Content-Type text/plain so the browser skips the CORS preflight,
// which Apps Script cannot answer.

const API_URL = import.meta.env.VITE_API_URL;
const SESSION_KEY = 'bgm_session';

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

let onSessionLost = () => {};
export function setSessionLostHandler(fn) {
  onSessionLost = fn;
}

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (s && s.token && s.expiresAt > Date.now()) return s;
  } catch {
    /* ignore */
  }
  return null;
}

function saveSession(s) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function call(action, payload = {}) {
  if (!API_URL) {
    throw new ApiError('App is not configured: VITE_API_URL is missing. See docs/02-local-development.md.', 'CONFIG');
  }
  const session = getSession();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: session?.token, payload }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('Network error. Check your internet connection and try again.', 'NETWORK');
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('Unexpected response from server. Check the Apps Script deployment.', 'SERVER');
  }
  if (!json.ok) {
    if (json.code === 'AUTH') {
      clearSession();
      onSessionLost();
    }
    throw new ApiError(json.error, json.code);
  }
  return json.data;
}

export const api = {
  async login(username, password) {
    const s = await call('login', { username, password });
    saveSession(s);
    return s;
  },
  async logout() {
    try {
      await call('logout');
    } finally {
      clearSession();
    }
  },
  async changePassword(oldPassword, newPassword) {
    const s = await call('changePassword', { oldPassword, newPassword });
    saveSession(s);
    return s;
  },
  async listDonors() {
    const { fields, rows } = await call('listDonors');
    return rows.map((r) => {
      const d = {};
      fields.forEach((f, i) => {
        d[f] = r[i];
      });
      return d;
    });
  },
  saveDonor: (donor, force = false) => call('saveDonor', { donor, force }),
  deleteDonor: (id) => call('deleteDonor', { id }),
  recordDonation: (donorId, date, place, notes) => call('recordDonation', { donorId, date, place, notes }),
  listDonations: (donorId) => call('listDonations', { donorId }),
};
