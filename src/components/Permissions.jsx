import { useState } from 'react';
import { api } from '../api';
import { PERMISSIONS } from '../constants';
import { Spinner } from './ui';

const ROLES = [
  { key: 'manager', label: 'Manager' },
  { key: 'volunteer', label: 'Volunteer' },
];

/** Admin-only: choose what managers and volunteers may do. The server enforces these. */
export default function Permissions({ rolePermissions, onSaved }) {
  const [values, setValues] = useState(() => rolePermissions && JSON.parse(JSON.stringify(rolePermissions)));
  const [role, setRole] = useState('volunteer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!values) {
    return (
      <div className="center-box">
        <p className="muted">Permissions are not available. Update the backend (Code.gs) and tap ↻ to refresh.</p>
      </div>
    );
  }

  const current = values[role];
  const changed = JSON.stringify(values) !== JSON.stringify(rolePermissions);

  const toggle = (key) => {
    setValues((old) => {
      const next = { ...old, [role]: { ...old[role], [key]: !old[role][key] } };
      // Editing, deleting, exporting and importing are impossible without seeing donors.
      if (key === 'viewDonors' && !next[role].viewDonors) {
        PERMISSIONS.filter((p) => p.needsView).forEach((p) => (next[role][p.key] = false));
      }
      if (PERMISSIONS.find((p) => p.key === key).needsView && next[role][key]) next[role].viewDonors = true;
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = await api.savePermissions(values);
      setValues(saved);
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack narrow">
      <div>
        <a href="#/settings" className="back-link">
          ← Settings
        </a>
        <h2 className="m0">Permissions</h2>
        <p className="muted small">
          Choose what each role can do. <strong>Admin</strong> can always do everything. Changes apply immediately to
          everyone with that role.
        </p>
      </div>

      <div className="chips" role="tablist">
        {ROLES.map((r) => (
          <button key={r.key} className={role === r.key ? 'active' : ''} onClick={() => setRole(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <section className="card perm-list">
        {PERMISSIONS.map((p) => (
          <label key={p.key} className="perm-row">
            <span className="grow">
              <strong>{p.label}</strong>
              {p.hint && <small className="muted">{p.hint}</small>}
              {p.needsView && <small className="muted">Needs “See donor list”.</small>}
            </span>
            <span className="toggle">
              <input type="checkbox" checked={Boolean(current[p.key])} onChange={() => toggle(p.key)} />
              <span className="toggle-track" />
            </span>
          </label>
        ))}
      </section>

      {!current.viewDonors && (
        <p className="muted small">
          🔒 {ROLES.find((r) => r.key === role).label}s cannot see the donor list or phone numbers. They can only search a
          person by name or phone (max 10 results, phones hidden) to record a donation or avoid adding a duplicate.
          Nothing about donors is stored on their phone.
        </p>
      )}

      {error && <p className="error">{error}</p>}
      <div className="row wrap">
        <button className="btn primary" onClick={save} disabled={busy || !changed}>
          {busy ? <Spinner small /> : 'Save permissions'}
        </button>
        {changed && (
          <button className="btn ghost" onClick={() => setValues(JSON.parse(JSON.stringify(rolePermissions)))} disabled={busy}>
            Undo changes
          </button>
        )}
      </div>
    </div>
  );
}
