import { useMemo, useState } from 'react';
import { BLOOD_GROUPS, SEARCHABLE_GROUPS } from '../constants';
import { useDonorSearch } from '../useDonorSearch';
import { DonorCard, EmptyState, SearchInput, Spinner } from './ui';
import InstallCard from './InstallCard';

export default function Home({ session, perms, donors, settings, onFind, onBrowse, onAdd, onRecord, onOpen }) {
  const [query, setQuery] = useState('');
  const canView = Boolean(perms.viewDonors);
  const search = useDonorSearch(query, { canView, donors, settings });

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
  const isPhone = /^[\d\s+()-]+$/.test(query.trim());

  return (
    <div className="stack">
      <div>
        <p className="muted greeting">Hello{firstName ? `, ${firstName}` : ''} 👋</p>
        <SearchInput value={query} onChange={setQuery} placeholder="Search donor by name or phone" />
      </div>

      {query.trim() ? (
        <section>
          {search.tooShort ? (
            <p className="muted small">Type at least 3 letters of the name or 4 digits of the phone.</p>
          ) : search.loading ? (
            <p className="muted small">
              <Spinner small /> Searching…
            </p>
          ) : search.error ? (
            <p className="error">{search.error}</p>
          ) : search.results.length === 0 ? (
            <EmptyState>
              No donor found.
              {onAdd && (
                <>
                  <br />
                  <button
                    className="btn primary small mt"
                    onClick={() => onAdd(isPhone ? { phone: query.trim() } : { name: query.trim() })}
                  >
                    ＋ Add as new donor
                  </button>
                </>
              )}
            </EmptyState>
          ) : (
            <div className="list">
              <p className="muted small m0">
                {search.results.length} match{search.results.length === 1 ? '' : 'es'}
                {!canView && ' (phone numbers are hidden)'}
              </p>
              {search.results.map((d) => (
                <DonorCard
                  key={d.id}
                  donor={d}
                  onOpen={onOpen || (onRecord ? () => onRecord(d) : () => {})}
                  onRecord={onRecord ? () => onRecord(d) : undefined}
                  hideContact={!canView}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <InstallCard dismissible />
          <section className="actions">
            {canView && (
              <button className="action urgent" onClick={() => onFind()}>
                <span className="action-icon">🚨</span>
                <span className="action-title">Find Blood</span>
                <span className="action-sub">Urgent request</span>
              </button>
            )}
            {onRecord && (
              <button className={`action${canView ? '' : ' urgent'}`} onClick={() => onRecord()}>
                <span className="action-icon">🩸</span>
                <span className="action-title">Record Donation</span>
                <span className="action-sub">Someone donated</span>
              </button>
            )}
            {onAdd && (
              <button className="action" onClick={() => onAdd()}>
                <span className="action-icon">➕</span>
                <span className="action-title">Add Donor</span>
                <span className="action-sub">New person</span>
              </button>
            )}
            {canView && (
              <button className="action" onClick={() => onBrowse()}>
                <span className="action-icon">👥</span>
                <span className="action-title">All Donors</span>
                <span className="action-sub">{donors.length} saved</span>
              </button>
            )}
          </section>

          {canView ? (
            <>
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
          ) : (
            <section className="card small muted">
              <p className="m0">
                You are signed in as a <strong>{session.user.role}</strong>. You can search a donor by name or phone
                {onRecord ? ' to record a donation' : ''}
                {onAdd ? ', and add new donors' : ''}. The full donor list is only visible to authorised members.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
