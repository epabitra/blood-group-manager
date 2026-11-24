import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { eligibility, matchesQuery, searchText } from './utils';

const MIN_LETTERS = 3;
const MIN_DIGITS = 4;
const DEBOUNCE_MS = 350;

export function isSearchable(query) {
  const q = String(query || '').trim();
  if (/^[\d\s+()-]+$/.test(q)) return q.replace(/\D/g, '').length >= MIN_DIGITS;
  return q.replace(/[^a-zA-Z\u0B00-\u0B7F]/g, '').length >= MIN_LETTERS;
}

/**
 * Finds donors by name / phone.
 * - Users who may view donors search the list already on the phone (instant).
 * - Others (e.g. volunteers) ask the server, which returns at most 10 matches with hidden phones.
 * Returns { results, loading, error, tooShort }.
 */
export function useDonorSearch(query, { canView, donors, settings, limit = 20 }) {
  const q = useDeferredValue(String(query || '').trim());
  const [remote, setRemote] = useState({ q: '', results: [], error: '' });
  const [loading, setLoading] = useState(false);
  const searchable = isSearchable(q);

  const local = useMemo(
    () => (canView && q ? donors.filter((d) => matchesQuery(d, q)).slice(0, limit) : []),
    [canView, donors, q, limit],
  );

  useEffect(() => {
    if (canView || !searchable) return undefined;
    let active = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchDonors(q)
        .then((list) => {
          if (!active) return;
          const results = list.map((d) => ({ ...d, _search: searchText(d), _elig: eligibility(d, settings) }));
          setRemote({ q, results, error: '' });
        })
        .catch((e) => active && setRemote({ q, results: [], error: e.message }))
        .finally(() => active && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [canView, q, searchable, settings]);

  if (canView) return { results: local, loading: false, error: '', tooShort: false };
  return {
    results: searchable && remote.q === q ? remote.results : [],
    loading: searchable && (loading || remote.q !== q),
    error: remote.q === q ? remote.error : '',
    tooShort: Boolean(q) && !searchable,
  };
}
