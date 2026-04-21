import { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { notificationsApi } from '../../api';
import { Avatar, Badge } from '../ui';

const NAV = [
  { to: '/dashboard', label: 'Home',           icon: '⚡', roles: ['member','manager','admin'] },
  { to: '/entries',   label: 'My Entries',     icon: '📋', roles: ['member','manager','admin'] },
  { to: '/projects',  label: 'Project List',   icon: '🗂️', roles: ['member','manager','admin'] },
  { to: '/manager',   label: 'Team Dashboard', icon: '👥', roles: ['manager','admin'] },
  { to: '/admin',     label: 'Settings',       icon: '⚙️', roles: ['admin'] },
  { to: '/admin/users', label: 'Users',        icon: '👤', roles: ['admin'] },
  { to: '/admin/teams', label: 'Teams',        icon: '🏷️', roles: ['admin'] },
];

export default function AppLayout() {
  const { user, logout, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try { const { data } = await notificationsApi.getAll(); setNotifications(data); } catch {}
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const unread = notifications.filter(n => !n.is_read).length;

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotifications(p => p.map(n => ({ ...n, is_read: true })));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userRoles = user?.roles || [];
  const navItems = NAV.filter(item =>
    item.roles.some(r =>
      r === 'admin' ? isAdmin :
      r === 'manager' ? isManager :
      true
    )
  );

  const SidebarContent = () => (
    <aside className="flex flex-col w-56 shrink-0 bg-[var(--pulse-surface)] border-r border-[var(--pulse-border)] h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--pulse-border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--pulse-accent)] flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-[var(--pulse-accent)]/40">P</div>
          <span className="font-semibold tracking-tight">Pulse</span>
        </div>
      </div>

      {/* Log Today button */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => { navigate('/entry?date=' + new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-' + String(new Date().getDate()).padStart(2,'0')); setSidebarOpen(false); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--pulse-accent)] hover:bg-[var(--pulse-accent-hover)] text-white text-sm font-medium transition-colors shadow-sm shadow-[var(--pulse-accent)]/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Log Today
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {/* Group: Personal */}
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--pulse-muted)] mb-1">Personal</p>
        {navItems.filter(n => ['/dashboard', '/entries'].includes(n.to)).map(item => (
          <SidebarLink key={item.to} item={item} onClose={() => setSidebarOpen(false)} />
        ))}

        {/* Group: Team */}
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--pulse-muted)] mt-3 mb-1">Team</p>
        {navItems.filter(n => ['/projects'].includes(n.to)).map(item => (
          <SidebarLink key={item.to} item={item} onClose={() => setSidebarOpen(false)} />
        ))}

        {/* Group: Manager */}
        {isManager && (
          <>
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--pulse-muted)] mt-3 mb-1">Manager</p>
            {navItems.filter(n => n.to === '/manager').map(item => (
              <SidebarLink key={item.to} item={item} onClose={() => setSidebarOpen(false)} />
            ))}
          </>
        )}

        {/* Group: Admin */}
        {isAdmin && (
          <>
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--pulse-muted)] mt-3 mb-1">Admin</p>
            {navItems.filter(n => n.to.startsWith('/admin')).map(item => (
              <SidebarLink key={item.to} item={item} onClose={() => setSidebarOpen(false)} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-[var(--pulse-border)]">
        <button
          onClick={() => { navigate('/profile'); setSidebarOpen(false); }}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--pulse-surface-2)] transition-colors text-left"
        >
          <Avatar user={user} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-[11px] text-[var(--pulse-muted)] truncate">{user?.email}</p>
          </div>
        </button>
        <button
          onClick={handleLogout}
          className="w-full mt-1 flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--pulse-muted)] hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:flex sticky top-0 h-screen">
        <SidebarContent />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full"><SidebarContent /></div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-[var(--pulse-bg)]/90 backdrop-blur border-b border-[var(--pulse-border)] flex items-center px-4 gap-3">
          <button className="md:hidden text-[var(--pulse-muted)] hover:text-[var(--pulse-text)]" onClick={() => setSidebarOpen(true)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />

          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(s => !s)}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--pulse-surface-2)] text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--pulse-accent)]" />
              )}
            </button>

            {showNotifs && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
                <div className="absolute right-0 top-11 w-80 bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl shadow-2xl z-50 animate-fade-in overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--pulse-border)]">
                    <span className="text-sm font-semibold">Notifications {unread > 0 && <Badge variant="accent">{unread}</Badge>}</span>
                    {unread > 0 && <button onClick={handleMarkAllRead} className="text-xs text-[var(--pulse-accent)] hover:underline">Mark all read</button>}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[var(--pulse-border)]">
                    {notifications.length === 0
                      ? <p className="text-sm text-[var(--pulse-muted)] text-center py-10">No notifications</p>
                      : notifications.slice(0, 10).map(n => (
                          <div key={n.id} className={`px-4 py-3 ${!n.is_read ? 'bg-[var(--pulse-accent-soft)]' : ''}`}>
                            <p className="text-sm font-medium">{n.title}</p>
                            {n.body && <p className="text-xs text-[var(--pulse-muted)] mt-0.5 line-clamp-2">{n.body}</p>}
                            <p className="text-[10px] text-[var(--pulse-muted)] mt-1">{new Date(n.created_at).toLocaleString()}</p>
                          </div>
                        ))
                    }
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-4 md:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarLink({ item, onClose }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150
        ${isActive
          ? 'bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] font-medium'
          : 'text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] hover:bg-[var(--pulse-surface-2)]'
        }`
      }
    >
      <span className="text-base w-5 text-center">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}
