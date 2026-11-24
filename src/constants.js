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
