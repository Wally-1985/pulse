import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { entriesApi } from '../../api';
import { format, subWeeks, addWeeks } from 'date-fns';
import { Card, Badge, Button, Spinner } from '../../components/ui';
import { usePageTitle } from '../../hooks/usePageTitle';

const COLOURS = ['#6366f1','#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f97316'];

// Always use local date - never toISOString() which shifts by timezone
const localDate = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

const today = () => localDate(new Date());

const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
};

export default function EntriesListPage() {
  usePageTitle('My Entries');
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const todayStr = today();

  const weekStartDate = weekOffset === 0
    ? getWeekStart()
    : getWeekStart(addWeeks(new Date(), weekOffset));

  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return localDate(d);
  });

  useEffect(() => {
    setLoading(true);
    entriesApi.getWeekEntries(localDate(weekStartDate))
      .then(r => setEntries(r.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [weekOffset]);

  const entryForDate = (date) =>
    entries.find(e => String(e.entry_date).substring(0,10) === date);

  const weekLabel = weekOffset === 0 ? 'This Week'
    : weekOffset === -1 ? 'Last Week'
    : format(weekStartDate, 'MMM d, yyyy');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">My Entries</h1>
        <Button onClick={() => navigate('/entry?date=' + todayStr)}>+ Log Today</Button>
      </div>

      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev week</Button>
        <span className="text-sm font-medium">{weekLabel}</span>
        <Button variant="ghost" size="sm" disabled={weekOffset >= 0} onClick={() => setWeekOffset(w => w + 1)}>Next week →</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {weekDays.map(date => {
            const entry = entryForDate(date);
            const isToday = date === todayStr;
            const isFuture = date > todayStr;
            const dayName = format(new Date(date + 'T00:00:00'), 'EEE');
            const dayNum = format(new Date(date + 'T00:00:00'), 'd');

            return (
              <Card
                key={date}
                className={`overflow-hidden cursor-pointer transition-all hover:border-[var(--pulse-accent)]/40
                  ${isToday ? 'border-[var(--pulse-accent)]/40' : ''}
                  ${isFuture ? 'opacity-50' : ''}
                `}
                onClick={() => navigate('/entry?date=' + date)}
              >
                <div className="flex items-start gap-3 p-4">
                  <div className={`w-12 shrink-0 text-center rounded-lg py-2 ${isToday ? 'bg-[var(--pulse-accent)]' : 'bg-[var(--pulse-surface-2)]'}`}>
                    <p className={`text-xs ${isToday ? 'text-white/70' : 'text-[var(--pulse-muted)]'}`}>{dayName}</p>
                    <p className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-[var(--pulse-text)]'}`}>{dayNum}</p>
                  </div>

                  <div className="flex-1 min-w-0">
                    {!entry ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-[var(--pulse-muted)]">{isFuture ? 'Upcoming' : 'No entry'}</p>
                        {!isFuture && <Badge variant="danger">Missing</Badge>}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{entry.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
                          <Badge variant={entry.status === 'submitted' ? 'success' : 'warning'}>
                            {entry.status === 'submitted' ? '✓ Submitted' : 'Draft'}
                          </Badge>
                        </div>
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
                        {entry.work_items?.length > 0 && <MiniTimeBar items={entry.work_items} />}
                      </>
                    )}
                  </div>

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
        <div key={i} style={{ width: ((item.time_minutes / total) * 100) + '%', background: COLOURS[i % COLOURS.length] }} />
      ))}
    </div>
  );
}
