import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { managerApi, zendeskApi, projectsApi } from '../../api';
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
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'week' | 'charts' | 'zendesk' | 'submissions'

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
          { key: 'submissions', label: 'Submission Status' },
          { key: 'zendesk', label: 'Zendesk Activity' },
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

      {activeTab === 'zendesk' && (
        <ZendeskTeamTab />
      )}

      {activeTab === 'submissions' && (
        <SubmissionStatusTab />
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

const STATUS_COLOURS = { new: 'bg-red-500/20 text-red-400', open: 'bg-amber-500/20 text-amber-400', pending: 'bg-blue-500/20 text-blue-400', hold: 'bg-gray-500/20 text-gray-400', solved: 'bg-green-500/20 text-green-400', closed: 'bg-gray-500/20 text-gray-400' };
const PRIORITY_COLOURS = { urgent: 'bg-red-500/20 text-red-400', high: 'bg-orange-500/20 text-orange-400', normal: 'bg-blue-500/20 text-blue-400', low: 'bg-gray-500/20 text-gray-400' };
const ACTIVITY_COLOURS = { 'Public Reply': 'bg-green-500/20 text-green-400', 'Internal Note': 'bg-blue-500/20 text-blue-400', 'Ticket Created': 'bg-purple-500/20 text-purple-400', 'Reopened': 'bg-amber-500/20 text-amber-400' };

function ZendeskTeamTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('updated');

  const load = async () => {
    setLoading(true);
    try {
      const r = await zendeskApi.getTeamTodayActivity();
      setData(r.data);
    } catch (err) {
      setData({ tickets: [], error: err.response?.data?.error || 'Failed to load' });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const allMembers = data ? [...new Map(
    data.tickets.flatMap(t => t.members.map(m => [m.userId, m.name]))
  ).entries()].map(([id, name]) => ({ id, name })) : [];

  const filtered = (data?.tickets || []).filter(t => {
    if (filterMember && !t.members.find(m => m.userId === filterMember)) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'priority') {
      const order = { urgent: 0, high: 1, normal: 2, low: 3, null: 4 };
      return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-[var(--pulse-muted)]">
            {data?.date && `Today's Zendesk activity — ${data.date}`}
            {data?.configuredCount < data?.memberCount && ` · ${data.memberCount - data.configuredCount} member(s) without Zendesk configured`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)]">
            <option value="">All Members</option>
            {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)]">
            <option value="">All Statuses</option>
            {['new', 'open', 'pending', 'hold', 'solved', 'closed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)]">
            <option value="updated">Sort: Last Updated</option>
            <option value="priority">Sort: Priority</option>
          </select>
          <button onClick={load} className="text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] transition-colors p-1" title="Refresh">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>

      {data?.error && <p className="text-sm text-red-400">{data.error}</p>}

      {filtered.length === 0 && !data?.error && (
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--pulse-muted)]">No Zendesk activity found for today.</p>
          <p className="text-xs text-[var(--pulse-muted)] mt-1">Team members need Zendesk configured in their Profile settings.</p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map(ticket => (
          <Card key={ticket.id + ticket.subdomain} className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <a href={ticket.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-mono font-bold text-[var(--pulse-accent)] hover:underline shrink-0">
                    #{ticket.id}
                  </a>
                  <span className={'text-xs px-1.5 py-0.5 rounded-md font-medium ' + (STATUS_COLOURS[ticket.status] || 'bg-gray-500/20 text-gray-400')}>{ticket.status}</span>
                  {ticket.priority && <span className={'text-xs px-1.5 py-0.5 rounded-md font-medium ' + (PRIORITY_COLOURS[ticket.priority] || '')}>{ticket.priority}</span>}
                  {ticket.awaitingResponse && <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-medium">Awaiting Response</span>}
                  <span className="text-xs text-[var(--pulse-muted)] ml-auto">{ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
                <p className="text-sm text-[var(--pulse-text)] mb-2">{ticket.subject}</p>
                <div className="flex flex-col gap-1.5">
                  {ticket.members.map(m => (
                    <div key={m.userId} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-[var(--pulse-muted)] shrink-0">{m.name}</span>
                      <div className="flex gap-1 flex-wrap">
                        {m.activities.map((a, i) => (
                          <span key={i} className={'text-xs px-1.5 py-0.5 rounded-md ' + (ACTIVITY_COLOURS[a] || (a.startsWith('Status') ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-500/20 text-gray-400'))}>{a}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <a href={ticket.url} target="_blank" rel="noopener noreferrer"
                className="shrink-0 text-xs px-2 py-1 rounded-lg bg-[var(--pulse-surface-2)] text-[var(--pulse-muted)] hover:text-[var(--pulse-accent)] hover:bg-[var(--pulse-accent-soft)] transition-colors">
                Open ↗
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SubmissionStatusTab() {
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const [date, setDate] = useState(todayStr());
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async (d) => {
    setLoading(true);
    try {
      const { data } = await managerApi.getDayStatus(d);
      setMembers(data);
    } catch { setMembers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(date); }, [date]);

  const submitted = members.filter(m => m.status === 'submitted');
  const missing = members.filter(m => m.status === 'missing' || m.status === 'draft');
  const rosteredOff = members.filter(m => m.status === 'rostered_off' || m.status === 'holiday' || m.status === 'leave');

  const statusConfig = {
    submitted: { label: 'Submitted', colour: 'bg-green-500/20 text-green-400 border-green-500/30' },
    draft: { label: 'In Progress', colour: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    missing: { label: 'Not Submitted', colour: 'bg-red-500/20 text-red-400 border-red-500/30' },
    rostered_off: { label: 'Rostered Off', colour: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    holiday: { label: 'Public Holiday', colour: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    leave: { label: 'On Leave', colour: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--pulse-muted)]">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)]" />
        </div>
        {!loading && (
          <div className="flex gap-3 text-sm">
            <span className="text-green-400 font-medium">{submitted.length} submitted</span>
            <span className="text-red-400 font-medium">{missing.length} not submitted</span>
            <span className="text-[var(--pulse-muted)]">{rosteredOff.length} off</span>
          </div>
        )}
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div> : (
        <div className="flex flex-col gap-2">
          {members.length === 0 && <Card className="p-8 text-center"><p className="text-sm text-[var(--pulse-muted)]">No team members found.</p></Card>}
          {members.map(m => {
            const cfg = statusConfig[m.status] || statusConfig.missing;
            return (
              <div key={m.userId} className="flex items-center gap-3 px-4 py-3 bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl">
                <Avatar user={{ firstName: m.firstName, lastName: m.lastName }} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-[var(--pulse-muted)]">{m.teamName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.status === 'submitted' && m.submittedAt && (
                    <span className="text-xs text-[var(--pulse-muted)]">
                      {new Date(m.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <span className={'text-xs px-2.5 py-1 rounded-lg border font-medium ' + cfg.colour}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


const STATUS_LABELS = { high_priority_not_started: 'High Priority', not_started: 'Not Started', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed' };
const STATUS_BADGE_COLOURS = { high_priority_not_started: 'danger', not_started: 'default', in_progress: 'accent', on_hold: 'warning', completed: 'success' };
const HEALTH_DOT = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', completed: 'bg-gray-400' };

function ProjectsManagerTab() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('active');

  useEffect(() => {
    projectsApi.getProjects()
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter(p => {
    if (filterStatus === 'active') return ['in_progress', 'high_priority_not_started', 'not_started'].includes(p.status);
    if (filterStatus === 'all') return true;
    return p.status === filterStatus;
  });

  const atRisk = projects.filter(p => p.health === 'red' && p.status !== 'completed').length;
  const stalled = projects.filter(p => p.health === 'amber' && p.status !== 'completed').length;

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-sm">
          {atRisk > 0 && <span className="text-red-400 font-medium">● {atRisk} at risk</span>}
          {stalled > 0 && <span className="text-amber-400 font-medium">● {stalled} stalled</span>}
          {atRisk === 0 && stalled === 0 && <span className="text-green-400 font-medium">● All projects healthy</span>}
        </div>
        <div className="flex items-center gap-2">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)]">
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
          <Button size="sm" onClick={() => navigate('/projects')}>View All Projects</Button>
        </div>
      </div>

      {filtered.length === 0 && (
        <Card className="p-8 text-center"><p className="text-sm text-[var(--pulse-muted)]">No projects found.</p></Card>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map(project => (
          <Card key={project.id} className="p-4 cursor-pointer hover:border-[var(--pulse-accent)]/40 transition-colors"
            onClick={() => navigate('/projects/' + project.id)}>
            <div className="flex items-start gap-3">
              <div className={'w-2 h-2 rounded-full mt-1.5 shrink-0 ' + (HEALTH_DOT[project.health] || 'bg-gray-400')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-semibold">{project.name}</p>
                  <Badge variant={STATUS_BADGE_COLOURS[project.status] || 'default'}>
                    {STATUS_LABELS[project.status] || project.status}
                  </Badge>
                  {project.status === 'in_progress' && project.priority && (
                    <Badge variant="warning">P{project.priority}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--pulse-muted)]">
                  {parseInt(project.task_count) > 0 && <span>{project.completed_task_count}/{project.task_count} tasks</span>}
                  {project.last_activity_at && <span>Last activity {new Date(project.last_activity_at).toLocaleDateString()}</span>}
                  {!project.last_activity_at && <span className="text-red-400">No activity recorded</span>}
                  {(project.assigned_user_names || []).filter(Boolean).length > 0 && (
                    <span>{project.assigned_user_names.filter(Boolean).join(', ')}</span>
                  )}
                </div>
              </div>
              <svg className="w-4 h-4 text-[var(--pulse-muted)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
