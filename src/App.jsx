import { useCallback, useEffect, useState } from 'react';
import { api, getSession, setSessionLostHandler } from './api';
import { eligibility, searchText } from './utils';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import FindDonors from './components/FindDonors';
import DonorList from './components/DonorList';
import DonorForm from './components/DonorForm';
import DonorDetails from './components/DonorDetails';
import Account from './components/Account';
import { Spinner } from './components/ui';

export default function App() {
  const [session, setSession] = useState(getSession);

  useEffect(() => {
    setSessionLostHandler(() => setSession(null));
  }, []);

  if (!session) return <Login onLogin={setSession} />;
  return <Main session={session} setSession={setSession} />;
}

/** Adds fields computed once per donor so lists and filters stay fast. */
function enrich(d) {
  return { ...d, _search: searchText(d), _elig: eligibility(d) };
}

const VIEWS = ['home', 'find', 'donors', 'account'];

function readHash() {
  const [view, param] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { view: VIEWS.includes(view) ? view : 'home', param: param ? decodeURIComponent(param) : '' };
}

function Main({ session, setSession }) {
  const [route, setRoute] = useState(readHash);
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // donor object for the form, or null
  const [viewingId, setViewingId] = useState(null);
  const [toast, setToast] = useState('');

  const isAdmin = session.user.role === 'admin';

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (view, param) => {
    window.location.hash = `/${view}${param ? '/' + encodeURIComponent(param) : ''}`;
    window.scrollTo(0, 0);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await api.listDonors();
      setDonors(list.map(enrich));
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Update the local list after a save instead of reloading everything.
  const upsert = (donor) => {
    const e = enrich(donor);
    setDonors((list) => {
      const i = list.findIndex((d) => d.id === e.id);
      if (i === -1) return [e, ...list];
      const copy = list.slice();
      copy[i] = e;
      return copy;
    });
  };
  const remove = (id) => setDonors((list) => list.filter((d) => d.id !== id));

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* session is cleared locally anyway */
    }
    setSession(null);
  };

  const viewing = viewingId ? donors.find((d) => d.id === viewingId) : null;

  let content;
  if (loading && donors.length === 0) {
    content = (
      <div className="center-box">
        <Spinner /> <p>Loading donors…</p>
      </div>
    );
  } else if (loadError && donors.length === 0) {
    content = (
      <div className="center-box">
        <p className="error">{loadError}</p>
        <button className="btn primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  } else if (route.view === 'find') {
    content = <FindDonors donors={donors} group={route.param} onGroup={(g) => go('find', g)} onOpen={setViewingId} />;
  } else if (route.view === 'donors') {
    content = (
      <DonorList
        donors={donors}
        initialGroup={route.param}
        onOpen={setViewingId}
        onAdd={() => setEditing({})}
      />
    );
  } else if (route.view === 'account') {
    content = <Account session={session} setSession={setSession} onLogout={logout} onToast={setToast} />;
  } else {
    content = (
      <Dashboard
        donors={donors}
        onFind={(g) => go('find', g)}
        onBrowse={(g) => go('donors', g)}
        onAdd={() => setEditing({})}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/home">
            <img src="./favicon.svg" alt="" width="26" height="26" />
            <span>Blood Group Manager</span>
          </a>
          <nav className="nav">
            {[
              ['home', 'Home'],
              ['find', 'Find Blood'],
              ['donors', 'Donors'],
              ['account', 'Account'],
            ].map(([v, label]) => (
              <a key={v} href={`#/${v}`} className={route.view === v ? 'active' : ''}>
                {label}
              </a>
            ))}
          </nav>
          <button className="btn small ghost refresh" onClick={load} disabled={loading} title="Reload data from the sheet">
            {loading ? <Spinner small /> : '↻'} <span className="hide-sm">Refresh</span>
          </button>
        </div>
      </header>

      <main className="container">{content}</main>

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
      {viewing && !editing && (
        <DonorDetails
          donor={viewing}
          isAdmin={isAdmin}
          onClose={() => setViewingId(null)}
          onEdit={() => setEditing(viewing)}
          onUpdated={(d) => {
            upsert(d);
            setToast('Donation recorded');
          }}
          onDeleted={() => {
            remove(viewing.id);
            setViewingId(null);
            setToast('Donor deleted');
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
