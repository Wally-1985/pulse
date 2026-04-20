import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { Button, Card } from '../../components/ui';
import { usePageTitle } from '../../hooks/usePageTitle';

export default function DashboardPage() {
  usePageTitle('Home');
  const { user, isManager } = useAuth();
  const navigate = useNavigate();
  const d = new Date(); const today = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const dayName = format(new Date(), 'EEEE');
  const dateLabel = format(new Date(), 'MMMM d, yyyy');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="text-sm text-[var(--pulse-muted)]">{dayName}, {dateLabel}</p>
        <h1 className="text-2xl font-semibold mt-1">
          Good {getTimeOfDay()}, {user?.firstName} 👋
        </h1>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Card
          className="p-5 cursor-pointer hover:border-[var(--pulse-accent)]/50 transition-colors group"
          onClick={() => navigate(`/entry?date=${today}`)}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--pulse-accent-soft)] flex items-center justify-center text-xl">⚡</div>
            <svg className="w-4 h-4 text-[var(--pulse-muted)] group-hover:text-[var(--pulse-accent)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <p className="font-medium">Log Today</p>
          <p className="text-sm text-[var(--pulse-muted)] mt-0.5">Add or update today's entry</p>
        </Card>

        <Card
          className="p-5 cursor-pointer hover:border-[var(--pulse-accent)]/50 transition-colors group"
          onClick={() => navigate('/entries')}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--pulse-accent-soft)] flex items-center justify-center text-xl">📋</div>
            <svg className="w-4 h-4 text-[var(--pulse-muted)] group-hover:text-[var(--pulse-accent)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <p className="font-medium">Past Entries</p>
          <p className="text-sm text-[var(--pulse-muted)] mt-0.5">View and edit previous days</p>
        </Card>
      </div>

      {isManager && (
        <div className="pt-6 border-t border-[var(--pulse-border)]">
          <p className="text-sm font-medium text-[var(--pulse-muted)] mb-3 uppercase tracking-wider text-xs">Manager</p>
          <Card
            className="p-5 cursor-pointer hover:border-[var(--pulse-accent)]/50 transition-colors group"
            onClick={() => navigate('/manager')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--pulse-accent-soft)] flex items-center justify-center text-xl">👥</div>
                <div>
                  <p className="font-medium">Team Dashboard</p>
                  <p className="text-sm text-[var(--pulse-muted)]">View your team's activity</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-[var(--pulse-muted)] group-hover:text-[var(--pulse-accent)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
