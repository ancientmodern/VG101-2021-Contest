import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { SubmissionSidebar } from '../components/SubmissionSidebar';

export function SubmissionSubmitPage() {
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [compiler, setCompiler] = useState('c++17');
  const [judge, setJudge] = useState(false);
  const [compilers, setCompilers] = useState<string[]>(['c++98', 'c++11', 'c++14', 'c++17']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meta, settings] = await Promise.all([api.meta(), api.settings()]);
        if (!mounted) return;
        if (meta.compilers?.length) setCompilers(meta.compilers);
        if (settings.compiler) setCompiler(settings.compiler);
      } catch {
        // keep defaults
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.submitCode({ code, compiler, judge });
      navigate('/submission');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Upload</p>
          <h1>Submit New Brain</h1>
          <p className="muted-text">Paste your full `lab7.cpp` source code below.</p>
        </div>
      </div>
      <div className="content-grid">
        <div className="card">
          {error ? <p className="error-text">{error}</p> : null}
          <div className="notice warn">
            <ul>
              <li>Do not copy or share source code. Submissions are checked for plagiarism.</li>
              <li>Do not use alternative accounts to bypass restrictions.</li>
              <li>Do not abuse judge resources by submitting malicious workloads.</li>
              <li>Programs are compiled on Linux with libm and no pthread linkage.</li>
            </ul>
          </div>
          <form onSubmit={onSubmit} className="form-grid">
            <label>
              Source Code
              <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={24} required />
              <span className="field-hint">Use the complete source, including includes and main entry.</span>
            </label>
            <label>
              Compiler
              <select value={compiler} onChange={(e) => setCompiler(e.target.value)}>
                {compilers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-checkbox">
              <input type="checkbox" checked={judge} onChange={(e) => setJudge(e.target.checked)} />
              Send to Task 1 Judge
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
        <aside className="side-stack">
          <div className="card side-card">
            <h2>Current Limits</h2>
            <ol className="side-list">
              <li>Min interval between submissions: 60 seconds</li>
              <li>Max source size: 1 MB</li>
              <li>Max compiled executable size: 1 MB</li>
            </ol>
          </div>
          <SubmissionSidebar active="submit" />
        </aside>
      </div>
    </section>
  );
}
