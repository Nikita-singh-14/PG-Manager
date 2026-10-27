import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rooms from './pages/Rooms.jsx';
import Tenants from './pages/Tenants.jsx';
import TenantDetail from './pages/TenantDetail.jsx';
import Rent from './pages/Rent.jsx';
import MyRent from './pages/MyRent.jsx';
import Complaints from './pages/Complaints.jsx';
import Receipt from './pages/Receipt.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="muted center">Loading…</div>;
  if (!user) return <Login />;
  const owner = user.role === 'owner';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={owner ? <Dashboard /> : <MyRent />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="receipt/:id" element={<Receipt />} />
        {owner && <Route path="rooms" element={<Rooms />} />}
        {owner && <Route path="tenants" element={<Tenants />} />}
        {owner && <Route path="tenants/:id" element={<TenantDetail />} />}
        {owner && <Route path="rent" element={<Rent />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
