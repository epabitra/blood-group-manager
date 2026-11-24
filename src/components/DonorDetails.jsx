import { useEffect, useState } from 'react';
import { api } from '../api';
import { ageFrom, formatDate, gapDays, timeAgo } from '../utils';
import { BloodBadge, ContactButtons, Modal, Spinner, StatusPill } from './ui';

export default function DonorDetails({ donor, settings, canEdit, canDelete, canRecord, onClose, onEdit, onRecord, onDeleted }) {
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setHistory(null);
    setHistoryError('');
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
  const place = [donor.area, donor.city, donor.pincode].filter(Boolean).join(', ');
  const rows = [
    ['Phone', donor.phone],
    ['Alternate phone', donor.altPhone],
    ['Gender', donor.gender],
    ['Age', age !== null ? `${age} years (born ${formatDate(donor.dateOfBirth)})` : ''],
    ['Weight', donor.weightKg ? `${donor.weightKg} kg` : ''],
    ['Email', donor.email],
    ['Address', donor.address],
    ['Area', place],
    ['Last donated', donor.lastDonated ? `${formatDate(donor.lastDonated)} (${timeAgo(donor.lastDonated)})` : 'Never / unknown'],
    ['Total donations', donor.totalDonations || 0],
    ['Waiting period', `${gapDays(donor.gender, settings)} days`],
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
        canEdit || canRecord ? (
          <>
            {canEdit && (
              <button className="btn ghost" onClick={onEdit}>
                ✎ Edit
              </button>
            )}
            {canRecord && (
              <button className="btn primary grow" onClick={onRecord}>
                ＋ Record donation
              </button>
            )}
          </>
        ) : null
      }
    >
      <div className="details-head">
        <BloodBadge group={donor.bloodGroup} large />
        <div className="grow">
          <h3>{donor.name}</h3>
          <StatusPill elig={donor._elig} />
          {donor._elig.nextDate && <p className="muted small">Can donate from {formatDate(donor._elig.nextDate)}</p>}
        </div>
      </div>
      <ContactButtons phone={donor.phone} />

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

      {canDelete && (
        <div className="danger-zone">
          {error && <p className="error">{error}</p>}
          {confirmDelete ? (
            <div className="warning">
              Delete {donor.name} permanently?
              <button className="btn small danger" onClick={remove} disabled={busy}>
                {busy ? <Spinner small /> : 'Yes, delete'}
              </button>
              <button className="btn small ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                No
              </button>
            </div>
          ) : (
            <button className="btn ghost small danger-text" onClick={() => setConfirmDelete(true)}>
              Delete this donor
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
