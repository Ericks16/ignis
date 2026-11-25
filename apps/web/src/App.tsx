import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { Account } from './pages/Account';
import { Clients } from './pages/Clients';
import { ClientDetail } from './pages/ClientDetail';
import { Installations } from './pages/Installations';
import { Systems } from './pages/Systems';
import { SystemDetail } from './pages/SystemDetail';
import { Catalogs } from './pages/Catalogs';
import { Maintenances } from './pages/Maintenances';
import { MaintenanceDetail } from './pages/MaintenanceDetail';
import { CalendarPage } from './pages/CalendarPage';
import { Technicians } from './pages/Technicians';
import { FollowUps } from './pages/FollowUps';
import { FollowUpDetail } from './pages/FollowUpDetail';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { Imports } from './pages/Imports';
import { ReportsHome, ReportDetail } from './pages/Reports';
import { ImportWizard } from './pages/ImportWizard';

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Cargando…</div>;
  if (!user) return <Login />;
  // Contraseña temporal: solo se permite la pantalla de cambio.
  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route element={<Layout />}><Route path="*" element={<Account forced />} /></Route>
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="instalaciones" element={<Installations />} />
        <Route path="mantenimientos" element={<Maintenances />} />
        <Route path="mantenimientos/:id" element={<MaintenanceDetail />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="reportes" element={<ReportsHome />} />
        <Route path="reportes/:key" element={<ReportDetail />} />
        <Route path="tecnicos" element={<Technicians />} />
        <Route path="seguimientos" element={<FollowUps />} />
        <Route path="seguimientos/:id" element={<FollowUpDetail />} />
        <Route path="actividades" element={<ActivitiesPage />} />
        {user.role !== 'TECNICO' && <Route path="notificaciones" element={<NotificationsPage />} />}
        {(user.role === 'ADMIN' || user.role === 'OPERATIVO') && <Route path="recordatorios" element={<SettingsPage />} />}
        {user.role === 'ADMIN' && <Route path="importaciones" element={<Imports />} />}
        {user.role === 'ADMIN' && <Route path="importaciones/:id" element={<ImportWizard />} />}
        <Route path="sistemas" element={<Systems />} />
        <Route path="sistemas/:id" element={<SystemDetail />} />
        {user.role === 'ADMIN' && <Route path="catalogos" element={<Catalogs />} />}
        <Route path="cuenta" element={<Account />} />
        {user.role === 'ADMIN' && <Route path="usuarios" element={<Users />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
