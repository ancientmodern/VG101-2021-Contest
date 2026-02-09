import { NavLink } from 'react-router-dom';

type SubmissionSidebarProps = {
  active: 'list' | 'task1' | 'submit';
};

function menuClass(active: boolean): string {
  return `side-menu-link${active ? ' active' : ''}`;
}

export function SubmissionSidebar({ active }: SubmissionSidebarProps) {
  return (
    <div className="card side-card">
      <h2>Submission</h2>
      <ol className="side-menu">
        <li>
          <NavLink to="/submission" className={menuClass(active === 'list')}>
            My Submissions
          </NavLink>
        </li>
        <li>
          <NavLink to="/submission/O1" className={menuClass(active === 'task1')}>
            Task1 Submissions
          </NavLink>
        </li>
        <li>
          <NavLink to="/submission/submit" className={menuClass(active === 'submit')}>
            Submit New Brain
          </NavLink>
        </li>
      </ol>
    </div>
  );
}
