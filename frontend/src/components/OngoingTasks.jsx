import { useState, useEffect } from 'react';
import { tasksApi } from '../api';
import { Card, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';

const WORK_TYPE_COLOURS = {
  project: '#6366f1',
  bau_support: '#f59e0b',
  maintenance: '#10b981',
  lunch: '#6b7280',
  other: '#8b5cf6',
};

export default function OngoingTasks({ onAddWorkItem, readOnly }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    tasksApi.getOngoing()
      .then(r => setTasks(r.data))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDismiss = async (id) => {
    try {
      await tasksApi.dismiss(id);
      setTasks(t => t.filter(x => x.id !== id));
    } catch { toast.error('Failed to remove task'); }
  };

  const handleAddToEntry = (task) => {
    if (!onAddWorkItem) return;
    onAddWorkItem({ detail: task.detail, workType: task.work_type });
  };

  if (loading) return (
    <Card className="p-4">
      <p className="text-sm font-semibold mb-3">Ongoing Tasks</p>
      <div className="flex justify-center py-4"><Spinner /></div>
    </Card>
  );

  if (tasks.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">Ongoing Tasks</span>
        <Badge variant="warning">{tasks.length}</Badge>
      </div>
      <p className="text-xs text-[var(--pulse-muted)] mb-2">Tasks from previous days that were not completed.</p>
      <div className="flex flex-col gap-2">
        {tasks.map(task => (
          <div key={task.id} className="flex items-start gap-2 p-2.5 bg-[var(--pulse-surface-2)] rounded-lg group">
            <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: WORK_TYPE_COLOURS[task.work_type] || '#8b5cf6' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--pulse-text)] leading-snug break-words">{task.detail}</p>
              <p className="text-[10px] text-[var(--pulse-muted)] mt-0.5">from {task.created_date}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!readOnly && onAddWorkItem && (
                <button
                  onClick={() => handleAddToEntry(task)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] hover:bg-[var(--pulse-accent)] hover:text-white transition-colors"
                  title="Add to today's entry"
                >
                  + Add
                </button>
              )}
              <button
                onClick={() => handleDismiss(task.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-[var(--pulse-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remove task"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
