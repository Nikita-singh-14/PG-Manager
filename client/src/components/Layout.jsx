import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const NAV = {
  owner: [['/', 'Dashboard'], ['/rooms', 'Rooms'], ['/tenants', 'Tenants'], ['/rent', 'Rent'], ['/complaints', 'Complaints']],
  tenant: [['/', 'My rent'], ['/complaints', 'Complaints']],
};

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="top">
        <span className="brand">🏠 PG Manager</span>
        <nav className="tabs">
          {NAV[user.role].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <span className="muted">{user.name}</span>
        <button className="small" onClick={logout}>Log out</button>
      </header>
      <main><Outlet /></main>
    </>
  );
}
