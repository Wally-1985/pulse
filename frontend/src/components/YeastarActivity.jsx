import { useState, useEffect } from 'react';
import { yeastarApi } from '../api';

const formatDuration = (seconds) => {
  const s = parseInt(seconds) || 0;
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.split(' ');
  if (parts.length < 2) return timeStr;
  return parts[1].substring(0, 5);
};

export default function YeastarActivity({ onAddCall }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(new Set());

  useEffect(() => {
    yeastarApi.getTodayActivity()
      .then(r => setData(r.data))
      .catch(() => setData({ configured: false, reason: 'error', calls: [] }))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = (call) => {
    if (!onAddCall) return;
    const isCaller = call.call_from_number === data?.extension;
    onAddCall({ ...call, isCaller });
    setAdded(prev => new Set([...prev, call.uid]));
  };

  if (loading) return (
    <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] p-3">
      <p className="text-xs text-[var(--pulse-muted)]">Loading calls...</p>
    </div>
  );

  if (!data?.configured) {
    if (data?.reason === 'not_configured') return null;
    return (
      <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] p-3">
        <p className="text-xs font-semibold mb-0.5">📞 Today's Phone Calls</p>
        <p className="text-xs text-[var(--pulse-muted)]">Add your extension number in <a href="/profile" className="text-[var(--pulse-accent)] hover:underline">Profile settings</a> to see today&apos;s calls.</p>
      </div>
    );
  }

  const calls = data?.calls || [];

  return (
    <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--pulse-border)]">
        <p className="text-xs font-semibold">📞 Today's Phone Calls</p>
        <span className="text-[10px] text-[var(--pulse-muted)]">Ext {data.extension}</span>
      </div>

      {calls.length === 0 ? (
        <p className="text-xs text-[var(--pulse-muted)] px-3 py-3">No calls today.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--pulse-border)]">
          {calls.map(call => {
            const myExt = data.extension;
            const isCaller = call.call_from_number === myExt;
            const otherName = isCaller ? call.call_to_name : call.call_from_name;
            const otherNumber = isCaller ? call.call_to_number : call.call_from_number;
            const direction = isCaller ? '↑' : '↓';
            const dirLabel = isCaller ? 'Outgoing' : 'Incoming';
            const isAdded = added.has(call.uid);

            return (
              <div key={call.uid} className="flex items-center gap-2.5 px-3 py-2">
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
                  </div>
                </div>
                {onAddCall && (
                  <button
                    onClick={() => handleAdd(call)}
                    disabled={isAdded}
                    className={'text-[10px] px-1.5 py-0.5 rounded shrink-0 transition-colors ' + (isAdded ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] hover:bg-[var(--pulse-accent)] hover:text-white')}
                  >
                    {isAdded ? '✓ Added' : '+ Add'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
