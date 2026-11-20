import { useState } from 'react';
import { api } from '../api';
import { Spinner } from './ui';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="./favicon.svg" alt="" width="56" height="56" />
        <h1>Blood Group Manager</h1>
        <p className="muted">Authorised volunteers only. Please sign in.</p>

        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <div className="input-with-btn">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="button" className="btn ghost small" onClick={() => setShowPwd((s) => !s)}>
              {showPwd ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner small /> : 'Sign in'}
        </button>
        <p className="muted small">Forgot password? Ask your admin to reset it.</p>
      </form>
    </div>
  );
}
