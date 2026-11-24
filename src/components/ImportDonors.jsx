import { useRef, useState } from 'react';
import { api } from '../api';
import { Spinner } from './ui';

/**
 * Admin: bulk-add donors from a JSON file (an array of donor objects, or { donors: [...] }).
 * Step 1 shows a preview from the server (nothing is saved); step 2 imports.
 */
export default function ImportDonors({ onImported, onToast }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null); // { name, donors }
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const choose = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setError('');
    setPreview(null);
    let donors;
    try {
      const data = JSON.parse(await f.text());
      donors = Array.isArray(data) ? data : data && data.donors;
      if (!Array.isArray(donors) || donors.length === 0) throw new Error();
    } catch {
      setError('This is not a valid donors file. It must be a JSON list of donors.');
      return;
    }
    setFile({ name: f.name, donors });
    setBusy(true);
    try {
      setPreview(await api.importDonors(donors, true));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.importDonors(file.donors, false);
      onToast(`Imported: ${res.added} new, ${res.merged} merged, ${res.donations} donation records`);
      reset();
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card form-stack">
      <div>
        <h3>Import donors</h3>
        <p className="muted small">
          Add many donors at once from a JSON file. A donor with the same phone and name as an existing one is merged,
          not added twice. You will see a preview before anything is saved.
        </p>
      </div>

      {!file && (
        <label className="btn ghost file-btn">
          📄 Choose file…
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={choose} hidden />
        </label>
      )}

      {file && (
        <div className="import-box">
          <div className="row-between m0">
            <strong className="file-name">{file.name}</strong>
            <span className="muted small">{file.donors.length} donors in file</span>
          </div>

          {busy && !preview && (
            <p className="muted small">
              <Spinner small /> Checking the file…
            </p>
          )}

          {preview && (
            <>
              <ul className="import-summary">
                <li>
                  <b className="ok-text">{preview.added}</b> new donors will be added
                </li>
                <li>
                  <b>{preview.merged}</b> already saved (same phone and name) – will be merged
                </li>
                <li>
                  <b>{preview.donations}</b> donation records will be added to history
                </li>
                {preview.skipped.length > 0 && (
                  <li>
                    <b className="danger-text">{preview.skipped.length}</b> will be skipped because of errors:
                  </li>
                )}
              </ul>
              {preview.skipped.length > 0 && (
                <ul className="skipped">
                  {preview.skipped.map((s) => (
                    <li key={s.index}>
                      #{s.index} {s.name || '(no name)'} – {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="row wrap">
            {preview && preview.added + preview.merged > 0 && (
              <button className="btn primary" onClick={run} disabled={busy}>
                {busy ? <Spinner small /> : `Import ${preview.added + preview.merged} donors`}
              </button>
            )}
            <button className="btn ghost" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
