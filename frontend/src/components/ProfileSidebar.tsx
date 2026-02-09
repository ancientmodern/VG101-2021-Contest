import { NavLink } from 'react-router-dom';

type ProfileSidebarProps = {
  active: 'profile' | 'settings';
};

function menuClass(active: boolean): string {
  return `side-menu-link${active ? ' active' : ''}`;
}

export function ProfileSidebar({ active }: ProfileSidebarProps) {
  return (
    <div className="card side-card">
      <h2>Profile</h2>
      <ol className="side-menu">
        <li>
          <NavLink to="/profile" className={menuClass(active === 'profile')}>
            My Profile
          </NavLink>
        </li>
        <li>
          <NavLink to="/profile/settings" className={menuClass(active === 'settings')}>
            Settings
          </NavLink>
        </li>
      </ol>
    </div>
  );
}
