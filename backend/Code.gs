/**
 * Blood Group Manager — Google Apps Script backend.
 *
 * This script must be attached to the Google Sheet that stores the data
 * (Extensions > Apps Script). See docs/01-google-sheet-and-backend-setup.md.
 *
 * Every request except "login" must carry a valid session token, so the
 * donor data can only be read by people who have a username and password.
 */

const CONFIG = {
  SESSION_DAYS: 7,           // How long a login stays valid on a device.
  DONOR_CACHE_SECONDS: 600,  // Server-side cache of the donor list (cleared on every change).
  MAX_LOGIN_ATTEMPTS: 5,     // Failed attempts before a username is locked.
  LOCKOUT_MINUTES: 15,
  HASH_ROUNDS: 500,          // Password hashing rounds. Don't change after users exist.
  MIN_PASSWORD_LENGTH: 8,
  MAX_TEXT_LENGTH: 1000,
};

const SHEETS = { DONORS: 'Donors', DONATIONS: 'Donations', USERS: 'Users' };

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Bombay (Oh)', 'Unknown'];
const GENDERS = ['Male', 'Female', 'Other'];
const AVAILABILITY = ['Available', 'Unavailable', 'Do Not Contact'];
const ROLES = ['admin', 'manager', 'volunteer'];

// What each role may do. Admin always has everything; the admin sets manager / volunteer
// permissions on the app's Permissions page (stored in Script Properties).
const PERMISSIONS = [
  'viewDonors',       // donor list, Find Blood, full details and phone numbers
  'addDonors',
  'editDonors',
  'recordDonations',
  'deleteDonors',
  'exportDonors',
  'importDonors',
  'manageSettings',   // eligibility rules
  'manageVolunteers', // add / activate / deactivate / reset volunteer accounts
];
const DEFAULT_PERMISSIONS = {
  manager: {
    viewDonors: true, addDonors: true, editDonors: true, recordDonations: true, deleteDonors: false,
    exportDonors: true, importDonors: false, manageSettings: false, manageVolunteers: true,
  },
  volunteer: {
    viewDonors: false, addDonors: true, editDonors: false, recordDonations: true, deleteDonors: false,
    exportDonors: false, importDonors: false, manageSettings: false, manageVolunteers: false,
  },
};
// These are impossible without seeing the donors, so they require viewDonors.
const NEEDS_VIEW = ['editDonors', 'deleteDonors', 'exportDonors', 'importDonors'];
const SEARCH_LIMIT = 10;

