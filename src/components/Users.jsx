import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ROLES } from '../constants';
import { copyText } from '../utils';
import { EmptyState, Modal, Spinner } from './ui';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', volunteer: 'Volunteer' };
const ROLE_ORDER = { admin: 0, manager: 1, volunteer: 2 };

/** Random easy-to-read password to share with a new user. */
function makePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function formatLogin(s) {
  if (!s) return 'Never logged in';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : `Last login ${d.toLocaleDateString()}`;
}

/** Users page: admin manages everyone; a manager with permission manages volunteers only. */
export default function Users({ session, onToast }) {
  const isAdmin = session.user.role === 'admin';
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // user object, or {} for a new user
  const [busyUser, setBusyUser] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await api.listUsers();
      list.sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.displayName.localeCompare(b.displayName),
      );
      setUsers(list);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (u) => {
    setBusyUser(u.username);
    try {
      await api.saveUser({ username: u.username, displayName: u.displayName, role: u.role, active: !u.active });
      onToast(u.active ? `${u.displayName} deactivated and logged out` : `${u.displayName} activated`);
      await load();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusyUser('');
    }
  };

  const activeCount = users ? users.filter((u) => u.active).length : 0;

  return (
    <div className="stack narrow">
      <div className="row-between">
        <div>
          <a href="#/settings" className="back-link">
            ← Settings
          </a>
          <h2 className="m0">Users</h2>
        </div>
        <button className="btn primary small" onClick={() => setEditing({})}>
          ＋ Add user
        </button>
      </div>
      <p className="muted small m0">
        {isAdmin
          ? 'Deactivate anyone who should no longer have access. They are logged out of every device immediately.'
          : 'You can add volunteers and activate / deactivate them.'}
      </p>

      {error && <p className="error">{error}</p>}
      {!users && !error && (
        <p className="muted">
          <Spinner small /> Loading users…
        </p>
      )}
      {users && users.length === 0 && <EmptyState>No users yet.</EmptyState>}
      {users && users.length > 0 && (
        <>
          <p className="muted small m0">
            {activeCount} active · {users.length - activeCount} deactivated
          </p>
          <div className="list">
            {users.map((u) => {
              const self = u.username === session.user.username;
              return (
                <div key={u.username} className={`user-card${u.active ? '' : ' inactive'}`}>
                  <div className="avatar small">{(u.displayName || u.username).charAt(0).toUpperCase()}</div>
                  <div className="grow user-main">
                    <div className="donor-name">
                      {u.displayName} {self && <span className="muted small">(you)</span>}
                    </div>
                    <div className="muted small">{u.username}</div>
                    <div className="row wrap user-tags">
                      <span className={`pill role-${u.role}`}>{ROLE_LABEL[u.role]}</span>
                      <span className={`pill ${u.active ? 'pill-eligible' : 'pill-dnc'}`}>
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                      <span className="muted small">{formatLogin(u.lastLogin)}</span>
                    </div>
                  </div>
                  <div className="user-actions">
                    {!self && (
                      <label className="toggle" title={u.active ? 'Deactivate' : 'Activate'}>
                        <input
                          type="checkbox"
                          checked={u.active}
                          disabled={busyUser === u.username}
                          onChange={() => toggleActive(u)}
                        />
                        <span className="toggle-track" />
                      </label>
                    )}
                    <button className="btn ghost small" onClick={() => setEditing(u)}>
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing && (
        <UserForm
          user={editing}
          isAdmin={isAdmin}
          isSelf={editing.username === session.user.username}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onToast(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserForm({ user, isAdmin, isSelf, onClose, onSaved }) {
  const isNew = !user.username;
  const roles = isAdmin ? ROLES : ['volunteer'];
  const [username, setUsername] = useState(user.username || '');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [role, setRole] = useState(user.role || 'volunteer');
  const [password, setPassword] = useState(isNew ? makePassword() : '');
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isNew && password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await api.saveUser({
        isNew,
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        role,
        active: isNew ? true : user.active,
        password: isNew ? password : undefined,
      });
      onSaved(isNew ? `User ${username} created. Share the password privately.` : 'User updated');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await api.resetUserPassword(user.username, password);
      onSaved(`Password reset for ${user.displayName}. They have been logged out.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const copy = async () => {
    if (await copyText(`Blood Group Manager login\nUsername: ${username}\nPassword: ${password}\n${window.location.origin}${window.location.pathname}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      title={isNew ? 'Add user' : `Edit ${user.displayName}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error grow">{error}</p>}
          <button className="btn ghost" onClick={onClose} disabled={busy} type="button">
            Cancel
          </button>
          <button className="btn primary grow" type="submit" form="user-form" disabled={busy}>
            {busy ? <Spinner small /> : isNew ? 'Create user' : 'Save'}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Username (used to log in) *</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!isNew}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. ravi or ravi@gmail.com"
          />
        </label>
        <label className="field">
          <span>Name *</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={100} />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf || roles.length === 1}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <small className="muted">
            {role === 'admin'
              ? 'Admin can do everything, including managing users and permissions.'
              : 'What this role can do is set on the Permissions page.'}
          </small>
        </label>

        {isNew && (
          <PasswordField password={password} setPassword={setPassword} onCopy={copy} copied={copied} />
        )}
      </form>

      {!isNew && (
        <div className="reset-box">
          {resetting ? (
            <>
              <PasswordField password={password} setPassword={setPassword} onCopy={copy} copied={copied} />
              <div className="row wrap">
                <button className="btn primary small" onClick={resetPassword} disabled={busy} type="button">
                  Set new password
                </button>
                <button className="btn ghost small" onClick={() => setResetting(false)} disabled={busy} type="button">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              className="btn ghost small"
              type="button"
              onClick={() => {
                setPassword(makePassword());
                setResetting(true);
              }}
            >
              🔑 Reset password
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

function PasswordField({ password, setPassword, onCopy, copied }) {
  return (
    <label className="field">
      <span>Password (min 8 characters)</span>
      <div className="input-with-btn">
        <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" spellCheck={false} />
        <button type="button" className="btn ghost small" onClick={() => setPassword(makePassword())}>
          New
        </button>
      </div>
      <button type="button" className="btn ghost small copy-btn" onClick={onCopy}>
        {copied ? '✓ Copied' : '📋 Copy login details to share'}
      </button>
    </label>
  );
}
