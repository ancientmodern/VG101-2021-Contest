import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { ScoreboardItem } from '../api/types';
import { scoreToColor } from '../constants/status';

export function ScoreboardPage() {
  const [rows, setRows] = useState<ScoreboardItem[]>([]);
  const [refreshAt, setRefreshAt] = useState<Date>(new Date());
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const data = await api.scoreboard();
        if (!mounted) return;
        setRows(data);
        setRefreshAt(new Date());
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load scoreboard');
      }
    };

    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const ranked = useMemo(() => {
    const rated = rows.filter((x) => x.score !== 'unrated');
    const unrated = rows.filter((x) => x.score === 'unrated');

    const withRank: Array<{ rank: number; item: ScoreboardItem }> = [];
    let currentRank = 0;
    let lastScore: number | null = null;

    for (const item of rated) {
      const numeric = typeof item.score === 'number' ? item.score : Number(item.score);
      if (lastScore === null || numeric !== lastScore) {
        currentRank += 1;
        lastScore = numeric;
      }
      withRank.push({ rank: currentRank, item });
    }

    const baseRank = currentRank + 1;
    return [
      ...withRank,
      ...unrated.map((item) => ({ rank: baseRank, item })),
    ];
  }, [rows]);

  const stats = useMemo(() => {
    const rated = rows.filter((row) => typeof row.score === 'number');
    const topScore = rated.length ? Math.max(...rated.map((row) => row.score as number)) : null;
    return {
      players: rows.length,
      rated: rated.length,
      topScore,
    };
  }, [rows]);

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Arena Ranking</p>
          <h1>Tank Arena Scoreboard</h1>
          <p className="muted-text">Updated at {refreshAt.toLocaleString()} (auto refresh every minute)</p>
        </div>
        <div className="stat-row">
          <div className="stat-chip">
            <span className="k">Players</span>
            <span className="v">{stats.players}</span>
          </div>
          <div className="stat-chip">
            <span className="k">Rated</span>
            <span className="v">{stats.rated}</span>
          </div>
          <div className="stat-chip">
            <span className="k">Top Score</span>
            <span className="v">{stats.topScore ?? 'N/A'}</span>
          </div>
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="card">
        <div className="section-header">
          <h2>Version 1.0.0</h2>
        </div>
        <p className="muted-text">Good morning, and in case I don&apos;t see ya: good afternoon, good evening, and good night!</p>
      </div>
      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>User</th>
                <th>Rating</th>
                <th>Win</th>
                <th>Lose</th>
                <th>Draw</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ rank, item }) => (
                <tr key={item.id}>
                  <td className="mono">#{rank}</td>
                  <td style={{ color: scoreToColor(item.score), fontWeight: 700 }}>{item.dispName}</td>
                  <td style={{ color: scoreToColor(item.score), fontWeight: 700 }}>{item.score}</td>
                  <td>{item.win}</td>
                  <td>{item.lose}</td>
                  <td>{item.draw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
