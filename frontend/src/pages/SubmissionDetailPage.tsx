import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { SubmissionDetail as SubmissionDetailType } from '../api/types';
import { submissionStatusClass, submissionStatusText } from '../constants/status';
import { StatusBadge } from '../components/StatusBadge';

export function SubmissionDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<SubmissionDetailType | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        const result = await api.submissionDetail(id);
        if (mounted) setData(result);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load submission');
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
          <p className="eyebrow">Compile Result</p>
          <h1>Submission #{data.id}</h1>
          <p className="muted-text">Inspect runtime stack and compiler diagnostics.</p>
        </div>
        <StatusBadge label={submissionStatusText[data.status] ?? 'Unknown'} tone={submissionStatusClass(data.status)} />
      </div>
      <div className="card">
        <p className="status-line">
          <strong>Compiler:</strong> <span className="mono">{data.compiler}</span>
          <span>•</span>
          <strong>Submitted:</strong> {new Date(data.createdAt).toLocaleString()}
        </p>
        <div className="split-grid">
          <article>
            <h3>Stack</h3>
            <pre>{data.stack || 'No stack output.'}</pre>
          </article>
          <article>
            <h3>stderr</h3>
            <pre>{data.stderr || 'No stderr output.'}</pre>
          </article>
        </div>
      </div>
    </section>
  );
}
