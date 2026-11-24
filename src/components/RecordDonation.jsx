import { useState } from 'react';
import { api } from '../api';
import { useDonorSearch } from '../useDonorSearch';
import { eligibility, formatDate, timeAgo, todayStr } from '../utils';
import { BloodBadge, EmptyState, Modal, SearchInput, Spinner, StatusPill } from './ui';

/**
 * Two steps: search a donor (name / phone) → enter date and place → save.
 * initialDonor: a donor object from a server search (users who can't view the full list).
 */
export default function RecordDonation({
  donors,
  canView,
  settings,
  initialDonorId,
  initialDonor,
  onClose,
  onSaved,
  onAddDonor,
}) {
  const [picked, setPicked] = useState(initialDonor || null);
  const [donorId, setDonorId] = useState(initialDonor ? null : initialDonorId);
  const donor = picked || (donorId ? donors.find((d) => d.id === donorId) : null);
  const startedWithDonor = Boolean(initialDonor || initialDonorId);

  return donor ? (
    <DonationForm
      donor={donor}
      settings={settings}
      onBack={
        startedWithDonor
          ? onClose
          : () => {
              setPicked(null);
              setDonorId(null);
            }
      }
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : (
    <DonorPicker
      donors={donors}
      canView={canView}
      settings={settings}
      onPick={setPicked}
      onClose={onClose}
      onAddDonor={onAddDonor}
    />
  );
}

function DonorPicker({ donors, canView, settings, onPick, onClose, onAddDonor }) {
  const [query, setQuery] = useState('');
  const { results, loading, error, tooShort } = useDonorSearch(query, { canView, donors, settings, limit: 25 });

  return (
    <Modal title="Record donation" onClose={onClose}>
      <p className="muted small">Who donated? Search by name or phone number.</p>
      <SearchInput value={query} onChange={setQuery} placeholder="Name or phone" autoFocus />
      {onAddDonor && (
        <button className="btn ghost small mt" onClick={() => onAddDonor(query.trim())}>
          ＋ First-time donor? Add them + record donation
        </button>
      )}

      <div className="pick-list">
        {!query.trim() ? (
          <p className="muted small center">Start typing to find the donor.</p>
        ) : tooShort ? (
          <p className="muted small center">Type at least 3 letters of the name or 4 digits of the phone.</p>
        ) : loading ? (
          <p className="muted small center">
            <Spinner small /> Searching…
          </p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : results.length === 0 ? (
          <EmptyState>
            No donor found.
            {onAddDonor && (
              <>
                <br />
                <button className="btn primary small mt" onClick={() => onAddDonor(query.trim())}>
                  ＋ New donor + record donation
                </button>
              </>
            )}
          </EmptyState>
        ) : (
          results.map((d) => (
            <button key={d.id} className="pick-item" onClick={() => onPick(d)}>
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

function DonationForm({ donor, settings, onBack, onClose, onSaved }) {
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

  const elig = donor._elig || eligibility(donor, settings);
  const waiting = elig.status === 'waiting';

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
          <StatusPill elig={elig} />
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
