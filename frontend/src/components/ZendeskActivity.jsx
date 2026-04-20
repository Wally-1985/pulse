import { useState, useEffect } from 'react';
import { zendeskApi } from '../api';
import { Card, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';

const STATUS_COLOURS = { new: 'danger', open: 'warning', pending: 'info', hold: 'default', solved: 'success', closed: 'default' };

export default function ZendeskActivity({ onAddWorkItem }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);

  const load = () => {
    setLoading(true);
    zendeskApi.getTodayActivity()
      .then(r => setData(r.data))
      .catch(() => setData({ configured: false, tickets: [], error: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (ticket) => {
    if (!onAddWorkItem) return;
    setAdding(ticket.id);
    try {
      onAddWorkItem({ detail: 'Zendesk #' + ticket.id + ' - ' + ticket.subject + ' (' + ticket.replyType + ')', workType: 'bau_support' });
      toast.success('Work item added for #' + ticket.id);
    } catch { toast.error('Failed to add work item'); }
    finally { setAdding(null); }
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
          {data.tickets.map(ticket => (
            <div key={ticket.id} className="p-2.5 bg-[var(--pulse-surface-2)] rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <a href={ticket.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="text-xs font-mono font-bold text-[var(--pulse-accent)] hover:underline">
                      #{ticket.id}
                    </a>
                    <Badge variant={STATUS_COLOURS[ticket.status] || 'default'}>{ticket.status}</Badge>
                    <Badge variant={ticket.replyType.includes('Public') ? 'success' : 'info'}>
                      {ticket.replyType}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--pulse-text)] leading-snug break-words">{ticket.subject}</p>
                </div>
                {onAddWorkItem && (
                  <button
                    onClick={() => handleAdd(ticket)}
                    disabled={adding === ticket.id}
                    className="shrink-0 text-[10px] px-2 py-1 rounded-md bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] hover:bg-[var(--pulse-accent)] hover:text-white transition-colors disabled:opacity-50"
                  >
                    {adding === ticket.id ? '...' : '+ Add'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}