import { useDeferredValue, useMemo, useState } from 'react';
import { api } from '../api';
import { formatDate, matchesQuery, timeAgo, todayStr } from '../utils';
import { BloodBadge, EmptyState, Modal, SearchInput, Spinner, StatusPill } from './ui';

const MAX_RESULTS = 25;

/** Two steps: search a donor (name / phone) → enter date and place → save. */
export default function RecordDonation({ donors, initialDonorId, onClose, onSaved, onAddDonor }) {
  const [donorId, setDonorId] = useState(initialDonorId);
  const donor = donorId ? donors.find((d) => d.id === donorId) : null;

  return donor ? (
    <DonationForm
      donor={donor}
      onBack={initialDonorId ? onClose : () => setDonorId(null)}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : (
    <DonorPicker donors={donors} onPick={setDonorId} onClose={onClose} onAddDonor={onAddDonor} />
  );
}

function DonorPicker({ donors, onPick, onClose, onAddDonor }) {
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return donors.filter((d) => matchesQuery(d, q)).slice(0, MAX_RESULTS);
  }, [donors, q]);

  return (
    <Modal title="Record donation" onClose={onClose}>
      <p className="muted small">Who donated? Search by name or phone number.</p>
      <SearchInput value={query} onChange={setQuery} placeholder="Name or phone" autoFocus />

      <div className="pick-list">
        {!q.trim() ? (
          <p className="muted small center">Start typing to find the donor.</p>
        ) : results.length === 0 ? (
          <EmptyState>
            No donor found.
            <br />
            <button className="btn primary small mt" onClick={onAddDonor}>
              ＋ Add new donor first
            </button>
          </EmptyState>
        ) : (
          results.map((d) => (
            <button key={d.id} className="pick-item" onClick={() => onPick(d.id)}>
              <BloodBadge group={d.bloodGroup} />
              <span className="pick-main">
                <span className="donor-name">{d.name}</span>
                <span className="muted small">
                  {d.phone} · Last: {timeAgo(d.lastDonated)}
                </span>
              </span>
              <span className="chev">›</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

function DonationForm({ donor, onBack, onClose, onSaved }) {
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
      onSaved(await api.recordDonation(donor.id, date, place, notes));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const waiting = donor._elig.status === 'waiting';

  return (
    <Modal
      title="Record donation"
      onClose={onBack}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy} type="button">
            Cancel
          </button>
          <button className="btn primary grow" type="submit" form="donation-form" disabled={busy}>
            {busy ? <Spinner small /> : '✓ Save donation'}
          </button>
        </>
      }
    >
      <div className="picked">
        <BloodBadge group={donor.bloodGroup} large />
        <div>
          <div className="donor-name">{donor.name}</div>
          <div className="muted small">{donor.phone}</div>
          <div className="muted small">
            Last donated: {donor.lastDonated ? formatDate(donor.lastDonated) : 'never / unknown'} · Total:{' '}
            {donor.totalDonations || 0}
          </div>
          <StatusPill elig={donor._elig} />
        </div>
      </div>

      {waiting && (
        <p className="warning">
          This donor is still in the waiting period. Save only if they really donated on this date.
        </p>
      )}

      <form id="donation-form" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Donation date *</span>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Camp / hospital</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. City Hospital" maxLength={200} />
        </label>
        <label className="field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. for patient Ramesh" maxLength={500} />
        </label>
        {error && <p className="error">{error}</p>}
      </form>
    </Modal>
  );
}
