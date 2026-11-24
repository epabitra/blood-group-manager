import { useDeferredValue, useMemo, useState } from 'react';
import { AVAILABILITY, BLOOD_GROUPS } from '../constants';
import { downloadCsv, matchesQuery, todayStr } from '../utils';
import { DonorCard, EmptyState, SearchInput } from './ui';

const PAGE = 40;

const SORTS = {
  name: (a, b) => String(a.name).localeCompare(String(b.name)),
  oldest: (a, b) => String(a.lastDonated || '').localeCompare(String(b.lastDonated || '')),
  recent: (a, b) => String(b.lastDonated || '').localeCompare(String(a.lastDonated || '')),
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

export default function DonorList({ donors, initialGroup, onOpen, onAdd, onRecord }) {
  const [group, setGroup] = useState(BLOOD_GROUPS.includes(initialGroup) ? initialGroup : '');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [availability, setAvailability] = useState('');
  const [sort, setSort] = useState('name');
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query);

  const counts = useMemo(() => {
    const c = {};
    donors.forEach((d) => (c[d.bloodGroup] = (c[d.bloodGroup] || 0) + 1));
    return c;
  }, [donors]);

  const filtered = useMemo(
    () =>
      donors
        .filter(
          (d) =>
            (!group || d.bloodGroup === group) &&
            (!status || d._elig.status === status) &&
            (!availability || d.availability === availability) &&
            matchesQuery(d, q),
        )
        .sort(SORTS[sort]),
    [donors, group, status, availability, sort, q],
  );

  const activeFilters = (status ? 1 : 0) + (availability ? 1 : 0) + (sort !== 'name' ? 1 : 0);
  const withReset = (fn) => (value) => {
    fn(value);
    setLimit(PAGE);
  };

  return (
    <div className="stack">
      <div className="row-between">
        <h2 className="m0">Donors</h2>
        <button className="btn primary small" onClick={onAdd}>
          ＋ Add donor
        </button>
      </div>

      <div className="sticky-search">
        <div className="row">
          <div className="grow">
            <SearchInput value={query} onChange={withReset(setQuery)} placeholder="Name, phone, area, pincode…" />
          </div>
          <button
            className={`btn filter-btn${showFilters || activeFilters ? ' on' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            ⚙{activeFilters ? <span className="badge">{activeFilters}</span> : null}
          </button>
        </div>

        <div className="chips" role="tablist">
          <button className={!group ? 'active' : ''} onClick={() => withReset(setGroup)('')}>
            All <span>{donors.length}</span>
          </button>
          {BLOOD_GROUPS.filter((g) => counts[g] || g !== 'Unknown').map((g) => (
            <button key={g} className={group === g ? 'active' : ''} onClick={() => withReset(setGroup)(g)}>
              {g === 'Bombay (Oh)' ? 'Bombay' : g} <span>{counts[g] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="card filter-panel">
          <label className="field">
            <span>Eligibility</span>
            <select value={status} onChange={(e) => withReset(setStatus)(e.target.value)}>
              <option value="">Any</option>
              <option value="eligible">Ready now</option>
              <option value="waiting">In waiting period</option>
              <option value="ineligible">Ineligible (age / weight)</option>
              <option value="unavailable">Unavailable</option>
              <option value="dnc">Do not contact</option>
            </select>
          </label>
          <label className="field">
            <span>Availability</span>
            <select value={availability} onChange={(e) => withReset(setAvailability)(e.target.value)}>
              <option value="">Any</option>
              {AVAILABILITY.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Name A–Z</option>
              <option value="oldest">Longest since donation</option>
              <option value="recent">Recently donated</option>
              <option value="added">Newly added</option>
              <option value="donations">Most donations</option>
            </select>
          </label>
          <div className="row wrap">
            <button
              className="btn ghost small"
              onClick={() => {
                setStatus('');
                setAvailability('');
                setSort('name');
              }}
            >
              Clear filters
            </button>
            <button
              className="btn ghost small"
              onClick={() => downloadCsv(`donors-${todayStr()}.csv`, CSV_COLUMNS, filtered)}
              disabled={!filtered.length}
            >
              ⬇ Export {filtered.length} to Excel (CSV)
            </button>
          </div>
        </div>
      )}

      <p className="muted small">
        {filtered.length === donors.length
          ? `${donors.length} donors`
          : `${filtered.length} of ${donors.length} donors`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState>{donors.length ? 'No donors match.' : 'No donors yet. Tap "Add donor" to start.'}</EmptyState>
      ) : (
        <div className="list">
          {filtered.slice(0, limit).map((d) => (
            <DonorCard key={d.id} donor={d} onOpen={onOpen} onRecord={onRecord} />
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
