import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Task1Latest } from '../api/types';
import { judgeStatusClass, judgeStatusText } from '../constants/status';
import { StatusBadge } from '../components/StatusBadge';
import { SubmissionSidebar } from '../components/SubmissionSidebar';

export function Task1Page() {
  const [data, setData] = useState<Task1Latest | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const result = await api.latestTask1();
        if (mounted) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load task1 result');
      }
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading-state">Loading...</p>;

  if (data.nosubmission) {
    return (
      <section className="page-shell">
        <div className="page-head">
          <div>
            <p className="eyebrow">Task 1</p>
            <h1>My Task1 Submissions</h1>
            <p className="muted-text">No submission yet. Send your bot to start testcase judging.</p>
          </div>
        </div>
        <div className="content-grid">
          <div className="card">
            <div className="empty-state">No Task1 records available for your account.</div>
          </div>
          <aside className="side-stack">
            <SubmissionSidebar active="task1" />
          </aside>
        </div>
      </section>
    );
  }

  const sub = data.submission!;

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Task 1</p>
          <h1>My Task1 Submissions</h1>
          <p className="muted-text">Latest judge queue status and per-case results.</p>
        </div>
        <div className="stat-chip">
          <span className="k">Score</span>
          <span className="v">{data.score}</span>
        </div>
      </div>
      <div className="content-grid">
        <div className="card">
          <div className="section-header">
            <h2>Latest Run #{sub.id}</h2>
            <StatusBadge
              label={judgeStatusText[sub.status] ?? 'Unknown'}
              tone={judgeStatusClass(sub.status)}
            />
          </div>
          {sub.status === 9 ? (
            <pre>{sub.stderr || 'Compile error'}</pre>
          ) : (
            <div className="card table-card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.cases.map((c) => (
                      <tr key={c.index}>
                        <td>
                          <Link to={`/submission/O1/${c.index}`}>Case #{c.index + 1}</Link>
                        </td>
                        <td>
                          <StatusBadge
                            label={judgeStatusText[c.status] ?? 'Unknown'}
                            tone={judgeStatusClass(c.status)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <aside className="side-stack">
          <SubmissionSidebar active="task1" />
        </aside>
      </div>
    </section>
  );
}
