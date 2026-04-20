import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('pulse_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch {
      localStorage.removeItem('pulse_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (credentials) => {
    const { data } = await authApi.login(credentials);
    if (data.requiresMfa) return { requiresMfa: true };
    localStorage.setItem('pulse_token', data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem('pulse_token');
    setUser(null);
  };

  const isAdmin = user?.roles?.includes('admin');
  const isManager = user?.roles?.includes('manager') || isAdmin;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isManager, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
