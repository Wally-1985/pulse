import { useState, useEffect } from 'react';
import { zendeskApi } from '../api';
import { Card, Badge, Spinner } from './ui';

const STATUS_COLOURS = { new: 'danger', open: 'warning', pending: 'info', hold: 'default', solved: 'success', closed: 'default' };
const ACTIVITY_COLOURS = { 'Public Reply': 'success', 'Internal Note': 'info', 'Reopened': 'warning', 'Ticket Created': 'accent' };
const getActivityVariant = (a) => ACTIVITY_COLOURS[a] || 'default';

export default function ZendeskActivity({ onAddTicket, readOnly, entryDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(new Set());

  const load = () => {
    setLoading(true);
    zendeskApi.getTodayActivity(entryDate)
      .then(r => setData(r.data))
      .catch(() => setData({ configured: false, tickets: [], error: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = (ticket) => {
    if (readOnly || !onAddTicket) return;
    onAddTicket(ticket);
    setAdded(prev => new Set([...prev, ticket.id]));
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Today's Zendesk Activity</span>
          {data?.tickets?.length > 0 && <Badge variant="accent">{data.tickets.length}</Badge>}
        </div>
        <button onClick={load} className="text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] transition-colors" title="Refresh">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : !data?.configured ? (
        <p className="text-xs text-[var(--pulse-muted)]">
          Configure Zendesk in your <a href="/profile" className="text-[var(--pulse-accent)] hover:underline">Profile</a> to see ticket activity here.
        </p>
      ) : data.tickets.length === 0 ? (
        <p className="text-xs text-[var(--pulse-muted)] py-1">No Zendesk activity today.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.tickets.map(ticket => {
            const activities = ticket.replyType ? ticket.replyType.split(' · ') : [];
            const isAdded = added.has(ticket.id);
            return (
              <div key={ticket.id} className="p-2.5 rounded-lg bg-[var(--pulse-surface-2)] border border-transparent">
                <div className="flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <a href={ticket.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono font-bold text-[var(--pulse-accent)] hover:underline shrink-0">
                        #{ticket.id}
                      </a>
                      <Badge variant={STATUS_COLOURS[ticket.status] || 'default'}>{ticket.status}</Badge>
                    </div>
                    <p className="text-xs text-[var(--pulse-text)] leading-snug break-words mb-1.5">{ticket.subject}</p>
                    <div className="flex flex-wrap gap-1">
                      {activities.map((a, i) => (
                        <Badge key={i} variant={getActivityVariant(a)}>{a}</Badge>
                      ))}
                    </div>
                  </div>
                  {!readOnly && onAddTicket && (
                    <button
                      onClick={() => handleAdd(ticket)}
                      disabled={isAdded}
                      className={'text-[10px] px-1.5 py-0.5 rounded shrink-0 transition-colors ' + (isAdded ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] hover:bg-[var(--pulse-accent)] hover:text-white')}
                    >
                      {isAdded ? '✓ Added' : '+ Add'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
