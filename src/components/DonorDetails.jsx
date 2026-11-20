import { useEffect, useState } from 'react';
import { api } from '../api';
import { ageFrom, formatDate, timeAgo, todayStr } from '../utils';
import { BloodBadge, ContactButtons, Modal, Spinner, StatusPill } from './ui';

export default function DonorDetails({ donor, isAdmin, onClose, onEdit, onUpdated, onDeleted }) {
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [showRecord, setShowRecord] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setHistory(null);
    api
      .listDonations(donor.id)
      .then((h) => active && setHistory(h))
      .catch((e) => active && setHistoryError(e.message));
    return () => {
      active = false;
    };
  }, [donor.id, donor.totalDonations]);

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteDonor(donor.id);
      onDeleted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const age = ageFrom(donor.dateOfBirth);
  const rows = [
    ['Phone', donor.phone],
    ['Alternate phone', donor.altPhone],
    ['Gender', donor.gender],
    ['Age', age !== null ? `${age} years (born ${formatDate(donor.dateOfBirth)})` : ''],
    ['Weight', donor.weightKg ? `${donor.weightKg} kg` : ''],
    ['Email', donor.email],
    ['Address', donor.address],
    ['Area', donor.area],
    ['City', donor.city],
    ['Pincode', donor.pincode],
    ['Last donated', donor.lastDonated ? `${formatDate(donor.lastDonated)} (${timeAgo(donor.lastDonated)})` : 'Never / unknown'],
    ['Total donations', donor.totalDonations || 0],
    ['Availability', donor.availability],
    ['Registered at', donor.source],
    ['Medical notes', donor.medicalNotes],
    ['Notes', donor.notes],
    ['Last updated', donor.updatedAt ? `${new Date(donor.updatedAt).toLocaleString()} by ${donor.updatedBy}` : ''],
  ].filter(([, val]) => val !== '' && val !== undefined && val !== null);

  return (
    <Modal
      title="Donor details"
      onClose={onClose}
      wide
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          {isAdmin &&
            (confirmDelete ? (
              <div className="warning grow">
                Delete {donor.name} permanently?
                <button className="btn small danger" onClick={remove} disabled={busy}>
                  {busy ? <Spinner small /> : 'Yes, delete'}
                </button>
                <button className="btn small ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  No
                </button>
              </div>
            ) : (
              <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          <span className="grow" />
          <button className="btn ghost" onClick={onEdit}>
            ✎ Edit
          </button>
          <button className="btn primary" onClick={() => setShowRecord((s) => !s)}>
            + Record donation
          </button>
        </>
      }
    >
      <div className="details-head">
        <BloodBadge group={donor.bloodGroup} large />
        <div>
          <h3>{donor.name}</h3>
          <StatusPill elig={donor._elig} />
          {donor._elig.nextDate && <p className="muted small">Can donate from {formatDate(donor._elig.nextDate)}</p>}
        </div>
        <ContactButtons phone={donor.phone} />
      </div>

      {showRecord && (
        <RecordDonation
          donor={donor}
          onDone={(d) => {
            setShowRecord(false);
            onUpdated(d);
          }}
        />
      )}

      <dl className="details">
        {rows.map(([k, val]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(val)}</dd>
          </div>
        ))}
      </dl>

      <h4>Donation history</h4>
      {historyError ? (
        <p className="error">{historyError}</p>
      ) : history === null ? (
        <Spinner small />
      ) : history.length === 0 ? (
        <p className="muted small">No donations recorded in the app yet.</p>
      ) : (
        <ul className="history">
          {history.map((h) => (
            <li key={h.id}>
              <strong>{formatDate(h.date)}</strong>
              {h.place && <span> · {h.place}</span>}
              {h.notes && <span className="muted"> · {h.notes}</span>}
              <span className="muted small"> (by {h.recordedBy})</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function RecordDonation({ donor, onDone }) {
  const [date, setDate] = useState(todayStr());
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await api.recordDonation(donor.id, date, place, notes));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="record-box" onSubmit={submit}>
      <h4>Record a donation by {donor.name}</h4>
      <div className="row wrap">
        <label className="field">
          <span>Date *</span>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field grow">
          <span>Camp / hospital</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} />
        </label>
        <label className="field grow">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. for patient at XYZ" maxLength={500} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn primary small" disabled={busy}>
        {busy ? <Spinner small /> : 'Save donation'}
      </button>
    </form>
  );
}
