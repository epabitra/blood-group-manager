// Thin client for the Google Apps Script backend.
// Requests use Content-Type text/plain so the browser skips the CORS preflight,
// which Apps Script cannot answer.

import { DEFAULT_SETTINGS } from './constants';

const API_URL = import.meta.env.VITE_API_URL;
const SESSION_KEY = 'bgm_session';
const DATA_KEY = 'bgm_data';

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

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works, just without the offline copy */
  }
}

export function getSession() {
  const s = readJson(SESSION_KEY);
  return s && s.token && s.expiresAt > Date.now() ? s : null;
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DATA_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Copy of the last loaded data, kept on this device so the app opens instantly.
 * Removed on logout. Tied to the username so a different login never sees it.
 */
export function getCachedData(username) {
  const d = readJson(DATA_KEY);
  return d && d.username === username ? d : null;
}

/** donors = null for roles that may not view the donor list: nothing about donors is stored. */
export function saveCachedData(username, settings, donors, permissions) {
  writeJson(DATA_KEY, { username, settings, donors, permissions, savedAt: Date.now() });
}

async function call(action, payload = {}) {
  if (!API_URL) {
    throw new ApiError(
      'App is not configured: VITE_API_URL is missing. Set it in GitHub (Settings → Secrets and variables → Actions) or in .env.local.',
      'CONFIG',
    );
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
    if (json.error === 'Unknown action.') {
      throw new ApiError(
        'The backend is out of date. Paste the new backend/Code.gs into Apps Script and deploy a new version.',
        'OUTDATED',
      );
    }
    throw new ApiError(json.error, json.code);
  }
  return json.data;
}

/** Converts the compact { fields, rows } format into donor objects. */
export function toDonors({ fields, rows }) {
  return rows.map((r) => {
    const d = {};
    fields.forEach((f, i) => {
      d[f] = r[i];
    });
    return d;
  });
}

export const api = {
  /** Returns the session; session.bootstrap holds the first data load (or null). */
  async login(username, password) {
    const { bootstrap, ...session } = await call('login', { username, password });
    writeJson(SESSION_KEY, session);
    return { session, bootstrap };
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
    writeJson(SESSION_KEY, s);
    return s;
  },
  /** { settings, donors: { fields, rows } }. fresh=true skips the server cache. */
  async bootstrap(fresh = false) {
    try {
      return await call('bootstrap', { fresh });
    } catch (e) {
      // Older backend without "bootstrap": fall back to the original request.
      if (e.code !== 'OUTDATED') throw e;
      return { settings: DEFAULT_SETTINGS, donors: await call('listDonors') };
    }
  },
  saveSettings: (settings) => call('saveSettings', { settings }),
  /**
   * Saves a donor, optionally recording a donation in the same request.
   * Returns { donor, merged } — merged = an existing donor with the same phone and name was used.
   */
  async saveDonor(donor, donation = null) {
    const res = await call('saveDonor', { donor, donation });
    if (res && res.donor) return res;
    // Older backend: returns the donor itself and ignores the donation.
    if (donation) {
      return { donor: await api.recordDonation(res.id, donation.date, donation.place, donation.notes), merged: false };
    }
    return { donor: res, merged: false };
  },
  /** Admin bulk import. dryRun = preview only. Returns { added, merged, donations, skipped }. */
  importDonors: (donors, dryRun) => call('importDonors', { donors, dryRun }),
  /** Name / phone search on the server (max 10; phones masked for roles that can't view donors). */
  searchDonors: (query) => call('searchDonors', { query }),
  listUsers: () => call('listUsers'),
  saveUser: (user) => call('saveUser', user),
  resetUserPassword: (username, password) => call('resetUserPassword', { username, password }),
  savePermissions: (permissions) => call('savePermissions', { permissions }),
  deleteDonor: (id) => call('deleteDonor', { id }),
  recordDonation: (donorId, date, place, notes) => call('recordDonation', { donorId, date, place, notes }),
  listDonations: (donorId) => call('listDonations', { donorId }),
};
