import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { entriesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import TimeBar, { formatTime, formatPct } from '../../components/TimeBar';
import { Button, Select, Badge, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';

const WORK_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'bau_support', label: 'BAU / Support Call' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'other', label: 'Other' },
];

const COLOURS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'];
let idCounter = 0;
const tempId = () => `temp_${++idCounter}`;

const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };

const rebalance = (items, totalMinutes) => {
  const locked = items.filter(i => i.isLocked);
  const unlocked = items.filter(i => !i.isLocked);
  const lockedTotal = locked.reduce((s, i) => s + i.timeMinutes, 0);
  const remaining = Math.max(0, totalMinutes - lockedTotal);
  const perUnlocked = unlocked.length > 0
    ? Math.floor(remaining / unlocked.length / 15) * 15 || 15
    : 0;
  return items.map(item => item.isLocked ? item : { ...item, timeMinutes: perUnlocked });
};

const assignColours = (items) => items.map((item, i) => ({ ...item, colour: COLOURS[i % COLOURS.length] }));

const linkify = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--pulse-accent)] underline break-all">{part}</a>
      : part
  );
};

export default function EntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get('date') || today());
  const viewUserId = searchParams.get('userId') || null;
  const [entry, setEntry] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [totalMinutes, setTotalMinutes] = useState(9 * 60);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving' | 'saved' | ''
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef(null);

  const isFuture = date > today();
  const isPast = date < today();
  const canSubmit = entry?.status !== 'submitted' && !isFuture;
  const canEdit = !entry || entry.status === 'draft' ||
    (entry.status === 'submitted' && entry.canEdit);

  // Load entry for date
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await entriesApi.getEntry(date, viewUserId);
        setEntry(data);
        if (data) {
          setWorkItems(assignColours(data.workItems || []));
          setTotalMinutes(data.workingDayMinutes || 9 * 60);
        } else {
          setWorkItems([]);
          setTotalMinutes(9 * 60);
        }
      } catch (err) {
        toast.error('Failed to load entry');
      } finally {
        setLoading(false);
      }
    };
    load();
    setSearchParams({ date }, { replace: true });
  }, [date]);

  // Auto-save on change
  const autoSave = useCallback((items) => {
    if (!canEdit) return;
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { data } = await entriesApi.upsertEntry({ date, workItems: items });
        setEntry(prev => ({ ...(prev || {}), ...data, canEdit: true }));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch {
        setSaveStatus('');
      }
    }, 1000);
  }, [date, canEdit]);

  const updateItems = (newItems) => {
    const coloured = assignColours(newItems);
    setWorkItems(coloured);
    autoSave(coloured);
  };

  const addItem = () => {
    const newItem = {
      id: tempId(), detail: '', workType: 'project',
      timeMinutes: 0, isLocked: false, colour: '',
    };
    const updated = rebalance(assignColours([...workItems, newItem]), totalMinutes);
    updateItems(updated);
  };

  const addLunch = () => {
    const lunchItem = {
      id: tempId(), detail: 'Lunch', workType: 'lunch',
      timeMinutes: 60, isLocked: true, colour: '',
    };
    const existing = workItems.filter(i => i.workType !== 'lunch');
    const updated = rebalance(assignColours([...existing, lunchItem]), totalMinutes);
    updateItems(updated);
  };

  const updateItem = (id, field, value) => {
    const updated = workItems.map(i => i.id === id ? { ...i, [field]: value } : i);
    updateItems(updated);
  };

  const removeItem = (id) => {
    const filtered = workItems.filter(i => i.id !== id);
    const rebalanced = rebalance(assignColours(filtered), totalMinutes);
    updateItems(rebalanced);
  };

  const handleTimeChange = (newItems) => {
    const coloured = assignColours(newItems);
    setWorkItems(coloured);
    autoSave(coloured);
  };

  const handleSubmit = async () => {
    if (!entry?.id) {
      toast.error('Please save your entry first');
      return;
    }
    if (workItems.length === 0) {
      toast.error('Add at least one work item');
      return;
    }
    if (workItems.some(i => !i.detail?.trim())) {
      toast.error('All work items need a description');
      return;
    }
    setSubmitting(true);
    try {
      await entriesApi.submitEntry(entry.id);
      setEntry(prev => ({ ...prev, status: 'submitted', submittedAt: new Date().toISOString() }));
      toast.success('Entry submitted!');
      setTimeout(() => navigate(-1), 800);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const totalAllocated = workItems.reduce((s, i) => s + i.timeMinutes, 0);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Daily Entry</h1>
          <p className="text-sm text-[var(--pulse-muted)] mt-0.5">
            {user?.firstName} {user?.lastName}
          </p>
        </div>

        {/* Save status */}
        <div className="h-5 flex items-center">
          {saveStatus === 'saving' && (
            <span className="text-xs text-[var(--pulse-muted)] flex items-center gap-1.5">
              <Spinner size="sm" /> Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-[var(--pulse-muted)] opacity-60">Saved</span>
          )}
        </div>
      </div>

      {/* Date picker + status */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)] focus:outline-none focus:border-[var(--pulse-accent)]"
        />
        {isFuture && <Badge variant="info">Forward Planning — cannot submit until {date}</Badge>}
        {entry?.status === 'submitted' && <Badge variant="success">✓ Submitted</Badge>}
        {entry?.status === 'draft' && <Badge variant="warning">Draft</Badge>}
        {!entry && !loading && <Badge variant="default">New Entry</Badge>}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* Work items */}
          <div className="flex flex-col gap-3 mb-6">
            {workItems.map((item, idx) => (
              <WorkItemRow
                key={item.id}
                item={item}
                totalMinutes={totalMinutes}
                readOnly={!canEdit}
                onUpdate={(field, val) => updateItem(item.id, field, val)}
                onRemove={() => removeItem(item.id)}
              />
            ))}

            {workItems.length === 0 && (
              <div className="border border-dashed border-[var(--pulse-border)] rounded-xl p-8 text-center">
                <p className="text-sm text-[var(--pulse-muted)]">No work items yet. Add one below.</p>
              </div>
            )}
          </div>

          {/* Time allocation bar */}
          {workItems.length > 0 && (
            <div className="mb-6 p-4 bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Time Allocation</span>
                <span className={`text-xs font-mono ${totalAllocated !== totalMinutes ? 'text-amber-400' : 'text-[var(--pulse-muted)]'}`}>
                  {formatTime(totalAllocated)} / {formatTime(totalMinutes)}
                </span>
              </div>
              <TimeBar
                items={workItems}
                totalMinutes={totalMinutes}
                onChange={handleTimeChange}
                readOnly={!canEdit}
              />
              <p className="text-xs text-[var(--pulse-muted)] mt-2">Drag the handles to adjust time allocation</p>
            </div>
          )}

          {/* Actions */}
          {canEdit && (
            <div className="flex flex-wrap gap-2 mb-6">
              <Button variant="secondary" size="sm" onClick={addItem}>
                + Add Work Item
              </Button>
              <Button variant="secondary" size="sm" onClick={addLunch}>
                + Add 1h Lunch
              </Button>
            </div>
          )}

          {/* Submit */}
          {canSubmit && canEdit && (
            <div className="flex justify-end">
              <Button onClick={handleSubmit} loading={submitting} size="lg">
                Submit Entry
              </Button>
            </div>
          )}

          {entry?.status === 'submitted' && !canEdit && (
            <div className="text-center py-4">
              <p className="text-sm text-[var(--pulse-muted)]">Entry is locked — edit window has passed.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WorkItemRow({ item, totalMinutes, readOnly, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(!item.detail);

  return (
    <div
      className="bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl overflow-hidden transition-all"
      style={{ borderLeftColor: item.colour, borderLeftWidth: 3 }}
    >
      <div className="p-3 flex gap-3 items-start">
        {/* Colour dot + work type */}
        <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
          <div className="w-2.5 h-2.5 rounded-full mt-1" style={{ background: item.colour }} />
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <p className="text-sm text-[var(--pulse-text)] whitespace-pre-wrap break-words">
              {linkify(item.detail || '')}
            </p>
          ) : (
            <textarea
              className="w-full bg-transparent text-sm text-[var(--pulse-text)] placeholder:text-[var(--pulse-muted)] resize-none focus:outline-none min-h-[2.5rem]"
              placeholder="What did you work on?"
              value={item.detail}
              onChange={(e) => onUpdate('detail', e.target.value)}
              rows={2}
            />
          )}

          {/* Work type + time (below detail) */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {readOnly ? (
              <Badge variant="default">{WORK_TYPES.find(t => t.value === item.workType)?.label || item.workType}</Badge>
            ) : (
              <select
                value={item.workType}
                onChange={(e) => onUpdate('workType', e.target.value)}
                className="text-xs bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-md px-2 py-1 text-[var(--pulse-muted)] focus:outline-none focus:border-[var(--pulse-accent)] cursor-pointer"
              >
                {WORK_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            )}
            <span className="text-xs text-[var(--pulse-muted)] font-mono opacity-70">
              {formatPct(item.timeMinutes, totalMinutes)} · {formatTime(item.timeMinutes)}
            </span>
          </div>
        </div>

        {/* Remove */}
        {!readOnly && (
          <button
            onClick={onRemove}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[var(--pulse-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
