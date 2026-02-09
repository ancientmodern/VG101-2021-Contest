import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { MatchListResponse } from '../api/types';
import { scoreToColor } from '../constants/status';

function getMatchStatusText(status: number, winner: number | null): string {
  if (status === 0) return 'Pending';
  if (winner === -1) return 'Draw';
  if (winner === 0) return 'P1 Win';
  return 'P2 Win';
}

function getMatchStatusTone(status: number, winner: number | null): 'ok' | 'error' | 'pending' | 'muted' {
  if (status === 0) return 'pending';
  if (winner === -1) return 'muted';
  return 'ok';
}

export function MatchListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<MatchListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [targetPlayer, setTargetPlayer] = useState(searchParams.get('name') ?? '');
  const [enabledFilter, setEnabledFilter] = useState(searchParams.get('filter') === '1');

  const page = Number(searchParams.get('page') ?? '1');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (enabledFilter) params.set('filter', targetPlayer.trim() ? targetPlayer.trim() : '1');
    return params.toString();
  }, [page, enabledFilter, targetPlayer]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const result = await api.listMatches(query);
        if (!mounted) return;
        setData(result);
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load matches');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const timer = window.setInterval(load, 60000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [query]);

  const goPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    params.set('name', targetPlayer);
    params.set('filter', enabledFilter ? '1' : '0');
    setSearchParams(params);
  };

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (targetPlayer) params.set('name', targetPlayer);
    if (enabledFilter) params.set('filter', '1');
    setSearchParams(params);
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Battle Feed</p>
          <h1>Current Matches</h1>
          <p className="muted-text">Live queue of ranked tank battles. Refreshes every minute.</p>
        </div>
        <div className="stat-row">
          <div className="stat-chip">
            <span className="k">Page</span>
            <span className="v">{page}</span>
          </div>
          <div className="stat-chip">
            <span className="k">Matches</span>
            <span className="v">{data?.items.length ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="card filter-panel">
        <div className="filter-grid">
          <label>
            Target Player
            <input value={targetPlayer} onChange={(e) => setTargetPlayer(e.target.value)} />
            <span className="field-hint">Leave empty to target your own matches.</span>
          </label>
          <button className="btn secondary" onClick={applyFilter}>
            Apply Filter
          </button>
        </div>
        <label className="inline-checkbox">
          <input type="checkbox" checked={enabledFilter} onChange={(e) => setEnabledFilter(e.target.checked)} />
          Only show target player matches
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {loading && !data ? <p className="loading-state">Loading...</p> : null}
      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>P1</th>
                <th>Rating</th>
                <th>P2</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((match) => (
                <tr key={match.id}>
                  <td>
                    <span className={`badge ${getMatchStatusTone(match.status, match.winner)}`}>
                      <span className="badge-dot" aria-hidden />
                      <span>{getMatchStatusText(match.status, match.winner)}</span>
                    </span>{' '}
                    <Link to={`/match/${match.id}`}>View</Link>
                  </td>
                  <td
                    style={{
                      color: scoreToColor(match.status ? Number(match.scores?.p1[1] ?? match.p1.score) : match.p1.score),
                      fontWeight: 700,
                    }}
                  >
                    {match.p1.dispName}
                  </td>
                  <td className="mono">{match.status ? `${match.scores?.p1[0] ?? ''} -> ${match.scores?.p1[1] ?? ''}` : 'Pending'}</td>
                  <td
                    style={{
                      color: scoreToColor(match.status ? Number(match.scores?.p2[1] ?? match.p2.score) : match.p2.score),
                      fontWeight: 700,
                    }}
                  >
                    {match.p2.dispName}
                  </td>
                  <td className="mono">{match.status ? `${match.scores?.p2[0] ?? ''} -> ${match.scores?.p2[1] ?? ''}` : 'Pending'}</td>
                </tr>
              ))}
              {!data?.items.length ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">No matches found for this filter.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {data ? (
        <div className="pager">
          <button className="secondary" disabled={page <= 1} onClick={() => goPage(1)}>
            First
          </button>
          <button className="secondary" disabled={page <= 1} onClick={() => goPage(page - 1)}>
            Prev
          </button>
          <span>
            Page {data.page} / {Math.max(data.pages, 1)}
          </span>
          <button className="secondary" disabled={page >= data.pages} onClick={() => goPage(page + 1)}>
            Next
          </button>
          <button className="secondary" disabled={page >= data.pages} onClick={() => goPage(data.pages)}>
            Last
          </button>
        </div>
      ) : null}
    </section>
  );
}