// [key used by the app, header label in the sheet]
const DONOR_COLUMNS = [
  ['id', 'ID'],
  ['name', 'Name'],
  ['phone', 'Phone'],
  ['altPhone', 'Alternate Phone'],
  ['bloodGroup', 'Blood Group'],
  ['gender', 'Gender'],
  ['dateOfBirth', 'Date of Birth'],
  ['weightKg', 'Weight (kg)'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['area', 'Area / Locality'],
  ['city', 'City'],
  ['pincode', 'Pincode'],
  ['lastDonated', 'Last Donated'],
  ['totalDonations', 'Total Donations'],
  ['availability', 'Availability'],
  ['medicalNotes', 'Medical Notes'],
  ['notes', 'Notes'],
  ['source', 'Registered At (Camp/Source)'],
  ['createdAt', 'Created At'],
  ['updatedAt', 'Updated At'],
  ['updatedBy', 'Updated By'],
];

const DONATION_COLUMNS = [
  ['id', 'ID'],
  ['donorId', 'Donor ID'],
  ['donorName', 'Donor Name'],
  ['bloodGroup', 'Blood Group'],
  ['date', 'Donation Date'],
  ['place', 'Camp / Hospital'],
  ['notes', 'Notes'],
  ['recordedBy', 'Recorded By'],
  ['recordedAt', 'Recorded At'],
];

const USER_COLUMNS = [
  ['username', 'Username'],
  ['displayName', 'Display Name'],
  ['role', 'Role'],
  ['active', 'Active'],
  ['salt', 'Salt'],
  ['passwordHash', 'Password Hash'],
  ['createdAt', 'Created At'],
  ['lastLogin', 'Last Login'],
];

// Eligibility rules, editable by admins from the app's Settings page.
const DEFAULT_SETTINGS = { gapMale: 90, gapFemale: 120, gapOther: 90, minAge: 18, maxAge: 65, minWeight: 45 };
const SETTINGS_LIMITS = {
  gapMale: [30, 730], gapFemale: [30, 730], gapOther: [30, 730],
  minAge: [16, 30], maxAge: [50, 80], minWeight: [30, 80],
};

const DONOR_KEYS = DONOR_COLUMNS.map(c => c[0]);
const DATE_FIELDS = { dateOfBirth: true, lastDonated: true, date: true };
const EDITABLE_DONOR_FIELDS = [
  'name', 'phone', 'altPhone', 'bloodGroup', 'gender', 'dateOfBirth', 'weightKg', 'email',
  'address', 'area', 'city', 'pincode', 'lastDonated', 'totalDonations', 'availability',
  'medicalNotes', 'notes', 'source',
];

/* ------------------------------------------------------------------ */
/* HTTP entry points                                                   */
/* ------------------------------------------------------------------ */

function doGet() {
  return ContentService.createTextOutput('Blood Group Manager API is running.');
}

function doPost(e) {
  let res;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = { ok: true, data: route_(req) };
  } catch (err) {
    if (!err.code) console.error(err && err.stack ? err.stack : err);
    res = {
      ok: false,
      code: err.code || 'ERROR',
      error: err.code ? err.message : 'Something went wrong on the server. Please try again.',
    };
  }
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

const ACTIONS = {
  logout: logout_,
  me: me_,
  bootstrap: bootstrap_,
  saveSettings: saveSettings_,
  listDonors: listDonors_,
  searchDonors: searchDonors_,
  saveDonor: saveDonor_,
  importDonors: importDonors_,
  deleteDonor: deleteDonor_,
  recordDonation: recordDonation_,
  listDonations: listDonations_,
  changePassword: changePassword_,
  listUsers: listUsers_,
  saveUser: saveUser_,
  resetUserPassword: resetUserPassword_,
  savePermissions: savePermissions_,
};

// Permission(s) needed for each action (any one of them is enough). Checked on the server,
// so hiding a button in the app is never the only protection.
const ACTION_PERMISSIONS = {
  listDonors: ['viewDonors'],
  listDonations: ['viewDonors'],
  searchDonors: ['viewDonors', 'addDonors', 'recordDonations'],
  saveDonor: ['addDonors', 'editDonors'], // refined inside saveDonor_
  importDonors: ['importDonors'],
  deleteDonor: ['deleteDonors'],
  recordDonation: ['recordDonations'],
  saveSettings: ['manageSettings'],
  listUsers: ['manageVolunteers'],
  saveUser: ['manageVolunteers'],
  resetUserPassword: ['manageVolunteers'],
};
const ADMIN_ONLY = { savePermissions: true };

function route_(req) {
  const action = String(req.action || '');
  const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
  if (action === 'login') return login_(payload);

  const handler = ACTIONS[action];
  if (!handler) throw apiError_('Unknown action.', 'BAD_REQUEST');
  const session = requireSession_(req.token);
  session.perms = permissionsFor_(session.role);
  if (ADMIN_ONLY[action] && session.role !== 'admin') {
    throw apiError_('Only the admin can do this.', 'FORBIDDEN');
  }
  requirePermission_(session, ACTION_PERMISSIONS[action]);
  return handler(payload, session, req.token);
}

function requirePermission_(session, needed) {
  if (needed && !needed.some(p => session.perms[p])) {
    throw apiError_('You do not have permission to do this. Please ask the admin.', 'FORBIDDEN');
  }
}

/* ------------------------------------------------------------------ */
/* Roles & permissions                                                 */
/* ------------------------------------------------------------------ */

/** Saved manager / volunteer permissions, with defaults for anything not saved yet. */
function getRolePermissions_() {
  const raw = PropertiesService.getScriptProperties().getProperty('permissions');
  const saved = raw ? JSON.parse(raw) : {};
  const out = {};
  Object.keys(DEFAULT_PERMISSIONS).forEach(role => {
    out[role] = {};
    PERMISSIONS.forEach(p => {
      const v = saved[role] && saved[role][p];
      out[role][p] = typeof v === 'boolean' ? v : DEFAULT_PERMISSIONS[role][p];
    });
    if (!out[role].viewDonors) NEEDS_VIEW.forEach(p => { out[role][p] = false; });
  });
  return out;
}

function permissionsFor_(role) {
  if (role === 'admin') {
    const all = {};
    PERMISSIONS.forEach(p => { all[p] = true; });
    return all;
  }
  return getRolePermissions_()[role] || getRolePermissions_().volunteer;
}

function savePermissions_(p) {
  const input = p.permissions || {};
  const out = {};
  Object.keys(DEFAULT_PERMISSIONS).forEach(role => {
    out[role] = {};
    PERMISSIONS.forEach(perm => { out[role][perm] = Boolean(input[role] && input[role][perm]); });
    if (!out[role].viewDonors) NEEDS_VIEW.forEach(perm => { out[role][perm] = false; });
  });
  PropertiesService.getScriptProperties().setProperty('permissions', JSON.stringify(out));
  return out;
}

function apiError_(message, code) {
  const err = new Error(message);
  err.code = code || 'ERROR';
  return err;
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

function login_(p) {
  const username = normUsername_(p.username);
  const password = String(p.password || '');
  if (!username || !password) throw apiError_('Enter username and password.', 'BAD_REQUEST');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CONFIG.MAX_LOGIN_ATTEMPTS) {
    throw apiError_('Too many failed attempts. Try again after ' + CONFIG.LOCKOUT_MINUTES + ' minutes.', 'LOCKED');
  }

  const found = findUser_(username);
  // Hash even when the user doesn't exist so response time doesn't reveal valid usernames.
  const hash = hashPassword_(password, found ? found.user.salt : 'no-such-user');
  const ok = found && isActive_(found.user.active) && hash === found.user.passwordHash;
  if (!ok) {
    cache.put(failKey, String(fails + 1), CONFIG.LOCKOUT_MINUTES * 60);
    throw apiError_('Invalid username or password.', 'BAD_LOGIN');
  }
  cache.remove(failKey);
  found.sheet.getRange(found.row, found.idx.lastLogin + 1).setValue(nowIso_());
  cleanupSessions_();

  // Send the data with the login response so the app needs no second request.
  const result = createSession_(found.user);
  try {
    const role = result.user.role;
    result.bootstrap = bootstrap_({}, { role: role, perms: permissionsFor_(role) });
  } catch (e) {
    result.bootstrap = null;
  }
  return result;
}

function logout_(p, session, token) {
  const key = sessionKey_(token);
  CacheService.getScriptCache().remove(key);
  PropertiesService.getScriptProperties().deleteProperty(key);
  return true;
}

/**
 * Everything the app needs on start-up, in one request. The donor list is only sent to roles
 * allowed to see it — a volunteer's phone never receives it.
 */
function bootstrap_(p, session) {
  return {
    settings: getSettings_(),
    permissions: session.perms,
    rolePermissions: session.role === 'admin' ? getRolePermissions_() : null,
    donors: session.perms.viewDonors ? listDonors_(p) : null,
  };
}

function getSettings_() {
  const raw = PropertiesService.getScriptProperties().getProperty('settings');
  const saved = raw ? JSON.parse(raw) : {};
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(k => {
    out[k] = typeof saved[k] === 'number' ? saved[k] : DEFAULT_SETTINGS[k];
  });
  return out;
}

function saveSettings_(p) {
  const s = p.settings || {};
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(k => {
    const v = parseInt(s[k], 10);
    const lim = SETTINGS_LIMITS[k];
    if (!(v >= lim[0] && v <= lim[1])) {
      throw apiError_('Value for "' + k + '" must be between ' + lim[0] + ' and ' + lim[1] + '.', 'BAD_REQUEST');
    }
    out[k] = v;
  });
  if (out.minAge >= out.maxAge) throw apiError_('Minimum age must be less than maximum age.', 'BAD_REQUEST');
  PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(out));
  return out;
}

