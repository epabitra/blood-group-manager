import { useDeferredValue, useMemo, useState } from 'react';
import { AVAILABILITY, BLOOD_GROUPS } from '../constants';
import { downloadCsv, todayStr } from '../utils';
import { DonorCard, EmptyState } from './ui';

const PAGE = 50;

const SORTS = {
  name: (a, b) => String(a.name).localeCompare(String(b.name)),
  recent: (a, b) => String(b.lastDonated || '').localeCompare(String(a.lastDonated || '')),
  oldest: (a, b) => String(a.lastDonated || '').localeCompare(String(b.lastDonated || '')),
  added: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  donations: (a, b) => (Number(b.totalDonations) || 0) - (Number(a.totalDonations) || 0),
};

const CSV_COLUMNS = [
  ['Name', 'name'],
  ['Phone', 'phone'],
  ['Alternate Phone', 'altPhone'],
  ['Blood Group', 'bloodGroup'],
  ['Gender', 'gender'],
  ['Date of Birth', 'dateOfBirth'],
  ['Weight (kg)', 'weightKg'],
  ['Email', 'email'],
  ['Address', 'address'],
  ['Area', 'area'],
  ['City', 'city'],
  ['Pincode', 'pincode'],
  ['Last Donated', 'lastDonated'],
  ['Total Donations', 'totalDonations'],
  ['Availability', 'availability'],
  ['Notes', 'notes'],
  ['Registered At', 'source'],
].map(([label, key]) => ({ label, get: (d) => d[key] }));

export default function DonorList({ donors, initialGroup, onOpen, onAdd }) {
  const [group, setGroup] = useState(BLOOD_GROUPS.includes(initialGroup) ? initialGroup : '');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [availability, setAvailability] = useState('');
  const [sort, setSort] = useState('name');
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  const counts = useMemo(() => {
    const c = {};
    donors.forEach((d) => (c[d.bloodGroup] = (c[d.bloodGroup] || 0) + 1));
    return c;
  }, [donors]);

  const filtered = useMemo(() => {
    const words = q.split(/\s+/).filter(Boolean);
    return donors
      .filter(
        (d) =>
          (!group || d.bloodGroup === group) &&
          (!status || d._elig.status === status) &&
          (!availability || d.availability === availability) &&
          words.every((w) => d._search.includes(w)),
      )
      .sort(SORTS[sort]);
  }, [donors, group, status, availability, sort, q]);

  const reset = (fn) => (e) => {
    fn(e.target.value);
    setLimit(PAGE);
  };

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Donors</h2>
        <div className="row">
          <button
            className="btn ghost small"
            onClick={() => downloadCsv(`donors-${todayStr()}.csv`, CSV_COLUMNS, filtered)}
            disabled={!filtered.length}
          >
            ⬇ Export CSV
          </button>
          <button className="btn primary small" onClick={onAdd}>
            + Add donor
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          className={!group ? 'active' : ''}
          onClick={() => {
            setGroup('');
            setLimit(PAGE);
          }}
        >
          All <span>{donors.length}</span>
        </button>
        {BLOOD_GROUPS.filter((g) => counts[g] || g !== 'Unknown').map((g) => (
          <button
            key={g}
            className={group === g ? 'active' : ''}
            onClick={() => {
              setGroup(g);
              setLimit(PAGE);
            }}
          >
            {g} <span>{counts[g] || 0}</span>
          </button>
        ))}
      </div>

      <div className="filters card">
        <input
          type="search"
          placeholder="Search name, phone, area, city, pincode…"
          value={query}
          onChange={reset(setQuery)}
        />
        <select value={status} onChange={reset(setStatus)} aria-label="Eligibility">
          <option value="">Any eligibility</option>
          <option value="eligible">Eligible now</option>
          <option value="waiting">In waiting period</option>
          <option value="ineligible">Ineligible (age/weight)</option>
        </select>
        <select value={availability} onChange={reset(setAvailability)} aria-label="Availability">
          <option value="">Any availability</option>
          {AVAILABILITY.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="name">Sort: Name A–Z</option>
          <option value="oldest">Sort: Longest since donation</option>
          <option value="recent">Sort: Recently donated</option>
          <option value="added">Sort: Newly added</option>
          <option value="donations">Sort: Most donations</option>
        </select>
      </div>

      <p className="muted small">
        Showing {Math.min(limit, filtered.length)} of {filtered.length}
        {filtered.length !== donors.length && ` (filtered from ${donors.length})`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState>{donors.length ? 'No donors match these filters.' : 'No donors yet. Add your first donor.'}</EmptyState>
      ) : (
        <div className="list">
          {filtered.slice(0, limit).map((d) => (
            <DonorCard key={d.id} donor={d} onOpen={onOpen} />
          ))}
          {filtered.length > limit && (
            <button className="btn ghost block" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({filtered.length - limit} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
