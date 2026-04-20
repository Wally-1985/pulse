import { useState, useEffect } from 'react';
import { teamsApi, usersApi } from '../../api';
import { Card, Button, Input, Badge, Modal, Spinner, Empty } from '../../components/ui';
import toast from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

export default function TeamsPage() {
  usePageTitle('Teams');
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState(null);
  const [manageTeam, setManageTeam] = useState(null); // for assigning managers

  const load = async () => {
    const [t, u] = await Promise.all([teamsApi.getTeams(), usersApi.getUsers()]);
    setTeams(t.data);
    setUsers(u.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete team "${name}"?`)) return;
    try {
      await teamsApi.deleteTeam(id);
      setTeams(t => t.filter(x => x.id !== id));
      toast.success('Team deleted');
    } catch { toast.error('Failed to delete'); }
  };

  // Build tree structure
  const topLevel = teams.filter(t => !t.parent_id);
  const children = (parentId) => teams.filter(t => t.parent_id === parentId);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Teams</h1>
        <Button onClick={() => setShowCreate(true)}>+ New Team</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : teams.length === 0 ? (
        <Empty icon="👥" title="No teams yet" description="Create your first team to get started." action={<Button onClick={() => setShowCreate(true)}>Create Team</Button>} />
      ) : (
        <div className="flex flex-col gap-3">
          {topLevel.map(team => (
            <TeamRow
              key={team.id}
              team={team}
              children={children(team.id)}
              onEdit={() => setEditTeam(team)}
              onDelete={() => handleDelete(team.id, team.name)}
              onManage={() => setManageTeam(team)}
            />
          ))}
        </div>
      )}

      <TeamModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        teams={teams}
        onSave={async (data) => {
          await teamsApi.createTeam(data);
          toast.success('Team created');
          setShowCreate(false);
          load();
        }}
      />

      <TeamModal
        open={!!editTeam}
        team={editTeam}
        onClose={() => setEditTeam(null)}
        teams={teams.filter(t => t.id !== editTeam?.id)}
        onSave={async (data) => {
          await teamsApi.updateTeam(editTeam.id, data);
          toast.success('Team updated');
          setEditTeam(null);
          load();
        }}
      />

      <AssignManagerModal
        open={!!manageTeam}
        team={manageTeam}
        users={users.filter(u => (u.roles || []).some(r => ['manager', 'admin'].includes(r)))}
        onClose={() => setManageTeam(null)}
        onSave={async (managerId, includeChildren) => {
          await teamsApi.assignManager(manageTeam.id, { managerId, includeChildTeams: includeChildren });
          toast.success('Manager assigned');
          setManageTeam(null);
        }}
      />
    </div>
  );
}

function TeamRow({ team, children, onEdit, onDelete, onManage }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          {children.length > 0 && (
            <button onClick={() => setExpanded(e => !e)} className="text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] transition-colors">
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {children.length === 0 && <div className="w-4" />}

          <div className="flex-1">
            <p className="text-sm font-medium">{team.name}</p>
            <p className="text-xs text-[var(--pulse-muted)]">
              {team.member_count || 0} members
              {team.week_start && ` · Week starts ${team.week_start}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Button size="xs" variant="secondary" onClick={onManage}>Managers</Button>
            <Button size="xs" variant="secondary" onClick={onEdit}>Edit</Button>
            <Button size="xs" variant="danger" onClick={onDelete}>Delete</Button>
          </div>
        </div>
      </Card>

      {expanded && children.length > 0 && (
        <div className="ml-6 mt-2 flex flex-col gap-2 border-l-2 border-[var(--pulse-border)] pl-4">
          {children.map(child => (
            <Card key={child.id} className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-[var(--pulse-border)]" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{child.name}</p>
                  <p className="text-xs text-[var(--pulse-muted)]">{child.member_count || 0} members</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="secondary" onClick={onManage}>Managers</Button>
                  <Button size="xs" variant="secondary" onClick={() => {}}>Edit</Button>
                  <Button size="xs" variant="danger" onClick={() => {}}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamModal({ open, onClose, team, teams, onSave }) {
  const [form, setForm] = useState({ name: '', parentId: '', weekStart: 'monday', missingThreshold: 50 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (team) setForm({ name: team.name, parentId: team.parent_id || '', weekStart: team.week_start || 'monday', missingThreshold: team.missing_threshold || 50 });
    else setForm({ name: '', parentId: '', weekStart: 'monday', missingThreshold: 50 });
  }, [team, open]);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave({ ...form, parentId: form.parentId || null }); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={team ? 'Edit Team' : 'Create Team'}>
      <div className="flex flex-col gap-4">
        <Input label="Team Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Parent Team (optional)</label>
          <select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
            <option value="">— No parent —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Week starts</label>
            <select value={form.weekStart} onChange={e => setForm(f => ({ ...f, weekStart: e.target.value }))}
              className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
          <Input
            label="Missing threshold %"
            type="number"
            min="0"
            max="100"
            value={form.missingThreshold}
            onChange={e => setForm(f => ({ ...f, missingThreshold: parseInt(e.target.value) }))}
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave} disabled={!form.name}>{team ? 'Save Changes' : 'Create Team'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function AssignManagerModal({ open, team, users, onClose, onSave }) {
  const [managerId, setManagerId] = useState('');
  const [includeChildren, setIncludeChildren] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!managerId) return;
    setSaving(true);
    try { await onSave(managerId, includeChildren); }
    catch { toast.error('Failed to assign manager'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Assign Manager — ${team?.name}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Manager</label>
          <select value={managerId} onChange={e => setManagerId(e.target.value)}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
            <option value="">Select a manager...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeChildren} onChange={e => setIncludeChildren(e.target.checked)} className="rounded" />
          <span className="text-sm">Include child teams in manager's view</span>
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave} disabled={!managerId}>Assign</Button>
        </div>
      </div>
    </Modal>
  );
}
