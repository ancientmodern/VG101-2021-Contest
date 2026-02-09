import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import { sha256Hex } from '../utils/hash';

export function ForgotPasswordPage() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setToken('');
    try {
      const hashed = await sha256Hex(password);
      const result = await api.forgetPassword(studentId, hashed);
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="card narrow">
        <p className="eyebrow">Recovery</p>
        <h1>Forget Password</h1>
        <p className="muted-text">Generate a token and send it to a TA to reset your password.</p>
        {error ? <p className="error-text">{error}</p> : null}
        {token ? <p className="success-text">Your code is: {token}</p> : null}
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            Login ID
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
          </label>
          <label>
            New Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Generating...' : 'Generate Code'}
          </button>
        </form>
      </div>
    </section>
  );
}
