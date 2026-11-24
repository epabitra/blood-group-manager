import { useDeferredValue, useMemo, useState } from 'react';
import { api } from '../api';
import { AVAILABILITY, BLOOD_GROUPS, EMPTY_DONOR, GENDERS } from '../constants';
import { useDonorSearch } from '../useDonorSearch';
import { digits, timeAgo, todayStr } from '../utils';
import { BloodBadge, Modal, Spinner } from './ui';

const MAX_SUGGESTIONS = 5;

function initialValues(donor) {
  const v = {};
  Object.keys(EMPTY_DONOR).forEach((k) => {
    const val = donor[k];
    v[k] = val === undefined || val === null || val === '' ? String(EMPTY_DONOR[k]) : String(val);
  });
  return v;
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z଀-୿]/g, '');
const last10 = (s) => digits(s).slice(-10);

/**
 * Add / edit a donor. For a new donor:
 *  - existing donors matching the typed name or phone are suggested, so nobody is added twice;
 *  - "Donated today" records the donation in the same save.
 */
export default function DonorForm({
  donor,
  donors,
  canView,
  canRecord,
  settings,
  recordDonation,
  onClose,
  onSaved,
  onPickExisting,
}) {
  const isEdit = Boolean(donor.id);
  const [v, setV] = useState(() => initialValues(donor));
  const [donated, setDonated] = useState(Boolean(recordDonation) && !isEdit && canRecord);
  const [donation, setDonation] = useState({ date: todayStr(), place: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setV((old) => ({ ...old, [k]: e.target.value }));
  const setDon = (k) => (e) => setDonation((old) => ({ ...old, [k]: e.target.value }));

  const name = useDeferredValue(v.name);
  const phone = useDeferredValue(v.phone);

  // Users who can't view the list get suggestions from the server (max 10, phones hidden).
  const remoteQuery = !canView && !isEdit ? (digits(phone).length >= 4 ? phone : name) : '';
  const remote = useDonorSearch(remoteQuery, { canView: false, donors: [], settings });

  const suggestions = useMemo(() => {
    if (isEdit) return { exact: null, list: [] };
    if (!canView) return { exact: null, list: remote.results.slice(0, MAX_SUGGESTIONS) };
    const nm = normName(name);
    const pd = digits(phone);
    if (nm.length < 3 && pd.length < 4) return { exact: null, list: [] };
    const exact = pd.length >= 10 && nm ? donors.find((d) => last10(d.phone) === last10(pd) && normName(d.name) === nm) : null;
    const list = donors
      .filter(
        (d) =>
          d !== exact &&
          ((pd.length >= 4 && (digits(d.phone).includes(pd) || digits(d.altPhone).includes(pd))) ||
            (nm.length >= 3 && normName(d.name).includes(nm))),
      )
      .slice(0, MAX_SUGGESTIONS);
    return { exact, list };
  }, [donors, name, phone, isEdit, canView, remote.results]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!v.name.trim()) return setError('Name is required.');
    if (digits(v.phone).length < 7) return setError('Enter a valid phone number.');
    if (!v.bloodGroup) return setError('Select a blood group.');
    if (donated && !donation.date) return setError('Enter the donation date.');

    setBusy(true);
    try {
      const res = await api.saveDonor(v, donated ? donation : null);
      onSaved(res.donor, { merged: res.merged, donated });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const today = todayStr();
  const { exact, list } = suggestions;

  return (
    <Modal
      title={isEdit ? `Edit ${donor.name}` : donated ? 'New donor + donation' : 'Add donor'}
      onClose={onClose}
      wide
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary grow" type="submit" form="donor-form" disabled={busy}>
            {busy ? <Spinner small /> : isEdit ? 'Save changes' : donated ? '✓ Save donor & donation' : 'Add donor'}
          </button>
        </>
      }
    >
      <form id="donor-form" className="form-grid" onSubmit={submit}>
        <fieldset>
          <legend>Basic details</legend>
          <Field label="Full name *">
            <input value={v.name} onChange={set('name')} required autoFocus={!v.name} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Phone *">
            <input type="tel" value={v.phone} onChange={set('phone')} required inputMode="tel" maxLength={20} autoComplete="off" />
          </Field>

          {(exact || list.length > 0) && (
            <div className="suggest wide">
              {exact ? (
                <p className="suggest-title exact">
                  ⚠ This donor is already saved. Use the existing record instead of adding again:
                </p>
              ) : (
                <p className="suggest-title">Already saved? Tap the person to use their record:</p>
              )}
              {[exact, ...list].filter(Boolean).map((d) => (
                <button
                  type="button"
                  key={d.id}
                  className={`pick-item${d === exact ? ' exact' : ''}`}
                  onClick={() => onPickExisting(d, donated)}
                >
                  <BloodBadge group={d.bloodGroup} />
                  <span className="pick-main">
                    <span className="donor-name">{d.name}</span>
                    <span className="muted small">
                      {d.phone} · Last: {timeAgo(d.lastDonated)}
                    </span>
                  </span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          )}

          <Field label="Blood group *">
            <select value={v.bloodGroup} onChange={set('bloodGroup')} required>
              <option value="">Select…</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Alternate phone">
            <input type="tel" value={v.altPhone} onChange={set('altPhone')} inputMode="tel" maxLength={20} />
          </Field>
        </fieldset>

        {!isEdit && canRecord && (
          <fieldset className="donated-box">
            <label className="switch wide">
              <input type="checkbox" checked={donated} onChange={(e) => setDonated(e.target.checked)} />
              <span>
                <strong>Donated today / at this camp</strong>
                <br />
                <small className="muted">Records the donation together with the new donor.</small>
              </span>
            </label>
            {donated && (
              <>
                <Field label="Donation date *">
                  <input type="date" value={donation.date} onChange={setDon('date')} max={today} required />
                </Field>
                <Field label="Camp / hospital">
                  <input value={donation.place} onChange={setDon('place')} placeholder="e.g. Balaji Temple camp" maxLength={200} />
                </Field>
              </>
            )}
          </fieldset>
        )}

        <fieldset>
          <legend>More details (optional)</legend>
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
          <legend>Donation record</legend>
          {!donated && (
            <>
              <Field label="Last donated on" hint="Only if they donated before and it isn't recorded.">
                <input type="date" value={v.lastDonated} onChange={set('lastDonated')} max={today} />
              </Field>
              <Field label="Total donations so far">
                <input type="number" value={v.totalDonations} onChange={set('totalDonations')} min="0" step="1" />
              </Field>
            </>
          )}
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