function me_(p, session) {
  return { username: session.username, name: session.name, role: session.role };
}

function changePassword_(p, session) {
  const found = findUser_(session.username);
  if (!found) throw apiError_('User not found.', 'AUTH');
  if (hashPassword_(String(p.oldPassword || ''), found.user.salt) !== found.user.passwordHash) {
    throw apiError_('Current password is wrong.', 'BAD_REQUEST');
  }
  validatePassword_(p.newPassword);
  setPassword_(found, String(p.newPassword));
  revokeSessions_(session.username); // Log out every other device.
  Utilities.sleep(5); // Make sure the new session is created after the revoke timestamp.
  return createSession_(found.user);
}

/**
 * Sessions are stored in Script Properties (durable, survives 7 days) with a copy in the
 * cache for speed. Only a hash of the token is stored, so a stored key can't be used to log in.
 */
function createSession_(user) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const expires = Date.now() + CONFIG.SESSION_DAYS * 86400000;
  const session = {
    username: user.username,
    name: user.displayName || user.username,
    role: ROLES.indexOf(user.role) !== -1 ? user.role : 'volunteer',
    created: Date.now(),
    expires: expires,
  };
  const key = sessionKey_(token);
  const json = JSON.stringify(session);
  PropertiesService.getScriptProperties().setProperty(key, json);
  CacheService.getScriptCache().put(key, json, 21600);
  return {
    token: token,
    expiresAt: expires,
    user: { username: session.username, name: session.name, role: session.role },
  };
}

function requireSession_(token) {
  if (!token || typeof token !== 'string' || token.length > 100) {
    throw apiError_('Please log in.', 'AUTH');
  }
  const key = sessionKey_(token);
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  let raw = cache.get(key);
  if (!raw) {
    raw = props.getProperty(key);
    if (raw) cache.put(key, raw, 21600);
  }
  if (!raw) throw apiError_('Your session has expired. Please log in again.', 'AUTH');

  const session = JSON.parse(raw);
  const revokedAt = Number(props.getProperty('revoked_' + session.username) || 0);
  if (session.expires < Date.now() || (revokedAt && session.created <= revokedAt)) {
    cache.remove(key);
    props.deleteProperty(key);
    throw apiError_('Your session has expired. Please log in again.', 'AUTH');
  }
  return session;
}

function sessionKey_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return 'sess_' + bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/** Invalidates all existing sessions of a user (used on disable / password reset). */
function revokeSessions_(username) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('revoked_' + username, String(Date.now()));
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess_') === 0) {
      try {
        if (JSON.parse(all[k]).username === username) props.deleteProperty(k);
      } catch (e) { props.deleteProperty(k); }
    }
  });
}

/** Removes expired sessions so the property store stays small. */
function cleanupSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess_') !== 0) return;
    try {
      if (JSON.parse(all[k]).expires < now) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

function hashPassword_(password, salt) {
  const saltBytes = Utilities.newBlob(String(salt)).getBytes();
  let digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (let i = 1; i < CONFIG.HASH_ROUNDS; i++) {
    digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest.concat(saltBytes));
  }
  return Utilities.base64Encode(digest);
}

function validatePassword_(password) {
  if (typeof password !== 'string' || password.length < CONFIG.MIN_PASSWORD_LENGTH) {
    throw apiError_('Password must be at least ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters.', 'BAD_REQUEST');
  }
}

function setPassword_(found, password) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  const hash = hashPassword_(password, salt);
  found.sheet.getRange(found.row, found.idx.salt + 1).setValue(salt);
  found.sheet.getRange(found.row, found.idx.passwordHash + 1).setValue(hash);
  found.user.salt = salt;
  found.user.passwordHash = hash;
}

function normUsername_(u) {
  return String(u || '').trim().toLowerCase();
}

function isActive_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'YES';
}

