import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { managerApi } from '../../api';
import { format, startOfWeek, subWeeks, addDays, eachDayOfInterval } from 'date-fns';
import { Card, Badge, Avatar, Spinner, Button, Empty } from '../../components/ui';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const WORK_TYPE_COLOURS = {
  project: '#6366f1',
  bau_support: '#f59e0b',
  maintenance: '#10b981',
  lunch: '#6b7280',
  other: '#8b5cf6',
};

const localDate = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const todayStr = () => localDate(new Date());
const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDate(d);
};

const weekDays = (weekStart) => {
  const start = new Date(weekStart + 'T00:00:00');
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return localDate(d);
  });
};

export default function ManagerDashboard() {
  usePageTitle('Team Dashboard');
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState(todayStr());
  const [dayMembers, setDayMembers] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'week' | 'charts'

  const thisWeek = getWeekStart();
  const lastWeek = getWeekStart(subWeeks(new Date(), 1));
  const days = weekDays(thisWeek);

  useEffect(() => {
    loadDayStatus(activeDay);
  }, [activeDay]);

  useEffect(() => {
    loadWeeklySummary();
    loadCharts();
  }, []);

  const loadDayStatus = async (date) => {
    try {
      const { data } = await managerApi.getDayStatus(date);
      setDayMembers(data);
    } catch {
      toast.error('Failed to load day status');
    } finally {
      setLoading(false);
    }
  };

  const loadWeeklySummary = async () => {
    try {
      const { data } = await managerApi.getWeeklySummary(thisWeek);
      setWeeklySummary(data);
    } catch {}
  };

  const loadCharts = async () => {
    const from = format(subWeeks(new Date(), 4), 'yyyy-MM-dd');
    const to = todayStr();
    try {
      const { data } = await managerApi.getChartData(from, to);
      setChartData(data);
    } catch {}
  };

  const groupByTeam = (members) => {
    const groups = {};
    members.forEach(m => {
      if (!groups[m.teamName]) groups[m.teamName] = [];
      groups[m.teamName].push(m);
    });
    return groups;
  };

  const getStatusCounts = (members) => ({
    submitted: members.filter(m => m.status === 'submitted').length,
    draft: members.filter(m => m.status === 'draft').length,
    missing: members.filter(m => m.status === 'missing').length,
    total: members.filter(m => m.status !== 'leave').length,
  });

  const getDayTabVariant = (date) => {
    const members = date === activeDay ? dayMembers : [];
    if (members.length === 0) return 'default';
    const counts = getStatusCounts(members);
    const pctMissing = counts.missing / counts.total;
    if (pctMissing > 0.5) return 'danger';
    if (pctMissing > 0) return 'warning';
    return 'success';
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Team Dashboard</h1>
          <p className="text-sm text-[var(--pulse-muted)] mt-0.5">Week of {format(new Date(thisWeek + 'T00:00:00'), 'MMM d, yyyy')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl mb-6 w-fit">
        {[
          { key: 'today', label: 'Daily Status' },
          { key: 'week', label: 'This Week' },
          { key: 'charts', label: 'Charts' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-[var(--pulse-accent)] text-white shadow-sm'
                : 'text-[var(--pulse-muted)] hover:text-[var(--pulse-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* DAILY STATUS TAB */}
      {activeTab === 'today' && (
        <>
          {/* Day tabs */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {days.map((d, i) => {
              const isToday = d === todayStr();
              const isActive = d === activeDay;
              const counts = d === activeDay ? getStatusCounts(dayMembers) : null;
              return (
                <button
                  key={d}
                  onClick={() => setActiveDay(d)}
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl border text-sm font-medium transition-all shrink-0
                    ${isActive
                      ? 'bg-[var(--pulse-accent)] border-[var(--pulse-accent)] text-white'
                      : 'border-[var(--pulse-border)] text-[var(--pulse-muted)] hover:border-[var(--pulse-accent)]/50 hover:text-[var(--pulse-text)]'
                    }`}
                >
                  <span>{DAYS[i]}</span>
                  {isToday && <span className="text-xs opacity-70">Today</span>}
                  {isActive && counts && (
                    <span className="text-xs opacity-80">
                      {counts.submitted}/{counts.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : dayMembers.length === 0 ? (
            <Empty icon="👥" title="No team members found" description="Assign team members to get started." />
          ) : (
            Object.entries(groupByTeam(dayMembers)).map(([teamName, members]) => (
              <div key={teamName} className="mb-6">
                <p className="text-xs font-semibold text-[var(--pulse-muted)] uppercase tracking-wider mb-3">{teamName}</p>
                <div className="flex flex-col gap-2">
                  {members.map(member => (
                    <MemberCard
                      key={member.userId}
                      member={member}
                      date={activeDay}
                      onView={() => navigate(`/entry?date=${activeDay}&userId=${member.userId}`)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* WEEKLY SUMMARY TAB */}
      {activeTab === 'week' && (
        <WeeklySummaryTab summary={weeklySummary} weekStart={thisWeek} />
      )}

      {/* CHARTS TAB */}
      {activeTab === 'charts' && (
        <ChartsTab data={chartData} />
      )}
    </div>
  );
}

function MemberCard({ member, date, onView }) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = {
    submitted: { label: 'Submitted', variant: 'success' },
    draft: { label: 'Draft', variant: 'warning' },
    missing: { label: 'Missing', variant: 'danger' },
    leave: { label: 'On Leave', variant: 'info' },
  };
  const sc = statusConfig[member.status] || statusConfig.missing;

  const workTypeSummary = (items) => {
    const totals = {};
    items.forEach(i => {
      totals[i.work_type] = (totals[i.work_type] || 0) + i.time_minutes;
    });
    return Object.entries(totals).map(([type, mins]) => ({ type, mins }));
  };

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--pulse-surface-2)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Avatar user={{ firstName: member.firstName, lastName: member.lastName, avatarUrl: member.avatarUrl }} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{member.firstName} {member.lastName}</p>
          {member.submittedAt && (
            <p className="text-xs text-[var(--pulse-muted)]">
              {format(new Date(member.submittedAt), 'h:mm a')}
              {member.isStillEditable && ' · editable'}
            </p>
          )}
        </div>
        <Badge variant={sc.variant}>{sc.label}</Badge>
        {member.status === 'submitted' && (
          <svg className={`w-4 h-4 text-[var(--pulse-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {expanded && member.workItems?.length > 0 && (
        <div className="px-4 pb-4 border-t border-[var(--pulse-border)] pt-3">
          <div className="flex flex-col gap-1.5 mb-3">
            {member.workItems.map((wi, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: WORK_TYPE_COLOURS[wi.work_type] || '#6b7280' }} />
                <p className="text-sm text-[var(--pulse-text)] flex-1 min-w-0 break-words">{wi.detail}</p>
                <span className="text-xs text-[var(--pulse-muted)] shrink-0 font-mono">{wi.time_minutes}m</span>
              </div>
            ))}
          </div>
          {member.status === 'submitted' && (
            <Button size="xs" variant="ghost" onClick={onView}>View full entry →</Button>
          )}
        </div>
      )}
    </Card>
  );
}

function WeeklySummaryTab({ summary, weekStart }) {
  if (!summary) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!summary.users?.length) return <Empty icon="📊" title="No data yet" description="Team activity will appear here." />;

  return (
    <div className="flex flex-col gap-4">
      {summary.users.map(u => (
        <Card key={u.id} className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar user={u} size="sm" />
            <div className="flex-1">
              <p className="text-sm font-medium">{u.first_name} {u.last_name}</p>
              <p className="text-xs text-[var(--pulse-muted)]">{u.submittedDays} days submitted this week</p>
            </div>
            <Badge variant={u.submittedDays >= 5 ? 'success' : u.submittedDays >= 3 ? 'warning' : 'danger'}>
              {u.submittedDays}/5
            </Badge>
          </div>
          {Object.keys(u.workTypeStats).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(u.workTypeStats).map(([type, mins]) => (
                <div key={type} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: `${WORK_TYPE_COLOURS[type]}20`, color: WORK_TYPE_COLOURS[type] }}>
                  <span className="font-medium">{type.replace('_', ' ')}</span>
                  <span className="opacity-70">{Math.round(mins / 60)}h</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ChartsTab({ data }) {
  if (!data) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const pieData = (data.workTypeDistribution || []).map(d => ({
    name: d.work_type?.replace('_', ' ') || 'other',
    value: Math.round(d.total_minutes / 60),
  }));

  const barData = (data.dailyActivity || []).map(d => ({
    date: format(new Date(d.entry_date + 'T00:00:00'), 'MMM d'),
    submitted: parseInt(d.submitted),
  }));

  const pieColours = Object.values(WORK_TYPE_COLOURS);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="p-5">
        <p className="text-sm font-semibold mb-4">Work Type Distribution</p>
        {pieData.length === 0 ? (
          <Empty icon="📊" title="No data" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={pieColours[i % pieColours.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}h`} contentStyle={{ background: 'var(--pulse-surface)', border: '1px solid var(--pulse-border)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-5">
        <p className="text-sm font-semibold mb-4">Daily Submissions</p>
        {barData.length === 0 ? (
          <Empty icon="📈" title="No data" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <XAxis dataKey="date" tick={{ fill: 'var(--pulse-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--pulse-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--pulse-surface)', border: '1px solid var(--pulse-border)', borderRadius: 8 }} />
              <Bar dataKey="submitted" fill="var(--pulse-accent)" radius={[4, 4, 0, 0]} name="Submitted" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
