import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, usersApi } from '../../api';
import { Card, Button, Badge, Modal, Input, Spinner, Empty } from '../../components/ui';
import { usePageTitle } from '../../hooks/usePageTitle';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'high_priority_not_started', label: 'High Priority - Not Started' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold / Waiting' },
  { value: 'completed', label: 'Completed' },
];
const STATUS_COLOURS = { high_priority_not_started: 'danger', not_started: 'default', in_progress: 'accent', on_hold: 'warning', completed: 'success' };
const HEALTH_COLOURS = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', completed: 'bg-gray-500' };
const PRIORITY_COLOURS = { 1: 'danger', 2: 'warning', 3: 'info', 4: 'default' };

export default function ProjectsPage() {
  usePageTitle('Projects');
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const p = await projectsApi.getProjects();
      setProjects(p.data);
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
    // Load users for the assign modal
    try {
      const u = await usersApi.getTeamMembers();
      setUsers(u.data);
    } catch { /* fail silently */ }
  };

  useEffect(() => { load(); }, []);

  const filtered = projects.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    active: projects.filter(p => ['in_progress', 'high_priority_not_started'].includes(p.status)).length,
    notStarted: projects.filter(p => p.status === 'not_started').length,
    onHold: projects.filter(p => p.status === 'on_hold').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-[var(--pulse-muted)] mt-0.5">
            {counts.active} active · {counts.notStarted} not started · {counts.onHold} on hold · {counts.completed} completed
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Project</Button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <Input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <Empty icon="📋" title="No projects found" description="Create your first project to get started." action={<Button onClick={() => setShowCreate(true)}>+ New Project</Button>} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(project => (
            <Card key={project.id} className="p-4 cursor-pointer hover:border-[var(--pulse-accent)]/40 transition-colors"
              onClick={() => navigate('/projects/' + project.id)}>
              <div className="flex items-start gap-3">
                <div className={'w-2 h-2 rounded-full mt-1.5 shrink-0 ' + (HEALTH_COLOURS[project.health] || 'bg-gray-500')} title={'Health: ' + project.health} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold">{project.name}</p>
                    <Badge variant={STATUS_COLOURS[project.status] || 'default'}>
                      {STATUS_OPTIONS.find(s => s.value === project.status)?.label || project.status}
                    </Badge>
                    {project.status === 'in_progress' && project.priority && (
                      <Badge variant={PRIORITY_COLOURS[project.priority]}>P{project.priority}</Badge>
                    )}
                  </div>
                  {project.description && <p className="text-xs text-[var(--pulse-muted)] mb-2 line-clamp-1">{project.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-[var(--pulse-muted)]">
                    {parseInt(project.task_count) > 0 && <span>{project.completed_task_count}/{project.task_count} tasks</span>}
                    {project.last_activity_at && <span>Last activity {new Date(project.last_activity_at).toLocaleDateString()}</span>}
                    {(project.assigned_user_names || []).filter(Boolean).length > 0 && <span>{project.assigned_user_names.filter(Boolean).join(', ')}</span>}
                  </div>
                </div>
                <svg className="w-4 h-4 text-[var(--pulse-muted)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProjectModal open={showCreate} users={users} onClose={() => setShowCreate(false)}
        onSave={async (data) => { await projectsApi.createProject(data); toast.success('Project created'); setShowCreate(false); load(); }}
      />
    </div>
  );
}

export function ProjectModal({ open, onClose, project, users, onSave }) {
  const isEdit = !!project;
  const [form, setForm] = useState({ name: '', description: '', status: 'not_started', priority: '', assignedUserIds: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setForm({ name: project.name || '', description: project.description || '', status: project.status || 'not_started', priority: project.priority || '', assignedUserIds: (project.assignments || []).map(a => a.user_id) });
    } else {
      setForm({ name: '', description: '', status: 'not_started', priority: '', assignedUserIds: [] });
    }
  }, [project, open]);

  const toggleUser = (id) => setForm(f => ({ ...f, assignedUserIds: f.assignedUserIds.includes(id) ? f.assignedUserIds.filter(x => x !== id) : [...f.assignedUserIds, id] }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Project name required'); return; }
    setSaving(true);
    try { await onSave({ ...form, priority: form.priority ? parseInt(form.priority) : null }); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Project' : 'New Project'} size="md">
      <div className="flex flex-col gap-4">
        <Input label="Project Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3} className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] resize-y" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {form.status === 'in_progress' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
                <option value="">No priority</option>
                <option value="1">Priority 1 (Highest)</option>
                <option value="2">Priority 2</option>
                <option value="3">Priority 3</option>
                <option value="4">Priority 4 (Lowest)</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Assigned To</label>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto p-2 bg-[var(--pulse-surface-2)] rounded-lg border border-[var(--pulse-border)]">
            {users.map(u => (
              <label key={u.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                <input type="checkbox" checked={form.assignedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} className="accent-[var(--pulse-accent)]" />
                <span className="text-sm">{u.first_name} {u.last_name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'Save Changes' : 'Create Project'}</Button>
        </div>
      </div>
    </Modal>
  );
}
