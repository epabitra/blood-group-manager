import { useMemo } from 'react';
import { BLOOD_GROUPS, SEARCHABLE_GROUPS } from '../constants';

export default function Dashboard({ donors, onFind, onBrowse, onAdd }) {
  const stats = useMemo(() => {
    const byGroup = {};
    BLOOD_GROUPS.forEach((g) => (byGroup[g] = { total: 0, eligible: 0 }));
    let eligible = 0;
    let waiting = 0;
    let unavailable = 0;
    donors.forEach((d) => {
      const g = byGroup[d.bloodGroup] || byGroup.Unknown;
      g.total++;
      if (d._elig.status === 'eligible') {
        g.eligible++;
        eligible++;
      } else if (d._elig.status === 'waiting') waiting++;
      else unavailable++;
    });
    return { byGroup, eligible, waiting, unavailable };
  }, [donors]);

  return (
    <div className="stack">
      <section className="card urgent">
        <h2>🚨 Need blood urgently?</h2>
        <p className="muted">Tap the patient's blood group to see donors who can give right now.</p>
        <div className="group-grid">
          {SEARCHABLE_GROUPS.map((g) => (
            <button key={g} className="group-btn" onClick={() => onFind(g)}>
              <span className="g">{g}</span>
              <span className="c">{stats.byGroup[g].eligible} ready</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stat-row">
        <Stat label="Total donors" value={donors.length} onClick={() => onBrowse()} />
        <Stat label="Eligible now" value={stats.eligible} tone="ok" />
        <Stat label="In waiting period" value={stats.waiting} tone="warn" />
        <Stat label="Unavailable / ineligible" value={stats.unavailable} tone="muted" />
      </section>

      <section className="card">
        <div className="row-between">
          <h2>Donors by blood group</h2>
          <button className="btn primary small" onClick={onAdd}>
            + Add donor
          </button>
        </div>
        <table className="group-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Total</th>
              <th>Eligible now</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {BLOOD_GROUPS.filter((g) => g !== 'Unknown' || stats.byGroup[g].total > 0).map((g) => (
              <tr key={g}>
                <td>
                  <strong>{g}</strong>
                </td>
                <td>{stats.byGroup[g].total}</td>
                <td>{stats.byGroup[g].eligible}</td>
                <td className="right">
                  <button className="btn ghost small" onClick={() => onBrowse(g)}>
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, tone, onClick }) {
  return (
    <div className={`stat ${tone || ''}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
