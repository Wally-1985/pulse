import { useState, useRef, useCallback } from 'react';

const SNAP = 15;

export const formatTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return m + 'm';
  if (m === 0) return h + 'h';
  return h + 'h ' + m + 'm';
};

export const formatPct = (mins, total) => Math.round((mins / total) * 100) + '%';

const snapTo = (v) => Math.round(v / SNAP) * SNAP;

export default function TimeAllocationBar({ items, totalMinutes, onChange, readOnly = false }) {
  const barRef = useRef(null);
  const dragging = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const allocated = items.reduce((s, i) => s + i.timeMinutes, 0);
  const unallocated = Math.max(0, totalMinutes - allocated);

  // Build cumulative positions for handle placement
  // Handle i sits between item[i] and item[i+1]
  // There is also a trailing handle after the last item to resize unallocated
  const getCumulativeMins = () => {
    const cum = [];
    let total = 0;
    for (const item of items) {
      total += item.timeMinutes;
      cum.push(total);
    }
    return cum; // cum[i] = left edge of divider after item[i]
  };

  const startDrag = useCallback((e, handleIndex, isTouch) => {
    if (readOnly) return;
    if (!isTouch) e.preventDefault();
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const rect = barRef.current.getBoundingClientRect();
    const startTimes = items.map(i => i.timeMinutes);
    const startUnalloc = unallocated;

    dragging.current = { handleIndex, startX: clientX, barWidth: rect.width, startTimes, startUnalloc };

    const onMove = (ev) => {
      if (!dragging.current) return;
      const cx = isTouch ? ev.touches[0].clientX : ev.clientX;
      const { handleIndex: hi, startX, barWidth, startTimes, startUnalloc } = dragging.current;
      const deltaMins = snapTo((cx - startX) / barWidth * totalMinutes);
      const newTimes = [...startTimes];

      if (hi === items.length - 1) {
        // Trailing handle: resize last item vs unallocated
        const maxGrow = startUnalloc; // can only grow up to unallocated
        const delta = Math.max(-startTimes[hi] + SNAP, Math.min(maxGrow, deltaMins));
        newTimes[hi] = Math.max(SNAP, startTimes[hi] + delta);
      } else {
        // Internal handle: resize item[hi] and item[hi+1]
        const combined = startTimes[hi] + startTimes[hi + 1];
        let newLeft = Math.max(SNAP, Math.min(combined - SNAP, startTimes[hi] + deltaMins));
        newTimes[hi] = newLeft;
        newTimes[hi + 1] = combined - newLeft;
      }

      onChange(items.map((item, i) => ({ ...item, timeMinutes: newTimes[i], isLocked: true })));
    };

    const onUp = () => {
      dragging.current = null;
      if (isTouch) {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
      } else {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
    };

    if (isTouch) {
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    } else {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }, [items, totalMinutes, unallocated, onChange, readOnly]);

  if (!items || items.length === 0) {
    return (
      <div className="h-11 rounded-xl bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] flex items-center justify-center">
        <span className="text-xs text-[var(--pulse-muted)]">Add work items to allocate time</span>
      </div>
    );
  }

  const cumulativeMins = getCumulativeMins();

  return (
    <div className="flex flex-col gap-2">
      {/* SVG hatching pattern + bar */}
      <div ref={barRef} className="relative h-11 rounded-xl overflow-hidden select-none" style={{ cursor: readOnly ? 'default' : 'col-resize' }}>

        {/* Coloured segments */}
        <div className="absolute inset-0 flex">
          {items.map((item, idx) => {
            const pct = (item.timeMinutes / totalMinutes) * 100;
            return (
              <div
                key={item.id || idx}
                className="relative h-full flex items-center justify-center flex-shrink-0"
                style={{ width: pct + '%', background: item.colour }}
                onMouseEnter={() => setTooltip(idx)}
                onMouseLeave={() => setTooltip(null)}
              >
                {pct > 7 && (
                  <span className="text-white text-xs font-medium pointer-events-none truncate px-1.5 drop-shadow">
                    {formatPct(item.timeMinutes, totalMinutes)}
                  </span>
                )}
                {tooltip === idx && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-[var(--pulse-bg)] border border-[var(--pulse-border)] rounded-lg text-xs whitespace-nowrap z-20 shadow-lg pointer-events-none">
                    <p className="font-medium text-[var(--pulse-text)]">{(item.workType || 'work').replace('_', ' ')}</p>
                    <p className="text-[var(--pulse-muted)]">{formatTime(item.timeMinutes)} · {formatPct(item.timeMinutes, totalMinutes)}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unallocated segment with diagonal hatching */}
          {unallocated > 0 && (
            <div
              className="relative h-full flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ width: (unallocated / totalMinutes * 100) + '%' }}
              onMouseEnter={() => setTooltip('unalloc')}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Hatching via SVG */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <defs>
                  <pattern id="hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="rgba(80,80,90,0.25)" />
                <rect width="100%" height="100%" fill="url(#hatch)" />
              </svg>
              {(unallocated / totalMinutes) > 0.07 && (
                <span className="relative text-xs text-white/40 font-medium pointer-events-none z-10">
                  {formatTime(unallocated)}
                </span>
              )}
              {tooltip === 'unalloc' && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-[var(--pulse-bg)] border border-[var(--pulse-border)] rounded-lg text-xs whitespace-nowrap z-20 shadow-lg pointer-events-none">
                  <p className="font-medium text-[var(--pulse-text)]">Unallocated</p>
                  <p className="text-[var(--pulse-muted)]">{formatTime(unallocated)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drag handles — positioned at exact cumulative pixel boundaries */}
        {!readOnly && cumulativeMins.map((cumMins, idx) => {
          // Only show trailing handle (after last item) if there's room or unallocated > 0
          if (idx === items.length - 1 && unallocated === 0 && items.length === 1) return null;
          const pct = (cumMins / totalMinutes) * 100;
          return (
            <div
              key={idx}
              className="absolute top-0 h-full z-10 flex items-center justify-center cursor-col-resize group"
              style={{ left: 'calc(' + pct + '% - 6px)', width: '12px' }}
              onMouseDown={(e) => startDrag(e, idx, false)}
              onTouchStart={(e) => startDrag(e, idx, true)}
            >
              <div className="w-0.5 h-6 bg-white/50 rounded-full group-hover:bg-white group-active:bg-white transition-all group-hover:h-8 group-hover:w-[3px]" />
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
        {unallocated > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0 bg-white/20" />
            <span className="text-xs text-[var(--pulse-muted)]">{formatTime(unallocated)} unallocated</span>
          </div>
        )}
      </div>
    </div>
  );
}