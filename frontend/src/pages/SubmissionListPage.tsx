import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { SubmissionItem } from '../api/types';
import { submissionStatusClass, submissionStatusText } from '../constants/status';
import { StatusBadge } from '../components/StatusBadge';
import { SubmissionSidebar } from '../components/SubmissionSidebar';

export function SubmissionListPage() {
  const [rows, setRows] = useState<SubmissionItem[]>([]);
  const [error, setError] = useState('');

  const stats = useMemo(() => {
    const effective = rows.filter((row) => row.status === 0).length;
    const compiling = rows.filter((row) => row.status === -1).length;
    return { total: rows.length, effective, compiling };
  }, [rows]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await api.listSubmissions();
        if (mounted) setRows(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load submissions');
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Program Queue</p>
          <h1>My Submissions</h1>
          <p className="muted-text">Manage uploaded bots and inspect compile outcomes.</p>
        </div>
        <div className="stat-row">
          <div className="stat-chip">
            <span className="k">Total</span>
            <span className="v">{stats.total}</span>
          </div>
          <div className="stat-chip">
            <span className="k">Effective</span>
            <span className="v">{stats.effective}</span>
          </div>
          <div className="stat-chip">
            <span className="k">Pending</span>
            <span className="v">{stats.compiling}</span>
          </div>
        </div>
      </div>
      <div className="section-header">
        <div className="toolbar">
          <Link className="btn secondary" to="/submission/O1">
            Task1 Submissions
          </Link>
          <Link className="btn" to="/submission/submit">
            Submit New Brain
          </Link>
        </div>
      </div>
      <div className="content-grid">
        <div>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="card table-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>At</th>
                    <th>Compiler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <StatusBadge label={submissionStatusText[row.status] ?? 'Unknown'} tone={submissionStatusClass(row.status)} />{' '}
                        <Link to={`/submission/check/${row.id}`}>Detail</Link>
                      </td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="mono">{row.compiler}</td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty-state">No submission yet. Upload your first tank brain.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <aside className="side-stack">
          <SubmissionSidebar active="list" />
        </aside>
      </div>
    </section>
  );
}
