import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi, usersApi } from '../../api';
import { Card, Button, Badge, Spinner, Input } from '../../components/ui';
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
const HEALTH_LABELS = { green: '● Active', amber: '● Stalled', red: '● At Risk', completed: '● Completed' };
const TASK_STATUS = ['not_started', 'in_progress', 'completed'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  usePageTitle(project ? project.name : 'Project');

  const load = async () => {
    try {
      const [p, u] = await Promise.all([projectsApi.getProject(id), usersApi.getUsers()]);
      setProject(p.data);
      setUsers(u.data);
    } catch { toast.error('Failed to load project'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    setAddingTask(true);
    try { await projectsApi.createTask(id, { title: newTask }); setNewTask(''); load(); }
    catch { toast.error('Failed to add task'); }
    finally { setAddingTask(false); }
  };

  const handleTaskStatus = async (taskId, status) => {
    try {
      await projectsApi.updateTask(id, taskId, { status });
      setProject(p => ({ ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, status } : t) }));
    } catch { toast.error('Failed to update task'); }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await projectsApi.deleteTask(id, taskId);
      setProject(p => ({ ...p, tasks: p.tasks.filter(t => t.id !== taskId) }));
    } catch { toast.error('Failed to delete task'); }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try { await projectsApi.createNote(id, { noteText: newNote }); setNewNote(''); load(); }
    catch { toast.error('Failed to add note'); }
    finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await projectsApi.deleteNote(id, noteId);
      setProject(p => ({ ...p, notes: p.notes.filter(n => n.id !== noteId) }));
    } catch { toast.error('Failed to delete note'); }
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
            <span className={'text-xs font-medium ' + (HEALTH_COLOURS[project.health] || '')}>{HEALTH_LABELS[project.health]}</span>
            {project.last_activity_at && <span className="text-xs text-[var(--pulse-muted)]">Last activity {new Date(project.last_activity_at).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="secondary" onClick={() => setShowEdit(true)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={handleArchive}>Archive</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 flex flex-col gap-5">
          {project.description && (
            <Card className="p-4"><p className="text-sm text-[var(--pulse-text)]">{project.description}</p></Card>
          )}

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Tasks</h2>
              <span className="text-xs text-[var(--pulse-muted)]">{tasksDone}/{project.tasks.length} complete</span>
            </div>
            <div className="flex flex-col gap-2 mb-3">
              {project.tasks.length === 0 && <p className="text-xs text-[var(--pulse-muted)] text-center py-3">No tasks yet.</p>}
              {project.tasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 p-2.5 bg-[var(--pulse-surface-2)] rounded-lg group">
                  <input type="checkbox" checked={task.status === 'completed'}
                    onChange={() => handleTaskStatus(task.id, task.status === 'completed' ? 'not_started' : 'completed')}
                    className="accent-[var(--pulse-accent)] shrink-0" />
                  <p className={'text-sm flex-1 ' + (task.status === 'completed' ? 'line-through text-[var(--pulse-muted)]' : '')}>{task.title}</p>
                  {task.due_date && <span className="text-xs text-[var(--pulse-muted)] shrink-0">{new Date(task.due_date + 'T12:00:00').toLocaleDateString()}</span>}
                  <select value={task.status} onChange={e => handleTaskStatus(task.id, e.target.value)}
                    className="text-xs bg-transparent border border-[var(--pulse-border)] rounded px-1.5 py-0.5 text-[var(--pulse-text)] shrink-0 opacity-0 group-hover:opacity-100">
                    {TASK_STATUS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button onClick={() => handleDeleteTask(task.id)}
                    className="text-[var(--pulse-muted)] hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
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
                    <p className="text-sm text-[var(--pulse-text)] flex-1 whitespace-pre-wrap">{note.note_text}</p>
                    <button onClick={() => handleDeleteNote(note.id)}
                      className="text-[var(--pulse-muted)] hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100 mt-0.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="text-xs text-[var(--pulse-muted)] mt-1">{note.created_by_name} · {new Date(note.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                rows={2} className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] resize-none w-full" />
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
                  <div className="w-6 h-6 rounded-full bg-[var(--pulse-accent)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {a.first_name[0]}{a.last_name[0]}
                  </div>
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
              {project.last_activity_at && <div><span className="text-[var(--pulse-muted)]">Last activity</span><p className="font-medium mt-0.5">{new Date(project.last_activity_at).toLocaleString()}</p></div>}
            </div>
          </Card>
        </div>
      </div>

      <ProjectModal open={showEdit} project={project} users={users} onClose={() => setShowEdit(false)}
        onSave={async (data) => { await projectsApi.updateProject(id, data); toast.success('Project updated'); setShowEdit(false); load(); }}
      />
    </div>
  );
}
