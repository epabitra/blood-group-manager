import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getCachedData, getSession, saveCachedData, setSessionLostHandler, toDonors } from './api';
import { DEFAULT_SETTINGS } from './constants';
import { eligibility, searchText } from './utils';
import Login from './components/Login';
import Home from './components/Home';
import FindDonors from './components/FindDonors';
import DonorList from './components/DonorList';
import DonorForm from './components/DonorForm';
import DonorDetails from './components/DonorDetails';
import RecordDonation from './components/RecordDonation';
import Settings from './components/Settings';
import { Spinner } from './components/ui';

export default function App() {
  const [auth, setAuth] = useState(() => ({ session: getSession(), bootstrap: null }));

  useEffect(() => {
    setSessionLostHandler(() => setAuth({ session: null, bootstrap: null }));
  }, []);

  if (!auth.session) return <Login onLogin={(session, bootstrap) => setAuth({ session, bootstrap })} />;
  return (
    <Main
      key={auth.session.user.username}
      session={auth.session}
      initialData={auth.bootstrap}
      setSession={(session) => setAuth({ session, bootstrap: null })}
    />
  );
}

const VIEWS = ['home', 'find', 'donors', 'settings'];

function readHash() {
  const [view, param] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { view: VIEWS.includes(view) ? view : 'home', param: param ? decodeURIComponent(param) : '' };
}

