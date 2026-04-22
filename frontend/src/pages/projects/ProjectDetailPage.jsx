import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi, usersApi } from '../../api';
import { Card, Button, Badge, Spinner, Input, Modal } from '../../components/ui';
import { usePageTitle } from '../../hooks/usePageTitle';
import toast from 'react-hot-toast';
import { ProjectModal } from './ProjectsPage';

const STATUS_OPTIONS = [
  { value: 'high_priority_not_started', label: 'High Priority - Not Started' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold / Waiting' },
  { value: 'completed', label: 'Completed' },
];
const STATUS_COLOURS = { high_priority_not_started: 'danger', not_started: 'default', in_progress: 'accent', on_hold: 'warning', completed: 'success' };
const HEALTH_COLOURS = { green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400', completed: 'text-gray-400' };
const HEALTH_LABELS = { green: 'Active', amber: 'Stalled', red: 'At Risk', completed: 'Completed' };
const TASK_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const isOverdue = (d, status) => d && status !== 'completed' && new Date(d + 'T23:59:59') < new Date();

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newTask, setNewTask] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  usePageTitle(project ? project.name : 'Project');

  const load = async () => {
    try { const p = await projectsApi.getProject(id); setProject(p.data); }
    catch { toast.error('Failed to load project'); }
    finally { setLoading(false); }
    try { const u = await usersApi.getTeamMembers(); setUsers(u.data); } catch {}
  };

  useEffect(() => { load(); }, [id]);

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    setAddingTask(true);
    try { await projectsApi.createTask(id, { title: newTask }); setNewTask(''); load(); }
    catch { toast.error('Failed to add task'); }
    finally { setAddingTask(false); }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try { await projectsApi.createNote(id, { noteText: newNote }); setNewNote(''); load(); }
    catch { toast.error('Failed to add note'); }
    finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (noteId) => {
    try { await projectsApi.deleteNote(id, noteId); setProject(p => ({ ...p, notes: p.notes.filter(n => n.id !== noteId) })); }
    catch { toast.error('Failed to delete note'); }
  };

  const handleArchive = async () => {
    if (!confirm('Archive this project?')) return;
    try { await projectsApi.deleteProject(id); toast.success('Project archived'); navigate('/projects'); }
    catch { toast.error('Failed to archive project'); }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!project) return <div className="text-center py-20 text-[var(--pulse-muted)]">Project not found</div>;

  const statusLabel = STATUS_OPTIONS.find(s => s.value === project.status)?.label || project.status;
  const tasksDone = project.tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => navigate('/projects')} className="text-xs text-[var(--pulse-muted)] hover:text-[var(--pulse-accent)] mb-2 block">← All Projects</button>
          <h1 className="text-xl font-semibold">{project.name}</h1>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={STATUS_COLOURS[project.status] || 'default'}>{statusLabel}</Badge>
            {project.status === 'in_progress' && project.priority && <Badge variant="warning">Priority {project.priority}</Badge>}
            {project.health && <span className={'text-xs font-medium ' + (HEALTH_COLOURS[project.health] || '')}>{HEALTH_LABELS[project.health] || ''}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="secondary" onClick={() => setShowEdit(true)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={handleArchive}>Archive</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 flex flex-col gap-5">
          {project.description && <Card className="p-4"><p className="text-sm">{project.description}</p></Card>}

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Tasks</h2>
              <span className="text-xs text-[var(--pulse-muted)]">{tasksDone}/{project.tasks.length} complete</span>
            </div>
            <div className="flex flex-col gap-2 mb-3">
              {project.tasks.length === 0 && <p className="text-xs text-[var(--pulse-muted)] text-center py-3">No tasks yet.</p>}
              {project.tasks.map(task => (
                <div key={task.id} onClick={() => setSelectedTask(task)}
                  className="flex items-start gap-2 p-2.5 bg-[var(--pulse-surface-2)] rounded-lg cursor-pointer hover:border hover:border-[var(--pulse-accent)]/30 group transition-all">
                  <input type="checkbox" checked={task.status === 'completed'}
                    onClick={e => e.stopPropagation()}
                    onChange={async (e) => {
                      e.stopPropagation();
                      try { await projectsApi.updateTask(id, task.id, { status: e.target.checked ? 'completed' : 'not_started' }); load(); }
                      catch { toast.error('Failed to update'); }
                    }}
                    className="accent-[var(--pulse-accent)] shrink-0 mt-0.5" />

                  <div className="flex-1 min-w-0">
                    <p className={'text-sm ' + (task.status === 'completed' ? 'line-through text-[var(--pulse-muted)]' : '')}>{task.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {task.assigned_to_name && <span className="text-[10px] text-[var(--pulse-muted)]">👤 {task.assigned_to_name}</span>}
                      {task.start_date && <span className="text-[10px] text-[var(--pulse-muted)]">Start: {fmtDate(task.start_date)}</span>}
                      {task.due_date && <span className={'text-[10px] ' + (isOverdue(task.due_date, task.status) ? 'text-red-400 font-medium' : 'text-[var(--pulse-muted)]')}>Due: {fmtDate(task.due_date)}</span>}
                      {task.finished_date && <span className="text-[10px] text-green-400">Done: {fmtDate(task.finished_date)}</span>}
                      {task.notes && <span className="text-[10px] text-[var(--pulse-muted)] italic truncate max-w-xs">{task.notes}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--pulse-muted)] opacity-0 group-hover:opacity-100 shrink-0">Edit →</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add a task..." value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTask()} className="flex-1" />
              <Button size="sm" loading={addingTask} onClick={handleAddTask} disabled={!newTask.trim()}>Add</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Notes</h2>
            <div className="flex flex-col gap-3 mb-3">
              {project.notes.length === 0 && <p className="text-xs text-[var(--pulse-muted)] text-center py-3">No notes yet.</p>}
              {project.notes.map(note => (
                <div key={note.id} className="p-3 bg-[var(--pulse-surface-2)] rounded-lg group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm flex-1 whitespace-pre-wrap">{note.note_text}</p>

                    <button onClick={() => handleDeleteNote(note.id)}
                      className="text-[var(--pulse-muted)] hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 mt-0.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="text-xs text-[var(--pulse-muted)] mt-1">{note.created_by_name} · {new Date(note.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                rows={2} className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm resize-none w-full" />
              <Button size="sm" loading={addingNote} onClick={handleAddNote} disabled={!newNote.trim()} className="w-fit">Add Note</Button>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-[var(--pulse-muted)] uppercase tracking-wide mb-3">Assigned To</h3>
            {project.assignments.length === 0 && <p className="text-xs text-[var(--pulse-muted)]">No one assigned</p>}
            <div className="flex flex-col gap-2">
              {project.assignments.map(a => (
                <div key={a.user_id} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--pulse-accent)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{a.first_name[0]}{a.last_name[0]}</div>
                  <p className="text-xs">{a.first_name} {a.last_name}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-[var(--pulse-muted)] uppercase tracking-wide mb-3">Details</h3>
            <div className="flex flex-col gap-2 text-xs">
              <div><span className="text-[var(--pulse-muted)]">Created by</span><p className="font-medium mt-0.5">{project.created_by_name}</p></div>
              <div><span className="text-[var(--pulse-muted)]">Created</span><p className="font-medium mt-0.5">{new Date(project.created_at).toLocaleDateString()}</p></div>

              {project.start_date && <div><span className="text-[var(--pulse-muted)]">Started</span><p className="font-medium mt-0.5">{fmtDate(project.start_date)}</p></div>}
              {project.due_date && <div><span className={isOverdue(project.due_date, project.status) ? 'text-red-400' : 'text-[var(--pulse-muted)]'}>Due</span><p className={'font-medium mt-0.5 ' + (isOverdue(project.due_date, project.status) ? 'text-red-400' : '')}>{fmtDate(project.due_date)}</p></div>}
              {project.finished_date && <div><span className="text-[var(--pulse-muted)]">Finished</span><p className="font-medium mt-0.5">{fmtDate(project.finished_date)}</p></div>}
              {project.last_activity_at && <div><span className="text-[var(--pulse-muted)]">Last activity</span><p className="font-medium mt-0.5">{new Date(project.last_activity_at).toLocaleString()}</p></div>}
            </div>
          </Card>
        </div>
      </div>

      <ProjectModal open={showEdit} project={project} users={users} onClose={() => setShowEdit(false)}
        onSave={async (data) => { await projectsApi.updateProject(id, data); toast.success('Project updated'); setShowEdit(false); load(); }} />

      {selectedTask && (
        <TaskModal task={selectedTask} projectId={id} users={users}
          onClose={() => setSelectedTask(null)}
          onSave={() => { setSelectedTask(null); load(); }}
          onDelete={async (taskId) => { await projectsApi.deleteTask(id, taskId); setSelectedTask(null); load(); }}
        />
      )}
    </div>
  );
}

function TaskModal({ task, projectId, users, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    status: task.status || 'not_started',
    startDate: task.start_date || '',
    dueDate: task.due_date || '',
    finishedDate: task.finished_date || '',
    assignedTo: task.assigned_to || '',
    notes: task.notes || '',
    dueDateChangeReason: '',
    _originalDueDate: task.due_date || '',
  });
  const [saving, setSaving] = useState(false);
  const dueDateChanged = form.dueDate !== form._originalDueDate;

  const handleSave = async () => {
    if (dueDateChanged && !form.dueDateChangeReason.trim()) {
      toast.error('Please enter a reason for the due date change'); return;
    }
    setSaving(true);
    try {
      await projectsApi.updateTask(projectId, task.id, {
        title: form.title, description: form.description || null, status: form.status,
        startDate: form.startDate || null, dueDate: form.dueDate || null,
        finishedDate: form.finishedDate || null, assignedTo: form.assignedTo || null,
        notes: form.notes || null,
        dueDateChangeReason: dueDateChanged ? form.dueDateChangeReason : undefined,
      });
      toast.success('Task saved'); onSave();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save task'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Task" size="md">
      <div className="flex flex-col gap-4">
        <Input label="Task Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
              {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Assigned To</label>
            <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Start Date</label>
            <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Due Date</label>
            <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Finished Date</label>
            <input type="date" value={form.finishedDate} onChange={e => setForm(f => ({ ...f, finishedDate: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]" />
          </div>
        </div>
        {dueDateChanged && (
          <Input label="Reason for due date change" required
            placeholder="Required — why is the due date being changed or removed?"
            value={form.dueDateChangeReason}
            onChange={e => setForm(f => ({ ...f, dueDateChangeReason: e.target.value }))} />
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={4} placeholder="Task notes, context, decisions..."
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] resize-y" />
        </div>
        <div className="flex items-center justify-between pt-2">
          <Button size="sm" variant="danger"
            onClick={async () => { if (!confirm('Delete this task?')) return; try { await onDelete(task.id); } catch { toast.error('Failed'); } }}>
            Delete Task
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Save Task</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
