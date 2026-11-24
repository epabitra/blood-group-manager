import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getCachedData, getSession, saveCachedData, setSessionLostHandler, toDonors } from './api';
import { DEFAULT_SETTINGS, legacyPermissions } from './constants';
import { eligibility, searchText } from './utils';
import Login from './components/Login';
import Home from './components/Home';
import FindDonors from './components/FindDonors';
import DonorList from './components/DonorList';
import DonorForm from './components/DonorForm';
import DonorDetails from './components/DonorDetails';
import RecordDonation from './components/RecordDonation';
import Settings from './components/Settings';
import Users from './components/Users';
import Permissions from './components/Permissions';
import ImportDonors from './components/ImportDonors';
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

const VIEWS = ['home', 'find', 'donors', 'settings', 'users', 'permissions', 'import'];

function readHash() {
  const [view, param] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { view: VIEWS.includes(view) ? view : 'home', param: param ? decodeURIComponent(param) : '' };
}

/** Permissions from the server; an older backend sends none, so fall back to the old rules. */
function permsFrom(data, role) {
  return data ? data.permissions || legacyPermissions(role) : null;
}

/** Donor list from start-up data: null = not loaded yet, [] for roles that can't view donors. */
function donorsFrom(data, perms) {
  if (!data || !perms) return null;
  if (!perms.viewDonors) return [];
  return Array.isArray(data.donors) ? data.donors : data.donors ? toDonors(data.donors) : null;
}

