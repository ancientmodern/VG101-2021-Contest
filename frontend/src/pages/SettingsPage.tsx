import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import { ProfileSidebar } from '../components/ProfileSidebar';

export function SettingsPage() {
  const [compiler, setCompiler] = useState('c++17');
  const [compilers, setCompilers] = useState<string[]>(['c++98', 'c++11', 'c++14', 'c++17']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meta, settings] = await Promise.all([api.meta(), api.settings()]);
        if (!mounted) return;
        if (meta.compilers?.length) setCompilers(meta.compilers);
        if (settings.compiler) setCompiler(settings.compiler);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load settings');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const result = await api.updateSettings(compiler);
      setCompiler(result.compiler);
      setSuccess('Your settings have been updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
          <p className="muted-text">Set default compiler used for new submissions.</p>
        </div>
      </div>
      <div className="content-grid">
        <div className="card">
          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}
          <form onSubmit={onSubmit} className="form-grid">
            <label>
              Default Compiler
              <select value={compiler} onChange={(e) => setCompiler(e.target.value)}>
                {compilers.map((c) => (
                  <option value={c} key={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Save</button>
          </form>
        </div>
        <aside className="side-stack">
          <ProfileSidebar active="settings" />
        </aside>
      </div>
    </section>
  );
}