function Main({ session, initialData, setSession }) {
  const username = session.user.username;
  const cached = useRef(initialData ? null : getCachedData(username)).current;

  const [route, setRoute] = useState(readHash);
  const [settings, setSettings] = useState(
    initialData?.settings || cached?.settings || DEFAULT_SETTINGS,
  );
  const [rawDonors, setRawDonors] = useState(() =>
    initialData ? toDonors(initialData.donors) : cached?.donors || null,
  );
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSync, setLastSync] = useState(initialData ? Date.now() : cached?.savedAt || null);

  const [editing, setEditing] = useState(null); // donor object for the form, or null
  const [viewingId, setViewingId] = useState(null);
  const [recording, setRecording] = useState(null); // { donorId } or null
  const [toast, setToast] = useState('');

  const isAdmin = session.user.role === 'admin';

  // Search text and eligibility are computed once per donor here, so screens stay fast.
  const donors = useMemo(
    () => (rawDonors || []).map((d) => ({ ...d, _search: searchText(d), _elig: eligibility(d, settings) })),
    [rawDonors, settings],
  );

  // Keep the on-device copy in sync with every change.
  useEffect(() => {
    if (rawDonors) saveCachedData(username, settings, rawDonors);
  }, [rawDonors, settings, username]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (view, param) => {
    window.location.hash = `/${view}${param ? '/' + encodeURIComponent(param) : ''}`;
    window.scrollTo(0, 0);
  };

  const sync = useCallback(async (fresh) => {
    setSyncing(true);
    setSyncError('');
    try {
      const data = await api.bootstrap(fresh);
      setSettings(data.settings);
      setRawDonors(toDonors(data.donors));
      setLastSync(Date.now());
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Show the saved copy instantly, then fetch the latest data in the background.
  useEffect(() => {
    if (!initialData) sync(false);
  }, [initialData, sync]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Update the local list after a save instead of reloading everything.
  const upsert = (donor) => {
    setRawDonors((list) => {
      const i = list.findIndex((d) => d.id === donor.id);
      if (i === -1) return [donor, ...list];
      const copy = list.slice();
      copy[i] = donor;
      return copy;
    });
  };
  const remove = (id) => setRawDonors((list) => list.filter((d) => d.id !== id));

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* session is cleared locally anyway */
    }
    window.location.hash = '';
    setSession(null);
  };

  const openRecord = (donorId) => setRecording({ donorId: donorId || null });
  const viewing = viewingId ? donors.find((d) => d.id === viewingId) : null;

  let content;
  if (!rawDonors) {
    content = syncError ? (
      <div className="center-box">
        <p className="error">{syncError}</p>
        <button className="btn primary" onClick={() => sync(true)}>
          Try again
        </button>
      </div>
    ) : (
      <div className="center-box">
        <Spinner /> <p className="muted">Loading donors…</p>
      </div>
    );
  } else if (route.view === 'find') {
    content = (
      <FindDonors
        donors={donors}
        group={route.param}
        onGroup={(g) => window.location.replace(`#/find/${encodeURIComponent(g)}`)}
        onOpen={setViewingId}
      />
    );
  } else if (route.view === 'donors') {
    content = (
      <DonorList
        donors={donors}
        initialGroup={route.param}
        onOpen={setViewingId}
        onAdd={() => setEditing({})}
        onRecord={openRecord}
      />
    );
  } else if (route.view === 'settings') {
    content = (
      <Settings
        session={session}
        isAdmin={isAdmin}
        settings={settings}
        onSettingsSaved={(s) => {
          setSettings(s);
          setToast('Settings saved');
        }}
        setSession={setSession}
        onLogout={logout}
        onToast={setToast}
        lastSync={lastSync}
        donorCount={donors.length}
      />
    );
  } else {
    content = (
      <Home
        session={session}
        donors={donors}
        onFind={(g) => go('find', g)}
        onBrowse={(g) => go('donors', g)}
        onAdd={() => setEditing({})}
        onRecord={() => openRecord()}
        onOpen={setViewingId}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/home">
          <img src="./favicon.svg" alt="" width="24" height="24" />
          <span>Blood Group Manager</span>
        </a>
        <button
          className="sync-btn"
          onClick={() => sync(true)}
          disabled={syncing}
          aria-label="Refresh data"
          title={syncError || 'Refresh data'}
        >
          {syncing ? <Spinner small /> : syncError ? '⚠' : '↻'}
        </button>
      </header>

      {syncError && rawDonors && (
        <div className="banner" onClick={() => sync(true)}>
          Couldn't update: {syncError} <u>Tap to retry</u>
        </div>
      )}

      <main className="container">{content}</main>

      <nav className="bottom-nav" aria-label="Main">
        <NavItem href="#/home" active={route.view === 'home'} icon="⌂" label="Home" />
        <NavItem href="#/find" active={route.view === 'find'} icon="🔍" label="Find Blood" />
        <button className="nav-record" onClick={() => openRecord()} aria-label="Record donation">
          <span className="plus">＋</span>
          <span className="label">Donation</span>
        </button>
        <NavItem href="#/donors" active={route.view === 'donors'} icon="👥" label="Donors" />
        <NavItem href="#/settings" active={route.view === 'settings'} icon="⚙" label="Settings" />
      </nav>

      {editing && (
        <DonorForm
          donor={editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            upsert(d);
            setEditing(null);
            setToast(editing.id ? 'Donor updated' : 'Donor added');
          }}
        />
      )}
      {viewing && !editing && !recording && (
        <DonorDetails
          donor={viewing}
          settings={settings}
          isAdmin={isAdmin}
          onClose={() => setViewingId(null)}
          onEdit={() => setEditing(viewing)}
          onRecord={() => openRecord(viewing.id)}
          onDeleted={() => {
            remove(viewing.id);
            setViewingId(null);
            setToast('Donor deleted');
          }}
        />
      )}
      {recording && (
        <RecordDonation
          donors={donors}
          initialDonorId={recording.donorId}
          onClose={() => setRecording(null)}
          onAddDonor={() => {
            setRecording(null);
            setEditing({});
          }}
          onSaved={(d) => {
            upsert(d);
            setRecording(null);
            setToast(`Donation recorded for ${d.name}`);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavItem({ href, active, icon, label }) {
  return (
    <a href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
      <span className="icon" aria-hidden="true">
        {icon}
      </span>
      <span className="label">{label}</span>
    </a>
  );
}
