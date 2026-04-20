import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { entriesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { format, startOfWeek, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { Card, Badge, Button, Spinner } from '../../components/ui';

const COLOURS = ['#6366f1','#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f97316'];
const WORK_TYPE_LABELS = { project: 'Project', bau_support: 'BAU / Support', maintenance: 'Maintenance', lunch: 'Lunch', other: 'Other' };

const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0,0,0,0);
  return d;
};

const fmt = (d) => new Date(d + 'T00:00:00').toISOString().split('T')[0];

export default function EntriesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];

  const weekStart = getWeekStart(weekOffset === 0 ? new Date() : addWeeks(new Date(), weekOffset));
  const localDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dy = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dy}`;
  };
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return localDate(d);
  });

  useEffect(() => {
    setLoading(true);
    entriesApi.getWeekEntries(localDate(weekStart))
      .then(r => setEntries(r.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [weekOffset]);

  const entryForDate = (date) => entries.find(e => String(e.entry_date).substring(0,10) === date);
  const weekLabel = weekOffset === 0 ? 'This Week'
    : weekOffset === -1 ? 'Last Week'
    : format(weekStart, 'MMM d, yyyy');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">My Entries</h1>
        <Button onClick={() => navigate(`/entry?date=${today}`)}>
          + Log Today
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
          ← Prev week
        </Button>
        <span className="text-sm font-medium">{weekLabel}</span>
        <Button variant="ghost" size="sm" disabled={weekOffset >= 0} onClick={() => setWeekOffset(w => w + 1)}>
          Next week →
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {weekDays.map(date => {
            const entry = entryForDate(date);
            const isToday = date === today;
            const isFuture = date > today;
            const dateLabel = format(new Date(date + 'T00:00:00'), 'EEE, MMM d');

            return (
              <Card
                key={date}
                className={`overflow-hidden cursor-pointer transition-all hover:border-[var(--pulse-accent)]/40
                  ${isToday ? 'border-[var(--pulse-accent)]/40' : ''}
                  ${isFuture ? 'opacity-50' : ''}
                `}
                onClick={() => navigate(`/entry?date=${date}`)}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Date */}
                  <div className={`w-12 shrink-0 text-center rounded-lg py-2 ${isToday ? 'bg-[var(--pulse-accent)]' : 'bg-[var(--pulse-surface-2)]'}`}>
                    <p className="text-xs text-white/70">{format(new Date(date + 'T00:00:00'), 'EEE')}</p>
                    <p className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-[var(--pulse-text)]'}`}>
                      {format(new Date(date + 'T00:00:00'), 'd')}
                    </p>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {!entry ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-[var(--pulse-muted)]">
                          {isFuture ? 'Upcoming' : 'No entry'}
                        </p>
                        {!isFuture && (
                          <Badge variant="danger">Missing</Badge>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{entry.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
                          <Badge variant={entry.status === 'submitted' ? 'success' : 'warning'}>
                            {entry.status === 'submitted' ? '✓ Submitted' : 'Draft'}
                          </Badge>
                        </div>

                        {/* Work item summary */}
                        {entry.work_items?.length > 0 && (
                          <div className="flex flex-col gap-1 mb-2">
                            {(entry.work_items || []).slice(0, 3).map((wi, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: COLOURS[i % COLOURS.length] }} />
                                <p className="text-xs text-[var(--pulse-muted)] truncate flex-1">{wi.detail || '—'}</p>
                                <span className="text-xs text-[var(--pulse-muted)] font-mono shrink-0">{Math.round(wi.time_minutes / 60 * 10) / 10}h</span>
                              </div>
                            ))}
                            {entry.work_items?.length > 3 && (
                              <p className="text-xs text-[var(--pulse-muted)] pl-3.5">+{entry.work_items.length - 3} more</p>
                            )}
                          </div>
                        )}

                        {/* Mini time bar */}
                        {entry.work_items?.length > 0 && (
                          <MiniTimeBar items={entry.work_items} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-[var(--pulse-muted)] shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniTimeBar({ items }) {
  const total = items.reduce((s, i) => s + (i.time_minutes || 0), 0);
  if (total === 0) return null;
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex mt-1">
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            width: `${(item.time_minutes / total) * 100}%`,
            background: COLOURS[i % COLOURS.length],
          }}
        />
      ))}
    </div>
  );
}