function findUser_(username) {
  const sheet = getSheet_(SHEETS.USERS);
  const idx = headerIndex_(sheet, USER_COLUMNS).idx;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normUsername_(values[i][idx.username]) === username) {
      const user = {};
      USER_COLUMNS.forEach(c => { user[c[0]] = values[i][idx[c[0]]]; });
      user.username = username;
      user.salt = String(user.salt);
      user.passwordHash = String(user.passwordHash);
      return { sheet: sheet, row: i + 2, idx: idx, user: user };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* User management (Users page in the app)                             */
/* ------------------------------------------------------------------ */

/** Admin: any user. Others with manageVolunteers: volunteers only. */
function canManageRole_(session, role) {
  return session.role === 'admin' || (session.perms.manageVolunteers && role === 'volunteer');
}

function listUsers_(p, session) {
  const sheet = getSheet_(SHEETS.USERS);
  const idx = headerIndex_(sheet, USER_COLUMNS).idx;
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues()
    .filter(r => r[idx.username] !== '')
    .map(r => ({
      username: normUsername_(r[idx.username]),
      displayName: String(r[idx.displayName] || ''),
      role: ROLES.indexOf(r[idx.role]) !== -1 ? r[idx.role] : 'volunteer',
      active: isActive_(r[idx.active]),
      lastLogin: r[idx.lastLogin] instanceof Date ? r[idx.lastLogin].toISOString() : String(r[idx.lastLogin] || ''),
      createdAt: r[idx.createdAt] instanceof Date ? r[idx.createdAt].toISOString() : String(r[idx.createdAt] || ''),
    }))
    .filter(u => canManageRole_(session, u.role) || u.username === session.username);
}

/** Creates a user (with password) or updates name / role / active. */
function saveUser_(p, session) {
  const username = normUsername_(p.username);
  const displayName = cleanText_(p.displayName).slice(0, 100);
  const role = String(p.role || '');
  const active = p.active !== false;
  if (!/^[a-z0-9._@+-]{3,60}$/.test(username)) {
    throw apiError_('Username must be 3-60 characters: letters, numbers, . _ - @ +', 'BAD_REQUEST');
  }
  if (ROLES.indexOf(role) === -1) throw apiError_('Choose a valid role.', 'BAD_REQUEST');
  if (!canManageRole_(session, role)) throw apiError_('You can only manage volunteer accounts.', 'FORBIDDEN');

  return withLock_(() => {
    const found = findUser_(username);
    if (!found) {
      if (!p.isNew) throw apiError_('User not found.', 'NOT_FOUND');
      validatePassword_(p.password);
      createUser_(username, displayName || username, role, String(p.password));
      return { created: true };
    }
    if (p.isNew) throw apiError_('A user with this username already exists.', 'BAD_REQUEST');
    const oldRole = found.user.role;
    if (!canManageRole_(session, oldRole)) throw apiError_('You can only manage volunteer accounts.', 'FORBIDDEN');
    if (username === session.username && (role !== oldRole || !active)) {
      throw apiError_('You cannot change your own role or deactivate yourself.', 'BAD_REQUEST');
    }
    if (oldRole === 'admin' && isActive_(found.user.active) && (role !== 'admin' || !active) && countActiveAdmins_() <= 1) {
      throw apiError_('There must always be at least one active admin.', 'BAD_REQUEST');
    }
    const row = found.row;
    found.sheet.getRange(row, found.idx.displayName + 1).setValue(safeCell_(displayName || username));
    found.sheet.getRange(row, found.idx.role + 1).setValue(role);
    found.sheet.getRange(row, found.idx.active + 1).setValue(active ? 'TRUE' : 'FALSE');
    // A new role or a deactivation takes effect immediately: log them out everywhere.
    if (role !== oldRole || !active) revokeSessions_(username);
    return { created: false };
  });
}

function resetUserPassword_(p, session) {
  const username = normUsername_(p.username);
  validatePassword_(p.password);
  return withLock_(() => {
    const found = findUser_(username);
    if (!found) throw apiError_('User not found.', 'NOT_FOUND');
    if (!canManageRole_(session, found.user.role)) throw apiError_('You can only manage volunteer accounts.', 'FORBIDDEN');
    setPassword_(found, String(p.password));
    if (username !== session.username) revokeSessions_(username);
    return true;
  });
}

function createUser_(username, displayName, role, password) {
  const sheet = getSheet_(SHEETS.USERS);
  const h = headerIndex_(sheet, USER_COLUMNS);
  const row = new Array(h.width).fill('');
  const salt = Utilities.getUuid().replace(/-/g, '');
  row[h.idx.username] = username;
  row[h.idx.displayName] = safeCell_(displayName);
  row[h.idx.role] = role;
  row[h.idx.active] = 'TRUE';
  row[h.idx.salt] = salt;
  row[h.idx.passwordHash] = hashPassword_(password, salt);
  row[h.idx.createdAt] = nowIso_();
  sheet.appendRow(row);
}

function countActiveAdmins_() {
  const sheet = getSheet_(SHEETS.USERS);
  const idx = headerIndex_(sheet, USER_COLUMNS).idx;
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues()
    .filter(r => r[idx.role] === 'admin' && isActive_(r[idx.active])).length;
}

/* ------------------------------------------------------------------ */
/* Donors                                                              */
/* ------------------------------------------------------------------ */

/**
 * Returns all donors as { fields, rows } (arrays keep the response small).
 * Served from the cache unless p.fresh is set (the app's Refresh button).
 */
function listDonors_(p) {
  const cache = CacheService.getScriptCache();
  let gen = cache.get('donors_gen');
  if (!gen) {
    gen = newId_();
    cache.put('donors_gen', gen, 21600);
  } else if (!(p && p.fresh)) {
    const cached = readDonorCache_(gen);
    if (cached) return cached;
  }
  const data = readDonorsFromSheet_();
  writeDonorCache_(gen, data);
  return data;
}

function readDonorsFromSheet_() {
  const sheet = getSheet_(SHEETS.DONORS);
  const idx = headerIndex_(sheet, DONOR_COLUMNS).idx;
  const last = sheet.getLastRow();
  if (last < 2) return { fields: DONOR_KEYS, rows: [] };

  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  const rows = [];
  let idsAdded = false;

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (r[idx.name] === '' && r[idx.phone] === '') continue; // blank row
    if (r[idx.id] === '') { r[idx.id] = newId_(); idsAdded = true; }
    rows.push(DONOR_KEYS.map(k => cellOut_(k, r[idx[k]], tz)));
  }

  // Rows typed / pasted directly into the sheet have no ID yet: write them all in one call.
  if (idsAdded) {
    withLock_(() => {
      sheet.getRange(2, idx.id + 1, values.length, 1).setValues(values.map(r => [r[idx.id]]));
    });
  }
  return { fields: DONOR_KEYS, rows: rows };
}

// The cached list is split into chunks (each cache entry is limited to 100 KB).
// "gen" changes on every write, so a list read before a write is never served after it.
const DONOR_CHUNK_CHARS = 25000;

