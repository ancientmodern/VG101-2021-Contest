import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function Layout() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="container page-body">
        <Outlet />
      </main>
    </div>
  );
}
