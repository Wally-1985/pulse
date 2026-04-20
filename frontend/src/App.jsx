import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages';
import DashboardPage from './pages/dashboard/DashboardPage';
import EntriesListPage from './pages/entries/EntriesListPage';
import EntryPage from './pages/entries/EntryPage';
import ManagerDashboard from './pages/manager/ManagerDashboard';
import AdminPage from './pages/admin/AdminPage';
import UsersPage from './pages/admin/UsersPage';
import TeamsPage from './pages/admin/TeamsPage';
import ProfilePage from './pages/profile/ProfilePage';
import { Spinner } from './components/ui';

const toastStyle = {
  style: {
    background: 'var(--pulse-surface)',
    color: 'var(--pulse-text)',
    border: '1px solid var(--pulse-border)',
    borderRadius: '10px',
    fontSize: '14px',
  },
  success: { iconTheme: { primary: '#34d399', secondary: '#0f0f13' } },
  error:   { iconTheme: { primary: '#f87171', secondary: '#0f0f13' } },
};

function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, isAdmin, isManager } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole === 'admin' && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (requiredRole === 'manager' && !isManager) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading, isAdmin, isManager } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  const defaultRedirect = user
    ? (isAdmin || isManager ? '/manager' : '/dashboard')
    : '/login';

  return (
    <Routes>
      {/* Public */}
      <Route path="/login"           element={user ? <Navigate to={defaultRedirect} replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />
      <Route path="/"                element={<Navigate to={defaultRedirect} replace />} />

      {/* Protected — inside app layout */}
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/entries"   element={<EntriesListPage />} />
        <Route path="/entry"     element={<EntryPage />} />
        <Route path="/profile"   element={<ProfilePage />} />

        <Route path="/manager" element={
          <ProtectedRoute requiredRole="manager"><ManagerDashboard /></ProtectedRoute>
        } />

        <Route path="/admin"        element={<ProtectedRoute requiredRole="admin"><AdminPage /></ProtectedRoute>} />
        <Route path="/admin/users"  element={<ProtectedRoute requiredRole="admin"><UsersPage /></ProtectedRoute>} />
        <Route path="/admin/teams"  element={<ProtectedRoute requiredRole="admin"><TeamsPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={defaultRedirect} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="bottom-right" toastOptions={toastStyle} />
      </BrowserRouter>
    </AuthProvider>
  );
}