function readDonorCache_(gen) {
  const cache = CacheService.getScriptCache();
  const meta = String(cache.get('donors_meta') || '').split(':');
  if (meta[0] !== gen) return null;
  const keys = [];
  for (let i = 0; i < Number(meta[1]); i++) keys.push('donors_' + i);
  const parts = cache.getAll(keys);
  let json = '';
  for (let i = 0; i < keys.length; i++) {
    if (parts[keys[i]] === undefined || parts[keys[i]] === null) return null;
    json += parts[keys[i]];
  }
  return JSON.parse(json);
}

function writeDonorCache_(gen, data) {
  try {
    const json = JSON.stringify(data);
    const entries = {};
    let n = 0;
    for (let i = 0; i < json.length; i += DONOR_CHUNK_CHARS) {
      entries['donors_' + n++] = json.slice(i, i + DONOR_CHUNK_CHARS);
    }
    entries.donors_meta = gen + ':' + n;
    CacheService.getScriptCache().putAll(entries, CONFIG.DONOR_CACHE_SECONDS);
  } catch (e) {
    console.warn('Donor cache not written: ' + e);
  }
}

function invalidateDonorCache_() {
  CacheService.getScriptCache().put('donors_gen', newId_(), 21600);
}

/** Runs automatically when someone edits the sheet by hand, so the app shows the change. */
function onEdit() {
  try {
    invalidateDonorCache_();
  } catch (e) { /* not critical: the cache also expires on its own */ }
}

/**
 * Creates or updates a donor. A new donor with exactly the same phone AND name as an existing
 * one is merged into it (only empty fields are filled) instead of creating a duplicate.
 * Same phone with a different name is allowed (family members / friends sharing a phone).
 * Optional p.donation { date, place, notes } records a donation in the same request.
 * Returns { donor, merged }.
 */
function saveDonor_(p, session) {
  const donor = sanitizeDonor_(p.donor || {});
  const donation = p.donation ? sanitizeDonation_(p.donation) : null;
  requirePermission_(session, [donor.id ? 'editDonors' : 'addDonors']);
  if (donation) requirePermission_(session, ['recordDonations']);
  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const h = headerIndex_(sheet, DONOR_COLUMNS);
    const idx = h.idx;
    const now = nowIso_();
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();

    let rowNum = 0;
    let merged = false;
    if (donor.id) {
      rowNum = findRowById_(sheet, idx.id, donor.id);
      if (!rowNum) throw apiError_('This donor no longer exists (maybe deleted). Refresh the list.', 'NOT_FOUND');
    } else {
      rowNum = findExactMatch_(sheet, idx, donor.name, donor.phone);
      merged = rowNum > 0;
    }

    let row;
    if (rowNum) {
      row = sheet.getRange(rowNum, 1, 1, h.width).getValues()[0];
    } else {
      row = new Array(h.width).fill('');
      row[idx.id] = newId_();
      row[idx.createdAt] = now;
    }
    if (merged) fillEmptyFields_(row, idx, donor);
    else EDITABLE_DONOR_FIELDS.forEach(k => { row[idx[k]] = safeCell_(donor[k]); });
    if (donation) applyDonation_(row, idx, donation.date, tz);
    row[idx.updatedAt] = now;
    row[idx.updatedBy] = session.username;

    if (rowNum) sheet.getRange(rowNum, 1, 1, h.width).setValues([row]);
    else sheet.appendRow(row);
    if (donation) appendDonationRows_([donationRow_(row, idx, donation, session.username)]);
    invalidateDonorCache_();

    return { donor: donorFor_(session, rowToDonor_(row, idx)), merged: merged };
  });
}

/**
 * Finds donors by name or phone for people who may not see the full list (e.g. a volunteer
 * recording a donation). Needs 3+ letters or 4+ digits, returns at most SEARCH_LIMIT donors,
 * and hides phone numbers unless the user may view donors.
 */
function searchDonors_(p, session) {
  const q = String(p.query || '').trim().toLowerCase();
  const qDigits = digits_(q);
  const isPhone = /^[\d\s+()-]+$/.test(q);
  if (isPhone ? qDigits.length < 4 : q.replace(/[^a-z଀-୿]/g, '').length < 3) return [];

  const data = listDonors_({});
  const f = {};
  data.fields.forEach((k, i) => { f[k] = i; });
  const words = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < data.rows.length && out.length < SEARCH_LIMIT; i++) {
    const r = data.rows[i];
    const hit = isPhone
      ? digits_(r[f.phone]).indexOf(qDigits) !== -1 || digits_(r[f.altPhone]).indexOf(qDigits) !== -1
      : words.every(w => String(r[f.name]).toLowerCase().indexOf(w) !== -1);
    if (hit) {
      const d = {};
      data.fields.forEach((k, j) => { d[k] = r[j]; });
      out.push(donorFor_(session, d));
    }
  }
  return out;
}

/** Full donor for users who may view donors; otherwise only what's needed to identify them. */
function donorFor_(session, d) {
  if (session.perms.viewDonors) return d;
  return {
    id: d.id, name: d.name, bloodGroup: d.bloodGroup, gender: d.gender,
    phone: maskPhone_(d.phone), area: d.area, city: d.city,
    lastDonated: d.lastDonated, totalDonations: d.totalDonations, availability: d.availability,
    dateOfBirth: d.dateOfBirth, weightKg: d.weightKg, masked: true,
  };
}

function maskPhone_(phone) {
  const d = digits_(phone);
  if (d.length < 6) return '******';
  return d.slice(0, 2) + new Array(d.length - 3).join('*') + d.slice(-2);
}

/**
 * Bulk import (admin). p.donors = array of donor objects (keys starting with "_" are ignored),
 * each optionally with donations: [{ date, place, notes }].
 * Exact phone + name matches (in the sheet or earlier in the same file) are merged.
 * p.dryRun = true returns the same summary without writing anything (used for the preview).
 */
