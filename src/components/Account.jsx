import { useState } from 'react';
import { api } from '../api';
import { Spinner } from './ui';

export default function Account({ session, setSession, onLogout, onToast }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd.length < 8) return setError('New password must be at least 8 characters.');
    if (newPwd !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      setSession(await api.changePassword(oldPwd, newPwd));
      setOldPwd('');
      setNewPwd('');
      setConfirm('');
      onToast('Password changed. Other devices have been logged out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const { user } = session;

  return (
    <div className="stack narrow">
      <section className="card">
        <h2>My account</h2>
        <p>
          Signed in as <strong>{user.name}</strong> ({user.username}) · <span className="pill">{user.role}</span>
        </p>
        <p className="muted small">Session expires {new Date(session.expiresAt).toLocaleString()}.</p>
        <button className="btn ghost" onClick={onLogout}>
          Log out
        </button>
      </section>

      <form className="card form-stack" onSubmit={submit}>
        <h2>Change password</h2>
        <label className="field">
          <span>Current password</span>
          <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>New password (min 8 characters)</span>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" required />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? <Spinner small /> : 'Change password'}
        </button>
      </form>

      <section className="card muted small">
        <p>
          New users, password resets and disabling users are done by an admin from the Google Sheet menu{' '}
          <strong>Blood Bank</strong>.
        </p>
      </section>
    </div>
  );
}
