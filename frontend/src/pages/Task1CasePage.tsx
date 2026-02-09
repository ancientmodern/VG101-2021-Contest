import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { judgeStatusClass, judgeStatusText } from '../constants/status';
import { StatusBadge } from '../components/StatusBadge';
import { SubmissionSidebar } from '../components/SubmissionSidebar';

export function Task1CasePage() {
  const { id } = useParams();
  const [data, setData] = useState<{ index: number; status: number; stdout: string; stderr: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id === undefined) return;
    let mounted = true;

    (async () => {
      try {
        const result = await api.latestTask1Case(id);
        if (mounted) setData(result);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load testcase');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="loading-state">Loading...</p>;

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Task 1 Case</p>
          <h1>Case #{data.index + 1}</h1>
          <p className="muted-text">Detailed stdout and stderr for this testcase.</p>
        </div>
        <StatusBadge label={judgeStatusText[data.status] ?? 'Unknown'} tone={judgeStatusClass(data.status)} />
      </div>
      <div className="content-grid">
        <div className="card">
          <div className="split-grid">
            <article>
              <h3>stderr</h3>
              <pre>{data.stderr || 'No stderr output.'}</pre>
            </article>
            <article>
              <h3>stdout / hint</h3>
              <pre>{data.stdout || 'No stdout output.'}</pre>
            </article>
          </div>
        </div>
        <aside className="side-stack">
          <SubmissionSidebar active="task1" />
        </aside>
      </div>
    </section>
  );
}
