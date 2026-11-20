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
  SESSION_HOURS: 6,          // Max 6 (Apps Script cache limit).
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
const ROLES = ['admin', 'volunteer'];

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
  listDonors: listDonors_,
  saveDonor: saveDonor_,
  deleteDonor: deleteDonor_,
  recordDonation: recordDonation_,
  listDonations: listDonations_,
  changePassword: changePassword_,
};
const ADMIN_ONLY = { deleteDonor: true };

function route_(req) {
  const action = String(req.action || '');
  const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
  if (action === 'login') return login_(payload);

  const handler = ACTIONS[action];
  if (!handler) throw apiError_('Unknown action.', 'BAD_REQUEST');
  const session = requireSession_(req.token);
  if (ADMIN_ONLY[action] && session.role !== 'admin') {
    throw apiError_('Only an admin can do this.', 'FORBIDDEN');
  }
  return handler(payload, session, req.token);
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
  return createSession_(found.user);
}

function logout_(p, session, token) {
  CacheService.getScriptCache().remove('sess_' + token);
  return true;
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

function createSession_(user) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const ttl = CONFIG.SESSION_HOURS * 3600;
  const session = {
    username: user.username,
    name: user.displayName || user.username,
    role: user.role === 'admin' ? 'admin' : 'volunteer',
    created: Date.now(),
  };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), ttl);
  return {
    token: token,
    expiresAt: Date.now() + ttl * 1000,
    user: { username: session.username, name: session.name, role: session.role },
  };
}

function requireSession_(token) {
  if (!token || typeof token !== 'string' || token.length > 100) {
    throw apiError_('Please log in.', 'AUTH');
  }
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sess_' + token);
  if (!raw) throw apiError_('Your session has expired. Please log in again.', 'AUTH');
  const session = JSON.parse(raw);
  const revokedAt = Number(PropertiesService.getScriptProperties().getProperty('revoked_' + session.username) || 0);
  if (revokedAt && session.created <= revokedAt) {
    cache.remove('sess_' + token);
    throw apiError_('You have been logged out. Please log in again.', 'AUTH');
  }
  return session;
}

/** Invalidates all existing sessions of a user (used on disable / password reset). */
function revokeSessions_(username) {
  PropertiesService.getScriptProperties().setProperty('revoked_' + username, String(Date.now()));
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
/* Donors                                                              */
/* ------------------------------------------------------------------ */

/** Returns all donors as { fields, rows } (arrays keep the response small). */
function listDonors_() {
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

function saveDonor_(p, session) {
  const donor = sanitizeDonor_(p.donor || {});
  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const h = headerIndex_(sheet, DONOR_COLUMNS);
    const idx = h.idx;
    const now = nowIso_();

    let rowNum = 0;
    if (donor.id) {
      rowNum = findRowById_(sheet, idx.id, donor.id);
      if (!rowNum) throw apiError_('This donor no longer exists (maybe deleted). Refresh the list.', 'NOT_FOUND');
    }

    if (!p.force) {
      const dup = findDuplicatePhone_(sheet, idx, donor.phone, rowNum);
      if (dup) {
        throw apiError_('A donor with this phone number already exists: ' + dup + '. Save anyway?', 'DUPLICATE');
      }
    }

    let row;
    if (rowNum) {
      row = sheet.getRange(rowNum, 1, 1, h.width).getValues()[0];
    } else {
      row = new Array(h.width).fill('');
      row[idx.id] = newId_();
      row[idx.createdAt] = now;
    }
    EDITABLE_DONOR_FIELDS.forEach(k => { row[idx[k]] = safeCell_(donor[k]); });
    row[idx.updatedAt] = now;
    row[idx.updatedBy] = session.username;

    if (rowNum) sheet.getRange(rowNum, 1, 1, h.width).setValues([row]);
    else sheet.appendRow(row);

    return rowToDonor_(row, idx);
  });
}

