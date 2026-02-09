import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link to="/" className="logo">
          TankWarJudge
        </Link>
        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Scoreboard
          </NavLink>
          <NavLink to="/submission" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Submission
          </NavLink>
          <NavLink to="/match" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Match
          </NavLink>
          <NavLink to="/rules" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Rules
          </NavLink>
        </nav>
        <div className="nav-user">
          {user ? (
            <>
              <Link to="/profile" className="nav-link">
                {user.realName}
              </Link>
              <button className="nav-link link-btn" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link className="nav-link" to="/oauth">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
