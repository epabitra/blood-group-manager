import { DEFAULT_SETTINGS } from './constants';

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parses "YYYY-MM-DD" as a local date. Returns null when empty/invalid. */
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDate(s) {
  const d = typeof s === 'string' ? parseDate(s) : s;
  if (!d) return s || '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function ageFrom(dob, today = new Date()) {
  const d = parseDate(dob);
  if (!d) return null;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function timeAgo(s) {
  const d = parseDate(s);
  if (!d) return 'Never';
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  if (days < 1) return 'Today';
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Works out whether a donor can be asked to donate today.
 * status: eligible | waiting | ineligible | unavailable | dnc
 */
export function gapDays(gender, settings = DEFAULT_SETTINGS) {
  if (gender === 'Male') return settings.gapMale;
  if (gender === 'Female') return settings.gapFemale;
  return settings.gapOther;
}

export function eligibility(donor, settings = DEFAULT_SETTINGS, today = new Date()) {
  if (donor.availability === 'Do Not Contact') return { status: 'dnc', label: 'Do not contact' };
  if (donor.availability === 'Unavailable') return { status: 'unavailable', label: 'Unavailable' };

  const age = ageFrom(donor.dateOfBirth, today);
  if (age !== null && (age < settings.minAge || age > settings.maxAge)) {
    return { status: 'ineligible', label: `Age ${age} (allowed ${settings.minAge}–${settings.maxAge})` };
  }
  const weight = Number(donor.weightKg);
  if (weight && weight < settings.minWeight) {
    return { status: 'ineligible', label: `Weight below ${settings.minWeight} kg` };
  }

  const last = parseDate(donor.lastDonated);
  if (last) {
    const gap = gapDays(donor.gender, settings);
    const next = new Date(last.getTime() + gap * DAY);
    if (next > today) {
      const days = Math.ceil((next - today) / DAY);
      return { status: 'waiting', label: `Eligible in ${days} day${days === 1 ? '' : 's'}`, nextDate: next };
    }
  }
  return { status: 'eligible', label: 'Eligible now' };
}

export function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

export function telLink(phone) {
  const p = String(phone || '').replace(/[^\d+]/g, '');
  return p ? `tel:${p}` : null;
}

/** WhatsApp link; assumes India (+91) when a plain 10-digit number is given. */
export function whatsappLink(phone, text = '') {
  let d = digits(phone);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  if (d.length < 10) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Lower-cased text used for the instant search box. */
export function searchText(d) {
  // Digits-only phones let "98765 43210" and "9876543210" both match.
  return [d.name, d.phone, digits(d.phone), d.altPhone, digits(d.altPhone), d.area, d.city, d.pincode, d.address, d.source, d.bloodGroup]
    .join(' ')
    .toLowerCase();
}

/** Every word of the query must appear (name, phone, area…). Digit queries ignore spaces/dashes. */
export function matchesQuery(donor, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if (/^[\d\s+()-]+$/.test(q)) return donor._search.includes(digits(q));
  return q.split(/\s+/).every((w) => donor._search.includes(w));
}

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s) && !/^[+-]?\d[\d\s-]*$/.test(s)) s = "'" + s; // block spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => csvCell(c.get(r))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