function importDonors_(p, session) {
  const list = Array.isArray(p.donors) ? p.donors : [];
  if (!list.length) throw apiError_('The file has no donors.', 'BAD_REQUEST');
  if (list.length > 3000) throw apiError_('Import at most 3000 donors at a time.', 'BAD_REQUEST');

  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const h = headerIndex_(sheet, DONOR_COLUMNS);
    const idx = h.idx;
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const now = nowIso_();
    const last = sheet.getLastRow();
    const values = last > 1 ? sheet.getRange(2, 1, last - 1, h.width).getValues() : [];

    const byKey = {};
    values.forEach(r => { if (r[idx.name] !== '') byKey[matchKey_(r[idx.name], r[idx.phone])] = r; });

    const dSheet = getSheet_(SHEETS.DONATIONS);
    const dIdx = headerIndex_(dSheet, DONATION_COLUMNS).idx;
    const dLast = dSheet.getLastRow();
    const seenDonations = {};
    if (dLast > 1) {
      dSheet.getRange(2, 1, dLast - 1, dSheet.getLastColumn()).getValues().forEach(r => {
        seenDonations[r[dIdx.donorId] + '|' + cellOut_('date', r[dIdx.date], tz)] = true;
      });
    }

    const result = { added: 0, merged: 0, donations: 0, skipped: [] };
    const newRows = [];
    const donationRows = [];
    let existingChanged = false;

    list.forEach((raw, i) => {
      const clean = {};
      Object.keys(raw || {}).forEach(k => { if (k.charAt(0) !== '_' && k !== 'id' && k !== 'donations') clean[k] = raw[k]; });
      let d;
      try {
        d = sanitizeDonor_(clean);
      } catch (e) {
        result.skipped.push({ index: i + 1, name: String((raw && raw.name) || ''), reason: e.message });
        return;
      }
      const donations = [];
      (Array.isArray(raw.donations) ? raw.donations : []).forEach(x => {
        try { donations.push(sanitizeDonation_(x)); } catch (e) { /* ignore a bad history entry */ }
      });

      const key = matchKey_(d.name, d.phone);
      let row = byKey[key];
      const createdNow = !row;
      if (row) {
        fillEmptyFields_(row, idx, d);
        result.merged++;
        if (!row._new) existingChanged = true;
      } else {
        row = new Array(h.width).fill('');
        row._new = true;
        row[idx.id] = newId_();
        row[idx.createdAt] = now;
        EDITABLE_DONOR_FIELDS.forEach(k => { row[idx[k]] = safeCell_(d[k]); });
        newRows.push(row);
        byKey[key] = row;
        result.added++;
      }
      donations.forEach(don => {
        const dk = row[idx.id] + '|' + don.date;
        if (seenDonations[dk]) return;
        seenDonations[dk] = true;
        // A donor created from this record already has lastDonated / totalDonations from the
        // file; for a merged donor the donation is added on top.
        if (!createdNow) applyDonation_(row, idx, don.date, tz);
        donationRows.push(donationRow_(row, idx, don, session.username));
        result.donations++;
      });
      row[idx.updatedAt] = now;
      row[idx.updatedBy] = session.username;
    });

    if (!p.dryRun) {
      if (existingChanged) sheet.getRange(2, 1, values.length, h.width).setValues(values);
      if (newRows.length) writeRows_(sheet, newRows.map(r => r.slice(0, h.width)));
      if (donationRows.length) appendDonationRows_(donationRows);
      invalidateDonorCache_();
    }
    return result;
  });
}

/** Appends rows below the data in one call, as plain text (keeps phones like "+91..." intact). */
function writeRows_(sheet, rows) {
  const start = sheet.getLastRow() + 1;
  const needed = start + rows.length - 1 - sheet.getMaxRows();
  if (needed > 0) sheet.insertRowsAfter(sheet.getMaxRows(), needed);
  const range = sheet.getRange(start, 1, rows.length, rows[0].length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

/** Same person = same last 10 phone digits and same name (ignoring case, dots and spaces). */
function matchKey_(name, phone) {
  return digits_(phone).slice(-10) + '|' + String(name || '').toLowerCase().replace(/[^a-z଀-୿]/g, '');
}

function findExactMatch_(sheet, idx, name, phone) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const key = matchKey_(name, phone);
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (matchKey_(values[i][idx.name], values[i][idx.phone]) === key) return i + 2;
  }
  return 0;
}

/** Merge: copy only the fields that are empty in the existing row. */
function fillEmptyFields_(row, idx, d) {
  EDITABLE_DONOR_FIELDS.forEach(k => {
    if (k === 'totalDonations' || k === 'availability' || k === 'lastDonated') return;
    if ((row[idx[k]] === '' || row[idx[k]] === null) && d[k] !== '' && d[k] !== undefined) row[idx[k]] = safeCell_(d[k]);
  });
}

/** Updates "last donated" (if newer) and the donation count on a donor row. */
function applyDonation_(row, idx, date, tz) {
  const current = cellOut_('lastDonated', row[idx.lastDonated], tz);
  if (!current || date > current) row[idx.lastDonated] = date;
  row[idx.totalDonations] = (parseInt(row[idx.totalDonations], 10) || 0) + 1;
}

function donationRow_(donorRow, idx, donation, username) {
  return { donorId: donorRow[idx.id], donorName: donorRow[idx.name], bloodGroup: donorRow[idx.bloodGroup], donation: donation, username: username };
}

function appendDonationRows_(items) {
  const dSheet = getSheet_(SHEETS.DONATIONS);
  const dh = headerIndex_(dSheet, DONATION_COLUMNS);
  const rows = items.map(it => {
    const r = new Array(dh.width).fill('');
    r[dh.idx.id] = newId_();
    r[dh.idx.donorId] = it.donorId;
    r[dh.idx.donorName] = it.donorName;
    r[dh.idx.bloodGroup] = it.bloodGroup;
    r[dh.idx.date] = it.donation.date;
    r[dh.idx.place] = safeCell_(it.donation.place);
    r[dh.idx.notes] = safeCell_(it.donation.notes);
    r[dh.idx.recordedBy] = it.username;
    r[dh.idx.recordedAt] = nowIso_();
    return r;
  });
  writeRows_(dSheet, rows);
}

