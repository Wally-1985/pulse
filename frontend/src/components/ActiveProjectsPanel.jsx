import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../api';
import { Card, Badge, Spinner } from './ui';
import toast from 'react-hot-toast';

const PRIORITY_COLOURS = { 1: 'text-red-400', 2: 'text-orange-400', 3: 'text-blue-400', 4: 'text-gray-400' };

export default function ActiveProjectsPanel({ entryDate, readOnly, onWorkItemAdded }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    projectsApi.getActiveProjects(entryDate)
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entryDate]);

  const handleCompleteTask = async (project, task) => {
    if (readOnly) return;
    const key = project.id + ':' + task.id;
    setCompleting(prev => new Set([...prev, key]));
    try {
      await projectsApi.completeTaskFromEntry(project.id, task.id, { entryDate });
      // Also set project start_date if not set
      if (!project.start_date) {
        await projectsApi.startProjectFromEntry(project.id, { entryDate });
      }
      setProjects(prev => prev.map(p => {
        if (p.id !== project.id) return p;
        return { ...p, open_tasks: p.open_tasks.filter(t => t.id !== task.id) };
      }));
      toast.success('Task completed');
      if (onWorkItemAdded) onWorkItemAdded(project, task);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to complete task');
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  if (loading) return (
    <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] p-3">
      <div className="flex justify-center py-2"><Spinner size="sm" /></div>
    </div>
  );

  // Filter to projects that have open tasks or no tasks at all
  const visible = projects.filter(p => p.open_tasks?.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--pulse-border)] bg-[var(--pulse-surface)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--pulse-border)]">
        <p className="text-xs font-semibold">📋 Active Project Tasks</p>
      </div>
      <div className="flex flex-col divide-y divide-[var(--pulse-border)]">
        {visible.map(project => (
          <div key={project.id} className="px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <button onClick={() => navigate('/projects/' + project.id)}
                className="text-xs font-semibold text-[var(--pulse-accent)] hover:underline truncate">
                {project.name}
              </button>
              {project.priority && (
                <span className={'text-[10px] font-bold ' + (PRIORITY_COLOURS[project.priority] || '')} title={'Priority ' + project.priority}>P{project.priority}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {project.open_tasks.map(task => {
                const key = project.id + ':' + task.id;
                const isCompleting = completing.has(key);
                const isOverdue = task.due_date && new Date(task.due_date + 'T23:59:59') < new Date();
                return (
                  <div key={task.id} className="flex items-center gap-2">
                    {!readOnly && (
                      <input type="checkbox" checked={false} disabled={isCompleting}
                        onChange={() => handleCompleteTask(project, task)}
                        className="accent-[var(--pulse-accent)] shrink-0 cursor-pointer"
                        title="Mark as completed" />
                    )}
                    <p className="text-xs text-[var(--pulse-text)] flex-1 truncate">{task.title}</p>
                    {task.due_date && (
                      <span className={'text-[10px] shrink-0 ' + (isOverdue ? 'text-red-400 font-medium' : 'text-[var(--pulse-muted)]')}>
                        {isOverdue ? 'Overdue ' : ''}{new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