function deleteDonor_(p) {
  const id = String(p.id || '');
  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const idx = headerIndex_(sheet, DONOR_COLUMNS).idx;
    const rowNum = findRowById_(sheet, idx.id, id);
    if (!rowNum) throw apiError_('Donor not found.', 'NOT_FOUND');
    sheet.deleteRow(rowNum);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Donations                                                           */
/* ------------------------------------------------------------------ */

function recordDonation_(p, session) {
  const donorId = String(p.donorId || '');
  const date = normalizeDate_(p.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw apiError_('Enter a valid donation date.', 'BAD_REQUEST');
  if (date > todayStr_()) throw apiError_('Donation date cannot be in the future.', 'BAD_REQUEST');

  return withLock_(() => {
    const sheet = getSheet_(SHEETS.DONORS);
    const h = headerIndex_(sheet, DONOR_COLUMNS);
    const idx = h.idx;
    const rowNum = findRowById_(sheet, idx.id, donorId);
    if (!rowNum) throw apiError_('Donor not found.', 'NOT_FOUND');

    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const row = sheet.getRange(rowNum, 1, 1, h.width).getValues()[0];
    const current = cellOut_('lastDonated', row[idx.lastDonated], tz);
    if (!current || date > current) row[idx.lastDonated] = date;
    row[idx.totalDonations] = (parseInt(row[idx.totalDonations], 10) || 0) + 1;
    row[idx.updatedAt] = nowIso_();
    row[idx.updatedBy] = session.username;
    sheet.getRange(rowNum, 1, 1, h.width).setValues([row]);

    const dSheet = getSheet_(SHEETS.DONATIONS);
    const dh = headerIndex_(dSheet, DONATION_COLUMNS);
    const dRow = new Array(dh.width).fill('');
    dRow[dh.idx.id] = newId_();
    dRow[dh.idx.donorId] = donorId;
    dRow[dh.idx.donorName] = row[idx.name];
    dRow[dh.idx.bloodGroup] = row[idx.bloodGroup];
    dRow[dh.idx.date] = date;
    dRow[dh.idx.place] = safeCell_(cleanText_(p.place));
    dRow[dh.idx.notes] = safeCell_(cleanText_(p.notes));
    dRow[dh.idx.recordedBy] = session.username;
    dRow[dh.idx.recordedAt] = nowIso_();
    dSheet.appendRow(dRow);

    return rowToDonor_(row, idx);
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

function findDuplicatePhone_(sheet, idx, phone, ignoreRow) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const key = digits_(phone).slice(-10);
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (i + 2 === ignoreRow) continue;
    const r = values[i];
    if (digits_(r[idx.phone]).slice(-10) === key || (r[idx.altPhone] && digits_(r[idx.altPhone]).slice(-10) === key)) {
      return r[idx.name] + ' (' + r[idx.bloodGroup] + ')';
    }
  }
  return null;
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
    const role = found ? found.user.role : ask('Add user (3/4)', 'Role: type admin or volunteer\n(admin can also delete donors)').toLowerCase();
    if (ROLES.indexOf(role) === -1) return ui.alert('Role must be "admin" or "volunteer".');
    const password = ask('Add user (4/4)', 'Password (min ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters). Share it privately with the user.');
    validatePassword_(password);

    withLock_(() => {
      if (found) {
        setPassword_(found, password);
        revokeSessions_(username);
      } else {
        const sheet = getSheet_(SHEETS.USERS);
        const h = headerIndex_(sheet, USER_COLUMNS);
        const row = new Array(h.width).fill('');
        const salt = Utilities.getUuid().replace(/-/g, '');
        row[h.idx.username] = username;
        row[h.idx.displayName] = safeCell_(displayName || username);
        row[h.idx.role] = role;
        row[h.idx.active] = 'TRUE';
        row[h.idx.salt] = salt;
        row[h.idx.passwordHash] = hashPassword_(password, salt);
        row[h.idx.createdAt] = nowIso_();
        sheet.appendRow(row);
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