function Main({ session, initialData, setSession }) {
  const { username, role } = session.user;
  const cached = useRef(initialData ? null : getCachedData(username)).current;
  const start = initialData
    ? { ...initialData, donors: initialData.donors && toDonors(initialData.donors) }
    : cached && { ...cached, permissions: cached.permissions };

  const [route, setRoute] = useState(readHash);
  const [settings, setSettings] = useState(start?.settings || DEFAULT_SETTINGS);
  const [perms, setPerms] = useState(() => (cached && !cached.permissions ? null : permsFrom(start, role)));
  const [rolePermissions, setRolePermissions] = useState(start?.rolePermissions || null);
  const [rawDonors, setRawDonors] = useState(() => donorsFrom(start, permsFrom(start, role)));
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSync, setLastSync] = useState(initialData ? Date.now() : cached?.savedAt || null);

  const [editing, setEditing] = useState(null); // { donor, recordDonation } for the form, or null
  const [viewingId, setViewingId] = useState(null);
  const [recording, setRecording] = useState(null); // { donorId, donor } or null
  const [toast, setToast] = useState('');

  const isAdmin = role === 'admin';
  const p = perms || {};
  const canView = Boolean(p.viewDonors);

  // Search text and eligibility are computed once per donor here, so screens stay fast.
  const donors = useMemo(
    () => (rawDonors || []).map((d) => ({ ...d, _search: searchText(d), _elig: eligibility(d, settings) })),
    [rawDonors, settings],
  );

  // Keep the on-device copy in sync. Roles that can't view donors store no donor data at all.
  useEffect(() => {
    if (perms && rawDonors) saveCachedData(username, settings, perms.viewDonors ? rawDonors : null, perms);
  }, [rawDonors, settings, perms, username]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (view, param) => {
    window.location.hash = `/${view}${param ? '/' + encodeURIComponent(param) : ''}`;
    window.scrollTo(0, 0);
  };

  const sync = useCallback(
    async (fresh) => {
      setSyncing(true);
      setSyncError('');
      try {
        const data = await api.bootstrap(fresh);
        const newPerms = permsFrom(data, role);
        setSettings(data.settings);
        setPerms(newPerms);
        setRolePermissions(data.rolePermissions || null);
        setRawDonors(donorsFrom(data, newPerms) || []);
        setLastSync(Date.now());
      } catch (e) {
        setSyncError(e.message);
      } finally {
        setSyncing(false);
      }
    },
    [role],
  );

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
    if (!canView || donor.masked) return;
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

  const openRecord = (donorOrId) =>
    setRecording(
      typeof donorOrId === 'object' && donorOrId
        ? { donorId: donorOrId.id, donor: donorOrId }
        : { donorId: donorOrId || null, donor: null },
    );
  const openAdd = (donor = {}, recordDonation = false) => setEditing({ donor, recordDonation });
  const viewing = viewingId ? donors.find((d) => d.id === viewingId) : null;

  // Pages the user may open.
  const allowed = {
    home: true,
    settings: true,
    find: canView,
    donors: canView,
    users: Boolean(p.manageVolunteers),
    permissions: isAdmin,
    import: Boolean(p.importDonors),
  };
  const view = allowed[route.view] ? route.view : 'home';

  let content;
  if (!perms || !rawDonors) {
    content = syncError ? (
      <div className="center-box">
        <p className="error">{syncError}</p>
        <button className="btn primary" onClick={() => sync(true)}>
          Try again
        </button>
      </div>
    ) : (
      <div className="center-box">
        <Spinner /> <p className="muted">Loading…</p>
      </div>
    );
  } else if (view === 'find') {
    content = (
      <FindDonors
        donors={donors}
        group={route.param}
        onGroup={(g) => window.location.replace(`#/find/${encodeURIComponent(g)}`)}
        onOpen={setViewingId}
      />
    );
  } else if (view === 'donors') {
    content = (
      <DonorList
        donors={donors}
        initialGroup={route.param}
        onOpen={setViewingId}
        onAdd={p.addDonors ? () => openAdd() : null}
        onRecord={p.recordDonations ? openRecord : null}
        canExport={Boolean(p.exportDonors)}
      />
    );
  } else if (view === 'import') {
    content = (
      <div className="stack narrow">
        <div>
          <a href="#/settings" className="back-link">
            ← Settings
          </a>
          <h2 className="m0">Import donors</h2>
        </div>
        <ImportDonors onImported={() => sync(true)} onToast={setToast} />
      </div>
    );
  } else if (view === 'users') {
    content = <Users session={session} onToast={setToast} />;
  } else if (view === 'permissions') {
    content = (
      <Permissions
        key={JSON.stringify(rolePermissions)}
        rolePermissions={rolePermissions}
        onSaved={(rp) => {
          setRolePermissions(rp);
          setToast('Permissions saved. They apply immediately.');
        }}
      />
    );
  } else if (view === 'settings') {
    content = (
      <Settings
        session={session}
        perms={p}
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
        donorCount={canView ? donors.length : null}
      />
    );
  } else {
    content = (
      <Home
        session={session}
        perms={p}
        donors={donors}
        settings={settings}
        onFind={(g) => go('find', g)}
        onBrowse={(g) => go('donors', g)}
        onAdd={p.addDonors ? (prefill) => openAdd(prefill) : null}
        onRecord={p.recordDonations ? openRecord : null}
        onOpen={canView ? setViewingId : null}
      />
    );
  }

  const navItems = [
    <NavItem key="home" href="#/home" active={view === 'home'} icon="⌂" label="Home" />,
    canView && <NavItem key="find" href="#/find" active={view === 'find'} icon="🔍" label="Find Blood" />,
    p.recordDonations && (
      <button key="rec" className="nav-record" onClick={() => openRecord()} aria-label="Record donation">
        <span className="plus">＋</span>
        <span className="label">Donation</span>
      </button>
    ),
    canView && <NavItem key="donors" href="#/donors" active={view === 'donors'} icon="👥" label="Donors" />,
    <NavItem
      key="settings"
      href="#/settings"
      active={['settings', 'users', 'permissions', 'import'].includes(view)}
      icon="⚙"
      label="Settings"
    />,
  ].filter(Boolean);

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

      <nav className="bottom-nav" aria-label="Main" style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}>
        {navItems}
      </nav>

      {editing && (
        <DonorForm
          donor={editing.donor}
          donors={donors}
          canView={canView}
          canRecord={Boolean(p.recordDonations)}
          settings={settings}
          recordDonation={editing.recordDonation}
          onClose={() => setEditing(null)}
          onPickExisting={(d, donated) => {
            setEditing(null);
            if (donated || !canView) openRecord(d);
            else setViewingId(d.id);
          }}
          onSaved={(d, { merged, donated }) => {
            upsert(d);
            setEditing(null);
            if (editing.donor.id) setToast('Donor updated');
            else if (merged) setToast(`${d.name} was already saved — ${donated ? 'donation added' : 'record updated'}`);
            else setToast(donated ? `${d.name} added and donation recorded` : `${d.name} added`);
          }}
        />
      )}
      {viewing && !editing && !recording && (
        <DonorDetails
          donor={viewing}
          settings={settings}
          canEdit={Boolean(p.editDonors)}
          canDelete={Boolean(p.deleteDonors)}
          canRecord={Boolean(p.recordDonations)}
          onClose={() => setViewingId(null)}
          onEdit={() => setEditing({ donor: viewing })}
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
          canView={canView}
          settings={settings}
          initialDonorId={recording.donorId}
          initialDonor={recording.donor}
          onClose={() => setRecording(null)}
          onAddDonor={
            p.addDonors
              ? (query) => {
                  setRecording(null);
                  // Carry over what was typed in the search box.
                  const isPhone = /^[\d\s+()-]{4,}$/.test(query || '');
                  openAdd(isPhone ? { phone: query } : { name: query || '' }, true);
                }
              : null
          }
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
