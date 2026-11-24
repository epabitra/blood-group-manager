import { useDeferredValue, useMemo, useState } from 'react';
import { BLOOD_GROUPS, SEARCHABLE_GROUPS } from '../constants';
import { matchesQuery } from '../utils';
import { DonorCard, EmptyState, SearchInput } from './ui';
import InstallCard from './InstallCard';

const MAX_RESULTS = 20;

export default function Home({ session, donors, onFind, onBrowse, onAdd, onRecord, onOpen }) {
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);

  const results = useMemo(() => (q.trim() ? donors.filter((d) => matchesQuery(d, q)) : []), [donors, q]);

  const stats = useMemo(() => {
    const byGroup = {};
    BLOOD_GROUPS.forEach((g) => (byGroup[g] = { total: 0, ready: 0 }));
    let ready = 0;
    let waiting = 0;
    donors.forEach((d) => {
      const g = byGroup[d.bloodGroup] || byGroup.Unknown;
      g.total++;
      if (d._elig.status === 'eligible') {
        g.ready++;
        ready++;
      } else if (d._elig.status === 'waiting') waiting++;
    });
    return { byGroup, ready, waiting };
  }, [donors]);

  const firstName = String(session.user.name || '').split(' ')[0];

  return (
    <div className="stack">
      <div>
        <p className="muted greeting">Hello{firstName ? `, ${firstName}` : ''} 👋</p>
        <SearchInput value={query} onChange={setQuery} placeholder="Search donor by name or phone" />
      </div>

      {query.trim() ? (
        <section>
          <p className="muted small">
            {results.length} match{results.length === 1 ? '' : 'es'}
          </p>
          {results.length === 0 ? (
            <EmptyState>
              No donor found.
              <br />
              <button className="btn primary small mt" onClick={onAdd}>
                ＋ Add as new donor
              </button>
            </EmptyState>
          ) : (
            <div className="list">
              {results.slice(0, MAX_RESULTS).map((d) => (
                <DonorCard key={d.id} donor={d} onOpen={onOpen} onRecord={onRecord} />
              ))}
              {results.length > MAX_RESULTS && (
                <p className="muted small center">Showing first {MAX_RESULTS}. Type more to narrow down.</p>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          <InstallCard dismissible />
          <section className="actions">
            <button className="action urgent" onClick={() => onFind()}>
              <span className="action-icon">🚨</span>
              <span className="action-title">Find Blood</span>
              <span className="action-sub">Urgent request</span>
            </button>
            <button className="action" onClick={onRecord}>
              <span className="action-icon">🩸</span>
              <span className="action-title">Record Donation</span>
              <span className="action-sub">Someone donated</span>
            </button>
            <button className="action" onClick={onAdd}>
              <span className="action-icon">➕</span>
              <span className="action-title">Add Donor</span>
              <span className="action-sub">New person</span>
            </button>
            <button className="action" onClick={() => onBrowse()}>
              <span className="action-icon">👥</span>
              <span className="action-title">All Donors</span>
              <span className="action-sub">{donors.length} saved</span>
            </button>
          </section>

          <section className="summary">
            <div className="summary-item">
              <strong>{donors.length}</strong>
              <span>Total</span>
            </div>
            <div className="summary-item ok">
              <strong>{stats.ready}</strong>
              <span>Ready now</span>
            </div>
            <div className="summary-item warn">
              <strong>{stats.waiting}</strong>
              <span>Waiting</span>
            </div>
          </section>

          <section className="card">
            <h3>Ready donors by blood group</h3>
            <p className="muted small">Tap a group to see who can donate now.</p>
            <div className="group-grid">
              {SEARCHABLE_GROUPS.map((g) => (
                <button
                  key={g}
                  className={`group-tile${stats.byGroup[g].ready === 0 ? ' empty-group' : ''}`}
                  onClick={() => onFind(g)}
                >
                  <span className="g">{g === 'Bombay (Oh)' ? 'Bombay' : g}</span>
                  <span className="c">
                    <b>{stats.byGroup[g].ready}</b> / {stats.byGroup[g].total}
                  </span>
                </button>
              ))}
            </div>
            <p className="muted small">Ready / total</p>
          </section>
        </>
      )}
    </div>
  );
}
