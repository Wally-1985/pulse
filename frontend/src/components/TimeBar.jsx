import { useState, useRef, useCallback, useEffect } from 'react';

const SNAP = 15; // minutes

const formatTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const formatPct = (mins, total) => `${Math.round((mins / total) * 100)}%`;

const snap = (value, total) => {
  const snapped = Math.round(value / SNAP) * SNAP;
  return Math.max(SNAP, Math.min(total - SNAP, snapped));
};

export default function TimeAllocationBar({ items, totalMinutes, onChange, readOnly = false }) {
  const barRef = useRef(null);
  const dragging = useRef(null); // { dividerIndex, startX, startTimes }
  const [tooltip, setTooltip] = useState(null); // { index, x }

  // Divider positions (in minutes from start)
  const dividers = items.slice(0, -1).reduce((acc, item, i) => {
    acc.push((acc[i - 1] || 0) + item.timeMinutes);
    return acc;
  }, []);

  const handleMouseDown = useCallback((e, dividerIndex) => {
    if (readOnly) return;
    e.preventDefault();
    const rect = barRef.current.getBoundingClientRect();
    dragging.current = {
      dividerIndex,
      startX: e.clientX,
      barWidth: rect.width,
      startTimes: items.map(i => i.timeMinutes),
    };

    const onMove = (e) => {
      if (!dragging.current) return;
      const { dividerIndex: di, startX, barWidth, startTimes } = dragging.current;
      const deltaX = e.clientX - startX;
      const deltaMins = Math.round((deltaX / barWidth) * totalMinutes);
      const newTimes = [...startTimes];

      const leftIdx = di;
      const rightIdx = di + 1;
      const combined = startTimes[leftIdx] + startTimes[rightIdx];

      let newLeft = snap(startTimes[leftIdx] + deltaMins, combined);
      newLeft = Math.max(SNAP, Math.min(combined - SNAP, newLeft));
      newTimes[leftIdx] = newLeft;
      newTimes[rightIdx] = combined - newLeft;

      const updated = items.map((item, i) => ({
        ...item,
        timeMinutes: newTimes[i],
        isLocked: true,
      }));
      onChange(updated);
    };

    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [items, totalMinutes, onChange, readOnly]);

  // Touch support
  const handleTouchStart = useCallback((e, dividerIndex) => {
    if (readOnly) return;
    const touch = e.touches[0];
    const rect = barRef.current.getBoundingClientRect();
    dragging.current = {
      dividerIndex,
      startX: touch.clientX,
      barWidth: rect.width,
      startTimes: items.map(i => i.timeMinutes),
    };

    const onMove = (e) => {
      if (!dragging.current) return;
      const touch = e.touches[0];
      const { dividerIndex: di, startX, barWidth, startTimes } = dragging.current;
      const deltaX = touch.clientX - startX;
      const deltaMins = Math.round((deltaX / barWidth) * totalMinutes);
      const newTimes = [...startTimes];
      const combined = startTimes[di] + startTimes[di + 1];
      let newLeft = snap(startTimes[di] + deltaMins, combined);
      newLeft = Math.max(SNAP, Math.min(combined - SNAP, newLeft));
      newTimes[di] = newLeft;
      newTimes[di + 1] = combined - newLeft;
      onChange(items.map((item, i) => ({ ...item, timeMinutes: newTimes[i], isLocked: true })));
    };

    const onEnd = () => {
      dragging.current = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [items, totalMinutes, onChange, readOnly]);

  if (!items || items.length === 0) {
    return (
      <div className="h-10 rounded-xl bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] flex items-center justify-center">
        <span className="text-xs text-[var(--pulse-muted)]">Add work items to allocate time</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Bar */}
      <div
        ref={barRef}
        className="relative h-11 rounded-xl overflow-hidden flex select-none"
        style={{ cursor: readOnly ? 'default' : 'col-resize' }}
      >
        {items.map((item, idx) => {
          const pct = (item.timeMinutes / totalMinutes) * 100;
          return (
            <div
              key={item.id || idx}
              className="relative h-full flex items-center justify-center transition-none"
              style={{ width: `${pct}%`, background: item.colour, minWidth: 0 }}
              onMouseEnter={() => setTooltip({ index: idx })}
              onMouseLeave={() => setTooltip(null)}
            >
              {pct > 8 && (
                <span className="text-white text-xs font-medium pointer-events-none truncate px-2 drop-shadow">
                  {formatPct(item.timeMinutes, totalMinutes)}
                </span>
              )}

              {/* Tooltip */}
              {tooltip?.index === idx && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-[var(--pulse-bg)] border border-[var(--pulse-border)] rounded-lg text-xs whitespace-nowrap z-10 shadow-lg pointer-events-none">
                  <p className="font-medium text-[var(--pulse-text)]">{item.workType?.replace('_', ' ') || 'Work'}</p>
                  <p className="text-[var(--pulse-muted)]">{formatTime(item.timeMinutes)} · {formatPct(item.timeMinutes, totalMinutes)}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Drag handles */}
        {!readOnly && dividers.map((pos, idx) => {
          const pct = (pos / totalMinutes) * 100;
          return (
            <div
              key={idx}
              className="absolute top-0 h-full w-3 -translate-x-1/2 z-10 cursor-col-resize flex items-center justify-center group"
              style={{ left: `${pct}%` }}
              onMouseDown={(e) => handleMouseDown(e, idx)}
              onTouchStart={(e) => handleTouchStart(e, idx)}
            >
              <div className="w-0.5 h-6 bg-white/40 rounded group-hover:bg-white/80 group-active:bg-white transition-colors" />
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item, idx) => (
          <div key={item.id || idx} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.colour }} />
            <span className="text-xs text-[var(--pulse-muted)]">{formatTime(item.timeMinutes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { formatTime, formatPct };
