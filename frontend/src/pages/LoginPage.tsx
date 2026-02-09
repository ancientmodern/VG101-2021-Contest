import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import { sha256Hex } from '../utils/hash';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const hashed = await sha256Hex(password);
      await api.login(studentId, hashed);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="card narrow">
        <p className="eyebrow">Secure Access</p>
        <h1>Student Login</h1>
        <p className="muted-text">Sign in to manage submissions and profile settings.</p>
        {error ? <p className="error-text">{error}</p> : null}
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            Login ID
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <div className="row-gap">
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <Link to="/forgetPassword">Forget Password</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
