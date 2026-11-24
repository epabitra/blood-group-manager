export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Bombay (Oh)', 'Unknown'];
export const SEARCHABLE_GROUPS = BLOOD_GROUPS.filter((g) => g !== 'Unknown');
export const GENDERS = ['Male', 'Female', 'Other'];
export const AVAILABILITY = ['Available', 'Unavailable', 'Do Not Contact'];

// Red-cell / whole-blood compatibility: patient group -> donor groups that can give.
// Plasma and platelet compatibility differ; the blood bank always cross-matches.
export const COMPATIBLE_DONORS = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
  'Bombay (Oh)': ['Bombay (Oh)'],
};

// Eligibility rules. Defaults follow India NBTC guidelines; admins can change them
// on the Settings page (stored on the server so every device uses the same rules).
export const DEFAULT_SETTINGS = { gapMale: 90, gapFemale: 120, gapOther: 90, minAge: 18, maxAge: 65, minWeight: 45 };

export const EMPTY_DONOR = {
  id: '',
  name: '',
  phone: '',
  altPhone: '',
  bloodGroup: '',
  gender: '',
  dateOfBirth: '',
  weightKg: '',
  email: '',
  address: '',
  area: '',
  city: '',
  pincode: '',
  lastDonated: '',
  totalDonations: 0,
  availability: 'Available',
  medicalNotes: '',
  notes: '',
  source: '',
};

export const ROLES = ['admin', 'manager', 'volunteer'];

// Must match PERMISSIONS in backend/Code.gs. The server enforces them; the app only hides
// what the user can't use.
export const PERMISSIONS = [
  { key: 'viewDonors', label: 'See donor list & Find Blood', hint: 'Full list, phone numbers and details. Without it they can only search a person by name/phone to record a donation (phones hidden).' },
  { key: 'addDonors', label: 'Add new donors' },
  { key: 'recordDonations', label: 'Record donations' },
  { key: 'editDonors', label: 'Edit donor details', needsView: true },
  { key: 'deleteDonors', label: 'Delete donors', needsView: true },
  { key: 'exportDonors', label: 'Export donor list (Excel)', needsView: true },
  { key: 'importDonors', label: 'Import donors from a file', needsView: true },
  { key: 'manageSettings', label: 'Change eligibility rules' },
  { key: 'manageVolunteers', label: 'Manage volunteer accounts', hint: 'Add, activate / deactivate and reset passwords of volunteers.' },
];

export const ALL_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, true]));

/** Used with an older backend that doesn't send permissions yet. */
export function legacyPermissions(role) {
  if (role === 'admin') return ALL_PERMISSIONS;
  return { ...Object.fromEntries(PERMISSIONS.map((p) => [p.key, false])), viewDonors: true, addDonors: true, editDonors: true, recordDonations: true, exportDonors: true };
}
