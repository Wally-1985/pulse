import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { entriesApi, projectsApi, tasksApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import TimeBar, { formatTime, formatPct } from '../../components/TimeBar';
import ZendeskActivity from '../../components/ZendeskActivity';
import OngoingTasks from '../../components/OngoingTasks';
import ActiveProjectsPanel from '../../components/ActiveProjectsPanel';
import YeastarActivity from '../../components/YeastarActivity';
import { Button, Select, Badge, Spinner } from '../../components/ui';
import { usePageTitle } from '../../hooks/usePageTitle';
import toast from 'react-hot-toast';

const WORK_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'bau_support', label: 'BAU / Support Call' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'meeting', label: 'Meeting' },
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
  usePageTitle('Daily Entry');
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
  const [isEditing, setIsEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(null); // { draft: { workItems }, updatedAt }
  const [projects, setProjects] = useState([]);
  const saveTimer = useRef(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const isFuture = date > today();
  const isPast = date < today();
  const isSubmitted = entry?.status === 'submitted';
  const canEdit = !entry || entry.status === 'draft' || (isSubmitted && isEditing);
  const canSubmit = !isFuture && canEdit;

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

  // Load active projects for work item linking
  useEffect(() => {
    if (!viewUserId) {
      projectsApi.getProjects().then(r => setProjects((r.data || []).filter(p => p.status !== 'completed'))).catch(() => {});
    }
  }, []);

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

  const handleDragSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    const newItems = [...workItems];
    const dragged = newItems.splice(dragItem.current, 1)[0];
    newItems.splice(dragOverItem.current, 0, dragged);
    dragItem.current = null;
    dragOverItem.current = null;
    const rebalanced = rebalance(assignColours(newItems), totalMinutes);
    updateItems(rebalanced);
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
      timeMinutes: 60, isLocked: true, colour: '', completed: true,
    };
    const existing = workItems.filter(i => i.workType !== 'lunch');
    const updated = rebalance(assignColours([...existing, lunchItem]), totalMinutes);
    updateItems(updated);
  };

  const updateItem = (id, field, value) => {
    const updated = workItems.map(i => {
      if (i.id !== id) return i;
      const newItem = { ...i, [field]: value };
      // Auto-complete lunch and meeting items
      if (field === 'workType' && (value === 'lunch' || value === 'meeting')) {
        newItem.completed = true;
      }
      return newItem;
    });
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
      // Sync completed state to ongoing tasks
      try {
        await tasksApi.sync({ entryId: entry.id, workItems, entryDate: date });
      } catch (e) { console.error('Task sync failed:', e); }
      // Clear draft
      try { await entriesApi.deleteDraft(date); } catch {}
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
    <div className="max-w-6xl mx-auto flex gap-5 items-start">

      {/* Left column — Ongoing Tasks */}
      <div className="w-60 shrink-0 sticky top-20">
        <OngoingTasks
          readOnly={!canEdit}
          entryDate={date}
          onAddWorkItem={canEdit ? (item) => {
            const newItem = { id: ('temp_' + Date.now()), detail: item.detail, workType: item.workType, timeMinutes: 0, isLocked: false, colour: '', completed: false };
            updateItems(rebalance(assignColours([...workItems, newItem]), totalMinutes));
          } : null}
        />
      </div>
      {/* Left column - entry form */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Daily Entry</h1>
            <p className="text-sm text-[var(--pulse-muted)] mt-0.5">{user?.firstName} {user?.lastName}</p>
          </div>
          <div className="h-5 flex items-center">
            {saveStatus === 'saving' && (<span className="text-xs text-[var(--pulse-muted)] flex items-center gap-1.5"><Spinner size="sm" /> Saving&hellip;</span>)}
            {saveStatus === 'saved' && (<span className="text-xs text-[var(--pulse-muted)] opacity-60">Saved</span>)}
          </div>
        </div>

        {/* Date + status */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--pulse-text)] focus:outline-none focus:border-[var(--pulse-accent)]" />
          {isFuture && <Badge variant="info">Forward Planning — cannot submit until {date}</Badge>}
          {isSubmitted && !isEditing && <Badge variant="success">&#x2713; Submitted</Badge>}
          {isSubmitted && isEditing && <Badge variant="warning">Editing</Badge>}
          {entry?.status === 'draft' && <Badge variant="warning">Draft</Badge>}
          {!entry && !loading && <Badge variant="default">New Entry</Badge>}
          {isSubmitted && !isEditing && (<Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>Edit Entry</Button>)}

        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <>

          {/* Draft restore prompt */}
          {draftPrompt && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-400">Unsaved draft found</p>
                <p className="text-xs text-[var(--pulse-muted)]">
                  {draftPrompt.draft.workItems.length} work item{draftPrompt.draft.workItems.length !== 1 ? 's' : ''} saved {new Date(draftPrompt.updatedAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="xs" variant="secondary" onClick={() => setDraftPrompt(null)}>Discard</Button>
                <Button size="xs" onClick={() => {
                  const restored = assignColours(draftPrompt.draft.workItems);
                  setWorkItems(restored);
                  setDraftPrompt(null);
                  toast.success('Draft restored');
                }}>Restore Draft</Button>
              </div>
            </div>
          )}
            {/* Toolbar: add buttons left, submit right */}
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex gap-2">
                {canEdit && (
                  <>
                    <Button variant="secondary" size="sm" onClick={addItem}>+ Add Item</Button>
                    <Button variant="secondary" size="sm" onClick={addLunch}>+ Add 1h Lunch</Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isSubmitted && isEditing && (
                  <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                )}
                {canSubmit && !isSubmitted && (
                  <Button onClick={handleSubmit} loading={submitting}>Submit Entry</Button>
                )}
                {isSubmitted && isEditing && (
                  <Button onClick={handleSubmit} loading={submitting}>Resubmit Entry</Button>
                )}
                {isSubmitted && !isEditing && (
                  <p className="text-xs text-[var(--pulse-muted)]">Click Edit Entry to make changes</p>
                )}
              </div>
            </div>

            {/* Work items */}
            <div className="flex flex-col gap-3 mb-6">
              {workItems.map((item, idx) => (
                <WorkItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  totalMinutes={totalMinutes}
                  readOnly={!canEdit}
                  projects={projects}
                  onUpdate={(field, val) => updateItem(item.id, field, val)}
                  onRemove={() => removeItem(item.id)}
                  onDragStart={() => { dragItem.current = idx; }}
                  onDragEnter={() => { dragOverItem.current = idx; }}
                  onDragEnd={handleDragSort}
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
                  <span className="text-sm font-medium">Time Allocation &mdash; {totalMinutes / 60}h work day</span>
                  <span className={`text-xs font-mono ${totalAllocated !== totalMinutes ? 'text-amber-400' : 'text-[var(--pulse-muted)]'}`}>
                    {formatTime(totalAllocated)} / {formatTime(totalMinutes)}
                  </span>
                </div>
                <TimeBar items={workItems} totalMinutes={totalMinutes} onChange={handleTimeChange} readOnly={!canEdit} />
                <p className="text-xs text-[var(--pulse-muted)] mt-2">Drag the handles to adjust time allocation</p>
              </div>
            )}


          </>
        )}
      </div>

      {/* Right column - activity panels */}
      <div className="w-64 shrink-0 sticky top-20 flex flex-col gap-3">
        <ZendeskActivity
          readOnly={!canEdit}
          entryDate={date}
          onAddTicket={canEdit ? (ticket) => {
            const detail = 'Zendesk #' + ticket.id + ': ' + ticket.subject;
            const newItem = { id: 'temp_zd_' + ticket.id, detail, workType: 'bau_support', timeMinutes: 0, isLocked: false, colour: '' };
            updateItems(rebalance(assignColours([...workItems, newItem]), totalMinutes));
          } : null}
        />
        <YeastarActivity
          entryDate={date}
          onAddCall={canEdit ? (call) => {
            const other = call.isCaller ? (call.call_to_name || call.call_to_number) : (call.call_from_name || call.call_from_number);
            const detail = 'Phone Call: ' + other + ' (' + (call.isCaller ? 'Outgoing' : 'Incoming') + ')';
            const newItem = { id: 'temp_ys_' + call.uid, detail, workType: 'bau_support', timeMinutes: 0, isLocked: false, colour: '' };
            updateItems(rebalance(assignColours([...workItems, newItem]), totalMinutes));
          } : null}
        />
        <ActiveProjectsPanel
          entryDate={date}
          readOnly={!canEdit}
        />
      </div>
    </div>
  );
}


function WorkItemRow({ item, index, totalMinutes, readOnly, projects = [], onUpdate, onRemove, onDragStart, onDragEnter, onDragEnd }) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={
'bg-[var(--pulse-surface)] border rounded-xl overflow-hidden transition-all ' + (isDragOver ? 'border-[var(--pulse-accent)] scale-[1.01]' : 'border-[var(--pulse-border)]')
}

      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnter={() => { onDragEnter(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => setIsDragOver(false)}
      onDragEnd={onDragEnd}
    >
      <div className="px-3 py-2.5 flex gap-2.5 items-center">
        {/* Drag handle */}
        <div className="flex flex-row items-center gap-1.5 shrink-0">
          {!readOnly && (
            <svg className="w-3.5 h-3.5 text-[var(--pulse-border)] cursor-grab active:cursor-grabbing" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
            </svg>
          )}

        </div>

        {/* Colour bar */}
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: item.colour }} />
        {/* Text box */}
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <p className="text-sm text-[var(--pulse-text)] whitespace-pre-wrap break-words">{linkify(item.detail || "")}</p>
          ) : (
            <textarea
              className="w-full bg-transparent text-sm text-[var(--pulse-text)] placeholder:text-[var(--pulse-muted)] resize-none focus:outline-none leading-snug"
              placeholder="What did you work on?"
              value={item.detail}
              onChange={(e) => onUpdate("detail", e.target.value)}
              rows={2}
            />
          )}
        </div>

        {/* Right column: category, project (if project type), time */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {readOnly ? (
            <>
              <Badge variant="default">{WORK_TYPES.find(t => t.value === item.workType)?.label || item.workType}</Badge>
              {item.projectId && projects.length > 0 && (
                <span className="text-[10px] text-[var(--pulse-accent)] truncate max-w-32">
                  {projects.find(p => p.id === item.projectId)?.name || ''}
                </span>
              )}
            </>
          ) : (
            <>
              <select
                value={item.workType}
                onChange={(e) => onUpdate("workType", e.target.value)}
                className="text-xs bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-md px-2 py-1 text-[var(--pulse-muted)] focus:outline-none focus:border-[var(--pulse-accent)] cursor-pointer"
              >
                {WORK_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {item.workType === 'project' && projects.length > 0 && (
                <select
                  value={item.projectId || ''}
                  onChange={(e) => onUpdate('projectId', e.target.value || null)}
                  className="text-xs bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-md px-2 py-1 text-[var(--pulse-muted)] focus:outline-none focus:border-[var(--pulse-accent)] cursor-pointer max-w-36"
                >
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </>
          )}
        </div>

        {/* Completed checkbox + time — hidden for lunch and meeting */}
        {!readOnly && (
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            {item.workType !== 'lunch' && item.workType !== 'meeting' && !item.detail?.startsWith('Zendesk #') && !item.detail?.startsWith('Phone Call:') && (
              <label className="flex items-center gap-1.5 cursor-pointer" title="Mark as completed">
                <input
                  type="checkbox"
                  checked={!!item.completed}
                  onChange={(e) => onUpdate('completed', e.target.checked)}
                  className="accent-[var(--pulse-accent)]"
                />
                <span className="text-[10px] text-[var(--pulse-muted)]">Completed</span>
              </label>
            )}
            <span className="text-xs text-[var(--pulse-muted)] font-mono opacity-70">
              {formatPct(item.timeMinutes, totalMinutes)} · {formatTime(item.timeMinutes)}
            </span>
          </div>
        )}
        {readOnly && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            {item.completed && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Completed</span>
            )}
            <span className="text-xs text-[var(--pulse-muted)] font-mono opacity-70">
              {formatPct(item.timeMinutes, totalMinutes)} · {formatTime(item.timeMinutes)}
            </span>
          </div>
        )}

        {/* Remove button */}
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
