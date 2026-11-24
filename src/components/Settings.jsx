import { useState } from 'react';
import { api } from '../api';
import { DEFAULT_SETTINGS } from '../constants';
import { Spinner } from './ui';
import InstallCard from './InstallCard';

const RULES = [
  { key: 'gapMale', label: 'Waiting period – men', unit: 'days', min: 30, max: 730 },
  { key: 'gapFemale', label: 'Waiting period – women', unit: 'days', min: 30, max: 730 },
  { key: 'gapOther', label: 'Waiting period – other / not set', unit: 'days', min: 30, max: 730 },
  { key: 'minAge', label: 'Minimum age', unit: 'years', min: 16, max: 30 },
  { key: 'maxAge', label: 'Maximum age', unit: 'years', min: 50, max: 80 },
  { key: 'minWeight', label: 'Minimum weight', unit: 'kg', min: 30, max: 80 },
];

export default function Settings({
  session,
  isAdmin,
  settings,
  onSettingsSaved,
  setSession,
  onLogout,
  onToast,
  lastSync,
  donorCount,
}) {
  const { user } = session;

  return (
    <div className="stack narrow">
      <section className="card profile">
        <div className="avatar">{String(user.name || user.username).charAt(0).toUpperCase()}</div>
        <div className="grow">
          <div className="donor-name">{user.name}</div>
          <div className="muted small">{user.username}</div>
          <span className="pill">{user.role}</span>
        </div>
        <button className="btn ghost small" onClick={onLogout}>
          Log out
        </button>
      </section>

      <InstallCard />

      {/* key: reset the form when newer settings arrive from the server */}
      <EligibilityRules key={JSON.stringify(settings)} isAdmin={isAdmin} settings={settings} onSaved={onSettingsSaved} />

      <ChangePassword setSession={setSession} onToast={onToast} />

      <section className="card small">
        <h3>About this device</h3>
        <p className="muted">
          {donorCount} donors saved on this phone for fast opening
          {lastSync ? `, last updated ${new Date(lastSync).toLocaleString()}` : ''}. The copy is deleted when you log
          out.
        </p>
        <p className="muted">
          Login stays active for 7 days on this device. New users and password resets are done by an admin from the
          Google Sheet menu <strong>Blood Bank</strong>.
        </p>
      </section>
    </div>
  );
}

function EligibilityRules({ isAdmin, settings, onSaved }) {
  const [values, setValues] = useState(() => ({ ...settings }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const changed = RULES.some((r) => String(values[r.key]) !== String(settings[r.key]));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    for (const r of RULES) {
      const v = Number(values[r.key]);
      if (!Number.isInteger(v) || v < r.min || v > r.max) {
        return setError(`${r.label} must be between ${r.min} and ${r.max} ${r.unit}.`);
      }
    }
    setBusy(true);
    try {
      const saved = await api.saveSettings(values);
      setValues(saved);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-stack" onSubmit={save}>
      <div>
        <h3>Donation eligibility rules</h3>
        <p className="muted small">
          Used to decide who is "Ready now". Changes apply to everyone using the app.
          {!isAdmin && ' Only an admin can change these.'}
        </p>
      </div>

      <div className="rules">
        {RULES.map((r) => (
          <label key={r.key} className="rule">
            <span>{r.label}</span>
            <span className="rule-input">
              <input
                type="number"
                inputMode="numeric"
                min={r.min}
                max={r.max}
                step="1"
                value={values[r.key]}
                disabled={!isAdmin}
                onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
              />
              <small>{r.unit}</small>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {isAdmin && (
        <div className="row wrap">
          <button className="btn primary" disabled={busy || !changed}>
            {busy ? <Spinner small /> : 'Save rules'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setValues({ ...DEFAULT_SETTINGS })}
            disabled={busy}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </form>
  );
}

function ChangePassword({ setSession, onToast }) {
  const [open, setOpen] = useState(false);
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
      const s = await api.changePassword(oldPwd, newPwd);
      setOpen(false);
      setOldPwd('');
      setNewPwd('');
      setConfirm('');
      onToast('Password changed. Other devices have been logged out.');
      setSession(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="card row-between">
        <h3 className="m0">Password</h3>
        <button className="btn ghost small" onClick={() => setOpen(true)}>
          Change password
        </button>
      </section>
    );
  }

  return (
    <form className="card form-stack" onSubmit={submit}>
      <h3>Change password</h3>
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
      <div className="row wrap">
        <button className="btn primary" disabled={busy}>
          {busy ? <Spinner small /> : 'Change password'}
        </button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