function sanitizeDonation_(d) {
  const date = normalizeDate_(d && d.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw apiError_('Enter a valid donation date.', 'BAD_REQUEST');
  if (date > todayStr_()) throw apiError_('Donation date cannot be in the future.', 'BAD_REQUEST');
  return { date: date, place: cleanText_(d.place), notes: cleanText_(d.notes) };
}

function deleteDonor_(p) {
  const id = String(p.id || '');
  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const idx = headerIndex_(sheet, DONOR_COLUMNS).idx;
    const rowNum = findRowById_(sheet, idx.id, id);
    if (!rowNum) throw apiError_('Donor not found.', 'NOT_FOUND');
    sheet.deleteRow(rowNum);
    invalidateDonorCache_();
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Donations                                                           */
/* ------------------------------------------------------------------ */

function recordDonation_(p, session) {
  const donorId = String(p.donorId || '');
  const donation = sanitizeDonation_(p);

  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const h = headerIndex_(sheet, DONOR_COLUMNS);
    const idx = h.idx;
    const rowNum = findRowById_(sheet, idx.id, donorId);
    if (!rowNum) throw apiError_('Donor not found.', 'NOT_FOUND');

    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const row = sheet.getRange(rowNum, 1, 1, h.width).getValues()[0];
    applyDonation_(row, idx, donation.date, tz);
    row[idx.updatedAt] = nowIso_();
    row[idx.updatedBy] = session.username;
    sheet.getRange(rowNum, 1, 1, h.width).setValues([row]);
    appendDonationRows_([donationRow_(row, idx, donation, session.username)]);
    invalidateDonorCache_();

    return donorFor_(session, rowToDonor_(row, idx));
  });
}

function listDonations_(p) {
  const donorId = String(p.donorId || '');
  const sheet = getSheet_(SHEETS.DONATIONS);
  const idx = headerIndex_(sheet, DONATION_COLUMNS).idx;
  const last = sheet.getLastRow();
  if (last < 2 || !donorId) return [];

  // Only read the rows that match, instead of the whole history sheet.
  const cells = sheet.getRange(2, idx.donorId + 1, last - 1, 1)
    .createTextFinder(donorId).matchEntireCell(true).findAll();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const width = sheet.getLastColumn();
  const out = cells.map(c => {
    const r = sheet.getRange(c.getRow(), 1, 1, width).getValues()[0];
    const o = {};
    DONATION_COLUMNS.forEach(col => { o[col[0]] = cellOut_(col[0], r[idx[col[0]]], tz); });
    return o;
  });
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

/* ------------------------------------------------------------------ */
/* Validation & helpers                                                */
/* ------------------------------------------------------------------ */

function sanitizeDonor_(d) {
  const out = { id: cleanText_(d.id) };
  EDITABLE_DONOR_FIELDS.forEach(k => { out[k] = cleanText_(d[k]); });

  if (!out.name) throw apiError_('Name is required.', 'BAD_REQUEST');
  if (digits_(out.phone).length < 7) throw apiError_('Enter a valid phone number.', 'BAD_REQUEST');
  if (out.altPhone && digits_(out.altPhone).length < 7) throw apiError_('Alternate phone looks invalid.', 'BAD_REQUEST');
  if (BLOOD_GROUPS.indexOf(out.bloodGroup) === -1) throw apiError_('Select a valid blood group.', 'BAD_REQUEST');
  if (out.gender && GENDERS.indexOf(out.gender) === -1) throw apiError_('Invalid gender.', 'BAD_REQUEST');
  if (!out.availability) out.availability = 'Available';
  if (AVAILABILITY.indexOf(out.availability) === -1) throw apiError_('Invalid availability.', 'BAD_REQUEST');
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw apiError_('Email looks invalid.', 'BAD_REQUEST');

  ['dateOfBirth', 'lastDonated'].forEach(k => {
    if (!out[k]) return;
    out[k] = normalizeDate_(out[k]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out[k])) throw apiError_('Invalid date: ' + k, 'BAD_REQUEST');
    if (out[k] > todayStr_()) throw apiError_('Dates cannot be in the future.', 'BAD_REQUEST');
  });

  if (out.weightKg) {
    const w = Number(out.weightKg);
    if (!(w > 0 && w < 300)) throw apiError_('Weight looks invalid.', 'BAD_REQUEST');
    out.weightKg = w;
  }
  const total = out.totalDonations === '' ? 0 : parseInt(out.totalDonations, 10);
  if (!(total >= 0)) throw apiError_('Total donations must be a number.', 'BAD_REQUEST');
  out.totalDonations = total;
  return out;
}

function cleanText_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, CONFIG.MAX_TEXT_LENGTH);
}

/** Stops text like "=IMPORTXML(...)" from being stored as a formula. */
function safeCell_(v) {
  return typeof v === 'string' && /^[=]/.test(v) ? "'" + v : v;
}

function digits_(v) {
  return String(v || '').replace(/\D/g, '');
}

