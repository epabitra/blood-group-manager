import { useState } from 'react';
import { api } from '../api';
import { AVAILABILITY, BLOOD_GROUPS, EMPTY_DONOR, GENDERS } from '../constants';
import { digits, todayStr } from '../utils';
import { Modal, Spinner } from './ui';

function initialValues(donor) {
  const v = {};
  Object.keys(EMPTY_DONOR).forEach((k) => {
    const val = donor[k];
    v[k] = val === undefined || val === null || val === '' ? String(EMPTY_DONOR[k]) : String(val);
  });
  return v;
}

export default function DonorForm({ donor, onClose, onSaved }) {
  const [v, setV] = useState(() => initialValues(donor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState('');
  const isEdit = Boolean(donor.id);

  const set = (k) => (e) => setV((old) => ({ ...old, [k]: e.target.value }));

  const save = async (force = false) => {
    setError('');
    setDuplicate('');
    if (!v.name.trim()) return setError('Name is required.');
    if (digits(v.phone).length < 7) return setError('Enter a valid phone number.');
    if (!v.bloodGroup) return setError('Select a blood group.');

    setBusy(true);
    try {
      onSaved(await api.saveDonor(v, force));
    } catch (e) {
      if (e.code === 'DUPLICATE') setDuplicate(e.message);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    save(false);
  };

  const today = todayStr();

  return (
    <Modal
      title={isEdit ? `Edit ${donor.name}` : 'Add donor'}
      onClose={onClose}
      wide
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          {duplicate && (
            <div className="warning grow">
              {duplicate}
              <button className="btn small primary" onClick={() => save(true)} disabled={busy}>
                Yes, save anyway
              </button>
            </div>
          )}
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary grow" type="submit" form="donor-form" disabled={busy}>
            {busy ? <Spinner small /> : isEdit ? 'Save changes' : 'Add donor'}
          </button>
        </>
      }
    >
      <form id="donor-form" className="form-grid" onSubmit={submit}>
        <fieldset>
          <legend>Basic details</legend>
          <Field label="Full name *">
            <input value={v.name} onChange={set('name')} required autoFocus maxLength={200} />
          </Field>
          <Field label="Blood group *">
            <select value={v.bloodGroup} onChange={set('bloodGroup')} required>
              <option value="">Select…</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Phone *">
            <input type="tel" value={v.phone} onChange={set('phone')} required inputMode="tel" maxLength={20} />
          </Field>
          <Field label="Alternate phone">
            <input type="tel" value={v.altPhone} onChange={set('altPhone')} inputMode="tel" maxLength={20} />
          </Field>
          <Field label="Gender" hint="Decides the waiting period between donations (see Settings).">
            <select value={v.gender} onChange={set('gender')}>
              <option value="">Not specified</option>
              {GENDERS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of birth" hint="Donors must be 18–65 years old.">
            <input type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} max={today} />
          </Field>
          <Field label="Weight (kg)" hint="Minimum 45 kg.">
            <input type="number" value={v.weightKg} onChange={set('weightKg')} min="1" max="299" step="0.1" />
          </Field>
          <Field label="Email">
            <input type="email" value={v.email} onChange={set('email')} maxLength={200} />
          </Field>
        </fieldset>

        <fieldset>
          <legend>Address</legend>
          <Field label="Address" wide>
            <textarea value={v.address} onChange={set('address')} rows={2} maxLength={500} />
          </Field>
          <Field label="Area / locality">
            <input value={v.area} onChange={set('area')} maxLength={100} />
          </Field>
          <Field label="City / town">
            <input value={v.city} onChange={set('city')} maxLength={100} />
          </Field>
          <Field label="Pincode">
            <input value={v.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={10} />
          </Field>
        </fieldset>

        <fieldset>
          <legend>Donation</legend>
          <Field label="Last donated on">
            <input type="date" value={v.lastDonated} onChange={set('lastDonated')} max={today} />
          </Field>
          <Field label="Total donations so far">
            <input type="number" value={v.totalDonations} onChange={set('totalDonations')} min="0" step="1" />
          </Field>
          <Field label="Availability">
            <select value={v.availability} onChange={set('availability')}>
              {AVAILABILITY.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="Registered at (camp / source)">
            <input value={v.source} onChange={set('source')} placeholder="e.g. Camp at City Hall, Jan 2025" maxLength={200} />
          </Field>
        </fieldset>

        <fieldset>
          <legend>Notes</legend>
          <Field label="Medical notes" hint="Conditions, medicines, deferral reasons." wide>
            <textarea value={v.medicalNotes} onChange={set('medicalNotes')} rows={2} maxLength={1000} />
          </Field>
          <Field label="Other notes" hint="Best time to call, language, etc." wide>
            <textarea value={v.notes} onChange={set('notes')} rows={2} maxLength={1000} />
          </Field>
        </fieldset>
      </form>
    </Modal>
  );
}

function Field({ label, hint, wide, children }) {
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
