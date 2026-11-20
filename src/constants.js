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

// Minimum gap between whole-blood donations (India NBTC guideline).
export const DONATION_GAP_DAYS = { Male: 90, Female: 120 };
export const DEFAULT_GAP_DAYS = 90;
export const MIN_AGE = 18;
export const MAX_AGE = 65;
export const MIN_WEIGHT_KG = 45;

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