function findRowById_(sheet, idCol, id) {
  const last = sheet.getLastRow();
  if (!id || last < 2) return 0;
  const cell = sheet.getRange(2, idCol + 1, last - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function rowToDonor_(row, idx) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const d = {};
  DONOR_KEYS.forEach(k => { d[k] = cellOut_(k, row[idx[k]], tz); });
  return d;
}

function cellOut_(key, v, tz) {
  if (v instanceof Date) {
    return DATE_FIELDS[key] ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
  }
  if (typeof v === 'string') {
    v = v.trim();
    if (v.charAt(0) === "'") v = v.slice(1);
    return DATE_FIELDS[key] ? normalizeDate_(v) : v;
  }
  return v;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY. Returns YYYY-MM-DD (or the input if unknown). */
function normalizeDate_(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return s;
}

function pad2_(n) {
  return ('0' + n).slice(-2);
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw apiError_('Sheet "' + name + '" is missing. Open the sheet and run Blood Bank > Setup sheets.', 'SETUP');
  return sheet;
}

function headerIndex_(sheet, columns) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  const idx = {};
  columns.forEach(c => {
    const i = headers.indexOf(c[1]);
    if (i === -1) throw apiError_('Column "' + c[1] + '" is missing in sheet "' + sheet.getName() + '". Run Blood Bank > Setup sheets.', 'SETUP');
    idx[c[0]] = i;
  });
  return { idx: idx, width: width };
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_('Server is busy. Please try again.', 'BUSY');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso_() {
  return new Date().toISOString();
}

function todayStr_() {
  return Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/* ------------------------------------------------------------------ */
/* Spreadsheet menu: setup & user management (run from the sheet)      */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Blood Bank')
    .addItem('Setup sheets', 'setupSheets')
    .addSeparator()
    .addItem('Add user / reset password', 'menuAddUser')
    .addItem('Disable user (logs them out)', 'menuDisableUser')
    .addItem('Enable user', 'menuEnableUser')
    .addToUi();
}

/** Creates the three sheets with headers, formats and dropdowns. Safe to run again. */
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  const donors = ensureSheet_(ss, SHEETS.DONORS, DONOR_COLUMNS);
  const donations = ensureSheet_(ss, SHEETS.DONATIONS, DONATION_COLUMNS);
  const users = ensureSheet_(ss, SHEETS.USERS, USER_COLUMNS);

  // Dropdowns help volunteers who type directly into the sheet.
  const dIdx = headerIndex_(donors, DONOR_COLUMNS).idx;
  const maxRows = donors.getMaxRows() - 1;
  const list = values => SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true).setAllowInvalid(false).build();
  donors.getRange(2, dIdx.bloodGroup + 1, maxRows, 1).setDataValidation(list(BLOOD_GROUPS));
  donors.getRange(2, dIdx.gender + 1, maxRows, 1).setDataValidation(list(GENDERS));
  donors.getRange(2, dIdx.availability + 1, maxRows, 1).setDataValidation(list(AVAILABILITY));

  const uIdx = headerIndex_(users, USER_COLUMNS).idx;
  users.getRange(2, uIdx.role + 1, users.getMaxRows() - 1, 1).setDataValidation(list(ROLES));

  [donations, users].forEach(s => s.getRange(1, 1, 1, s.getLastColumn()).setBackground('#f4cccc'));
  donors.getRange(1, 1, 1, donors.getLastColumn()).setBackground('#f4cccc');

  try {
    SpreadsheetApp.getUi().alert('Setup complete. Next: Blood Bank > Add user / reset password.');
  } catch (e) { /* run from the editor: no UI */ }
}

function ensureSheet_(ss, name, columns) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 && name === SHEETS.DONORS
      ? ss.getSheets()[0].setName(name)
      : ss.insertSheet(name);
  }
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  const missing = columns.map(c => c[1]).filter(label => headers.indexOf(label) === -1);
  if (missing.length) {
    const start = headers.filter(String).length ? headers.length + 1 : 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
  }
  const lastCol = sheet.getLastColumn();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastCol).setFontWeight('bold');
  // Plain text everywhere: keeps leading zeros / "+91" in phones and stops date auto-conversion.
  sheet.getRange(1, 1, sheet.getMaxRows(), lastCol).setNumberFormat('@');
  return sheet;
}

function menuAddUser() {
  const ui = SpreadsheetApp.getUi();
  const ask = (title, msg) => {
    const r = ui.prompt(title, msg, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) throw new Error('cancelled');
    return r.getResponseText().trim();
  };
  try {
    const username = normUsername_(ask('Add user (1/4)', 'Username or email (letters, numbers, . _ - @):'));
    if (!/^[a-z0-9._@+-]{3,60}$/.test(username)) return ui.alert('Username must be 3-60 characters: letters, numbers, . _ - @ +');

    const found = findUser_(username);
    if (found && ui.alert('User "' + username + '" exists. Reset their password?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    const displayName = found ? found.user.displayName : ask('Add user (2/4)', 'Display name (e.g. Ravi Kumar):');
    const role = found ? found.user.role : ask('Add user (3/4)', 'Role: type admin, manager or volunteer\n(set what managers and volunteers may do on the app\'s Permissions page)').toLowerCase();
    if (ROLES.indexOf(role) === -1) return ui.alert('Role must be "admin", "manager" or "volunteer".');
    const password = ask('Add user (4/4)', 'Password (min ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters). Share it privately with the user.');
    validatePassword_(password);

    withLock_(() => {
      if (found) {
        setPassword_(found, password);
        revokeSessions_(username);
      } else {
        createUser_(username, displayName || username, role, password);
      }
    });
    ui.alert(found ? 'Password reset for "' + username + '".' : 'User "' + username + '" created.');
  } catch (e) {
    if (e.message !== 'cancelled') ui.alert('Error: ' + e.message);
  }
}

function menuDisableUser() { setUserActive_(false); }
function menuEnableUser() { setUserActive_(true); }

function setUserActive_(active) {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(active ? 'Enable user' : 'Disable user', 'Username:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const username = normUsername_(r.getResponseText());
  const found = findUser_(username);
  if (!found) return ui.alert('User "' + username + '" not found.');
  found.sheet.getRange(found.row, found.idx.active + 1).setValue(active ? 'TRUE' : 'FALSE');
  if (!active) revokeSessions_(username);
  ui.alert('User "' + username + '" ' + (active ? 'enabled.' : 'disabled and logged out.'));
}
