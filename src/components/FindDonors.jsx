import { useDeferredValue, useMemo, useState } from 'react';
import { COMPATIBLE_DONORS, SEARCHABLE_GROUPS } from '../constants';
import { copyText } from '../utils';
import { DonorCard, EmptyState } from './ui';

const STATUS_ORDER = { eligible: 0, waiting: 1, unavailable: 2, ineligible: 3, dnc: 4 };
const PAGE = 60;

export default function FindDonors({ donors, group, onGroup, onOpen }) {
  const [includeCompatible, setIncludeCompatible] = useState(true);
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [place, setPlace] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [copied, setCopied] = useState(false);
  const deferredPlace = useDeferredValue(place.trim().toLowerCase());

  const valid = SEARCHABLE_GROUPS.includes(group);
  const groups = valid ? (includeCompatible ? COMPATIBLE_DONORS[group] : [group]) : [];

  const results = useMemo(() => {
    if (!valid) return [];
    const allowed = new Set(includeCompatible ? COMPATIBLE_DONORS[group] : [group]);
    return donors
      .filter((d) => allowed.has(d.bloodGroup))
      .filter((d) => d._elig.status !== 'dnc')
      .filter((d) => !eligibleOnly || d._elig.status === 'eligible')
      .filter((d) => !deferredPlace || d._search.includes(deferredPlace))
      .sort(
        (a, b) =>
          (a.bloodGroup === group ? 0 : 1) - (b.bloodGroup === group ? 0 : 1) ||
          STATUS_ORDER[a._elig.status] - STATUS_ORDER[b._elig.status] ||
          // Donors who gave longest ago (or never) first.
          String(a.lastDonated || '').localeCompare(String(b.lastDonated || '')),
      );
  }, [donors, group, valid, includeCompatible, eligibleOnly, deferredPlace]);

  const message = valid
    ? `Hello, this is from our blood donation group. A patient urgently needs ${group} blood. Are you available to donate? Please reply.`
    : '';

  const copyList = async () => {
    const text = results
      .map((d, i) => `${i + 1}. ${d.name} (${d.bloodGroup}) - ${d.phone}${d.area ? ' - ' + d.area : ''}`)
      .join('\n');
    if (await copyText(`${group} donors:\n${text}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Find donors for a patient</h2>
        <p className="muted">Patient's blood group:</p>
        <div className="group-grid compact">
          {SEARCHABLE_GROUPS.map((g) => (
            <button
              key={g}
              className={`group-btn${g === group ? ' selected' : ''}`}
              onClick={() => {
                setLimit(PAGE);
                onGroup(g);
              }}
            >
              <span className="g">{g}</span>
            </button>
          ))}
        </div>

        {valid && (
          <div className="filters">
            <input
              type="search"
              placeholder="Filter by area, city, pincode…"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
            <label className="check">
              <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} />
              Eligible now only
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={includeCompatible}
                onChange={(e) => setIncludeCompatible(e.target.checked)}
              />
              Include compatible groups
            </label>
          </div>
        )}
        {valid && includeCompatible && (
          <p className="muted small">
            Can receive red cells / whole blood from: <strong>{groups.join(', ')}</strong>. Exact match is shown first.
            The blood bank will always cross-match before transfusion.
          </p>
        )}
      </section>

      {valid && (
        <section>
          <div className="row-between">
            <h3>
              {results.length} donor{results.length === 1 ? '' : 's'} found
            </h3>
            {results.length > 0 && (
              <button className="btn small ghost" onClick={copyList}>
                {copied ? '✓ Copied' : '📋 Copy list'}
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <EmptyState>
              No donors match.{' '}
              {eligibleOnly && 'Try unticking "Eligible now only" to see donors who will be eligible soon.'}
            </EmptyState>
          ) : (
            <div className="list">
              {results.slice(0, limit).map((d) => (
                <DonorCard
                  key={d.id}
                  donor={d}
                  onOpen={onOpen}
                  message={message}
                  highlight={d.bloodGroup === group}
                />
              ))}
              {results.length > limit && (
                <button className="btn ghost block" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({results.length - limit} remaining)
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
