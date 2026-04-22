import { useState, useEffect, useRef } from 'react';
import { yeastarApi } from '../api';

const formatDuration = (seconds) => {
  const s = parseInt(seconds) || 0;
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
};

const formatTime = (timeStr) => {
  // Yeastar returns "2025/04/22 14:35:22"
  if (!timeStr) return '';
  const parts = timeStr.split(' ');
  if (parts.length < 2) return timeStr;
  return parts[1].substring(0, 5); // HH:MM
};

export default function YeastarActivity({ onAddWorkItem }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const addedRef = useRef(false);

  useEffect(() => {
    yeastarApi.getTodayActivity()
      .then(r => setData(r.data))
      .catch(() => setData({ configured: false, reason: 'error', calls: [] }))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (uid) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // When selection changes, notify parent
  useEffect(() => {
    if (selected.size > 0) {
      const myExt = data?.extension;
      const calls = (data?.calls || [])
        .filter(c => selected.has(c.uid))
        .map(c => ({ ...c, isCaller: c.call_from_number === myExt }));
      onAddWorkItem && onAddWorkItem(calls);
    } else {
      onAddWorkItem && onAddWorkItem([]);
    }
  }, [selected]);

  if (loading) return (
    <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] p-3">
      <p className="text-xs text-[var(--pulse-muted)]">Loading calls...</p>
    </div>
  );

  if (!data?.configured) {
    if (data?.reason === 'no_extension') return (
      <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] p-3">
        <p className="text-xs font-semibold mb-0.5">📞 Phone Calls</p>
        <p className="text-xs text-[var(--pulse-muted)]">Set your extension number in Profile to see today's calls.</p>
      </div>
    );
    if (data?.reason === 'not_configured') return null; // Yeastar not set up — hide silently
    return null;
  }

  const calls = data?.calls || [];

  return (
    <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--pulse-border)]">
        <p className="text-xs font-semibold">📞 Phone Calls Today</p>
        <span className="text-[10px] text-[var(--pulse-muted)]">Ext {data.extension}</span>
      </div>

      {calls.length === 0 ? (
        <p className="text-xs text-[var(--pulse-muted)] px-3 py-3">No calls today.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--pulse-border)]">
          {calls.map(call => {
            const isSelected = selected.has(call.uid);
            const myExt = data.extension;
            const isCaller = call.call_from_number === myExt;
            const otherName = isCaller ? call.call_to_name : call.call_from_name;
            const otherNumber = isCaller ? call.call_to_number : call.call_from_number;
            const direction = isCaller ? '↑' : '↓';
            const dirLabel = isCaller ? 'Outgoing' : 'Incoming';

            return (
              <label key={call.uid}
                className={'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ' + (isSelected ? 'bg-[var(--pulse-accent)]/10' : 'hover:bg-[var(--pulse-surface-2)]')}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(call.uid)}
                  className="accent-[var(--pulse-accent)] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={'text-[10px] font-bold ' + (isCaller ? 'text-blue-400' : 'text-green-400')}>{direction}</span>
                    <p className="text-xs font-medium truncate">{otherName || otherNumber}</p>
                    {otherName && otherNumber && otherName !== otherNumber && (
                      <span className="text-[10px] text-[var(--pulse-muted)] shrink-0">ext {otherNumber}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--pulse-muted)]">{formatTime(call.time)}</span>
                    <span className="text-[10px] text-[var(--pulse-muted)]">{formatDuration(call.talk_duration)}</span>
                    <span className="text-[10px] text-[var(--pulse-muted)]">{dirLabel}</span>
                    {call.call_type && <span className="text-[10px] text-[var(--pulse-muted)]">{call.call_type}</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="px-3 py-2 border-t border-[var(--pulse-border)] bg-[var(--pulse-accent)]/10">
          <p className="text-[10px] text-[var(--pulse-accent)]">{selected.size} call{selected.size !== 1 ? 's' : ''} selected — will be added as a work item on submit</p>
        </div>
      )}
    </div>
  );
}
