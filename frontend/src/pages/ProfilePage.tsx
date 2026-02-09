import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { UserProfile } from '../api/types';
import { sha256Hex } from '../utils/hash';
import { ProfileSidebar } from '../components/ProfileSidebar';

export function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [tskin, setTskin] = useState('');
  const [bskin, setBskin] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await api.profile();
        if (!mounted) return;
        setProfile(data);
        setName(data.dispName);
        setTskin(data.tankSkin);
        setBskin(data.bulletSkin);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load profile');
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
    setSuccess('');

    try {
      const payload: {
        name: string;
        tskin: string;
        bskin: string;
        password?: string;
        newpassword?: string;
      } = { name, tskin, bskin };

      if (password || newPassword) {
        payload.password = await sha256Hex(password);
        payload.newpassword = await sha256Hex(newPassword);
      }

      const result = await api.updateProfile(payload);
      if (result.wrongPassword) {
        setError('Wrong Password');
      } else {
        setProfile(result.profile);
        setSuccess('Your settings have been updated.');
        setPassword('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    return <p className={error ? 'error-text' : 'loading-state'}>{error || 'Loading...'}</p>;
  }

  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>My Profile</h1>
          <p className="muted-text">Customize display info, skin URLs and password.</p>
        </div>
      </div>
      <div className="content-grid">
        <div className="card">
          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}
          <form onSubmit={onSubmit} className="form-grid profile-grid">
            <label>
              Student ID
              <input value={profile.studentId} readOnly />
            </label>
            <label>
              Real Name
              <input value={profile.realName} readOnly />
            </label>
            <label>
              Display Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Tank Skin URL
              <input value={tskin} onChange={(e) => setTskin(e.target.value)} />
            </label>
            <label>
              Bullet Skin URL
              <input value={bskin} onChange={(e) => setBskin(e.target.value)} />
            </label>
            <label>
              Original Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label>
              New Password
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </form>
        </div>
        <aside className="side-stack">
          <ProfileSidebar active="profile" />
        </aside>
      </div>
    </section>
  );
}
