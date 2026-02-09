import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading-state">Loading...</div>;
  if (!user) return <Navigate to="/oauth" state={{ from: location }} replace />;

  return children;
}
