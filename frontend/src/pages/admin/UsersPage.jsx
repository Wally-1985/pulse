import { useState, useEffect } from 'react';
import { usersApi, teamsApi } from '../../api';
import { Card, Button, Input, Badge, Modal, Avatar, Spinner, Empty } from '../../components/ui';
import toast from 'react-hot-toast';

const ROLES = ['member', 'manager', 'admin'];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, t] = await Promise.all([usersApi.getUsers(), teamsApi.getTeams()]);
      setUsers(u.data);
      setTeams(t.data);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id, name) => {
    if (!confirm(`Deactivate ${name}? They will no longer be able to log in.`)) return;
    try {
      await usersApi.deleteUser(id);
      toast.success('User deactivated');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const handleUnlock = async (id) => {
    try {
      await usersApi.unlockUser(id);
      load();
      toast.success('Account unlocked');
    } catch { toast.error('Failed to unlock'); }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button onClick={() => setShowCreate(true)}>+ New User</Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <Empty icon="👤" title="No users found" />
      ) : (
        <Card>
          <div className="divide-y divide-[var(--pulse-border)]">
            {filtered.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--pulse-surface-2)] transition-colors">
                <Avatar user={{ firstName: user.first_name, lastName: user.last_name }} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{user.first_name} {user.last_name}</p>
                    {!user.is_active && <Badge variant="danger">Inactive</Badge>}
                    {user.locked_until && new Date(user.locked_until) > new Date() && <Badge variant="warning">Locked</Badge>}
                  </div>
                  <p className="text-xs text-[var(--pulse-muted)]">{user.email}</p>
                  {(user.teams || []).filter(Boolean).length > 0 && (
                    <p className="text-xs text-[var(--pulse-muted)] mt-0.5">
                      Teams: {user.teams.filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                  {(user.roles || []).map(r => (
                    <Badge key={r} variant={r === 'admin' ? 'danger' : r === 'manager' ? 'accent' : 'default'}>{r}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {user.locked_until && new Date(user.locked_until) > new Date() && (
                    <Button size="xs" variant="secondary" onClick={() => handleUnlock(user.id)}>Unlock</Button>
                  )}
                  <Button size="xs" variant="secondary" onClick={() => setEditUser(user)}>Edit</Button>
                  <Button size="xs" variant="danger" onClick={() => handleDelete(user.id, `${user.first_name} ${user.last_name}`)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <UserModal open={showCreate} onClose={() => setShowCreate(false)} teams={teams}
        onSave={async (data) => {
          await usersApi.createUser(data);
          toast.success('User created');
          setShowCreate(false);
          load();
        }}
      />

      <UserModal open={!!editUser} user={editUser} onClose={() => setEditUser(null)} teams={teams}
        onSave={async (data) => {
          await usersApi.updateUser(editUser.id, data);
          toast.success('User updated');
          setEditUser(null);
          load();
        }}
      />
    </div>
  );
}

function UserModal({ open, onClose, user, teams, onSave }) {
  const isEdit = !!user;
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', roles: ['member'], teamIds: [], teamRoles: {}, isActive: true, sendWelcomeEmail: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles: user.roles || ['member'],
        teamIds: user.team_ids || [],
        teamRoles: {},
        isActive: user.is_active,
        sendWelcomeEmail: false,
      });
    } else {
      setForm({ email: '', firstName: '', lastName: '', roles: ['member'], teamIds: [], teamRoles: {}, isActive: true, sendWelcomeEmail: true });
    }
  }, [user, open]);

  const toggleRole = (role) => {
    setForm(f => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role] }));
  };

  const toggleTeam = (id) => {
    setForm(f => {
      const inTeam = f.teamIds.includes(id);
      const newTeamIds = inTeam ? f.teamIds.filter(x => x !== id) : [...f.teamIds, id];
      const newTeamRoles = { ...f.teamRoles };
      if (inTeam) delete newTeamRoles[id];
      else newTeamRoles[id] = 'member';
      return { ...f, teamIds: newTeamIds, teamRoles: newTeamRoles };
    });
  };

  const setTeamRole = (teamId, role) => {
    setForm(f => ({ ...f, teamRoles: { ...f.teamRoles, [teamId]: role } }));
  };

  const handleSave = async () => {
    if (!form.firstName || !form.lastName) { toast.error('First and last name required'); return; }
    if (!isEdit && !form.email) { toast.error('Email required'); return; }
    setSaving(true);
    try { await onSave(form); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit User' : 'Create User'} size="md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
          <Input label="Last Name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
        </div>

        {!isEdit && (
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        )}

        {/* Global Roles */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Global Roles</label>
          <p className="text-xs text-[var(--pulse-muted)]">Admin gives system access. Per-team manager role is set below.</p>
          <div className="flex gap-2">
            {ROLES.map(role => (
              <button key={role} type="button" onClick={() => toggleRole(role)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all capitalize
                  ${form.roles.includes(role) ? 'bg-[var(--pulse-accent)] border-[var(--pulse-accent)] text-white' : 'border-[var(--pulse-border)] text-[var(--pulse-muted)] hover:border-[var(--pulse-accent)]/50'}`}>
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Teams with per-team role */}
        {teams.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Team Assignments</label>
            <p className="text-xs text-[var(--pulse-muted)]">Select teams and set the role for each — a user can be a manager in one team and a member in another.</p>
            <div className="flex flex-col gap-2 p-3 bg-[var(--pulse-surface-2)] rounded-lg border border-[var(--pulse-border)] max-h-48 overflow-y-auto">
              {teams.map(team => {
                const inTeam = form.teamIds.includes(team.id);
                return (
                  <div key={team.id} className="flex items-center gap-3">
                    <button type="button" onClick={() => toggleTeam(team.id)}
                      className={`flex-1 text-left px-3 py-1.5 text-sm rounded-lg border transition-all
                        ${inTeam ? 'bg-[var(--pulse-accent-soft)] border-[var(--pulse-accent)] text-[var(--pulse-accent)]' : 'border-[var(--pulse-border)] text-[var(--pulse-muted)] hover:border-[var(--pulse-accent)]/50'}`}>
                      {team.name}
                    </button>
                    {inTeam && (
                      <select value={form.teamRoles[team.id] || 'member'} onChange={e => setTeamRole(team.id, e.target.value)}
                        className="text-xs bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-lg px-2 py-1.5 text-[var(--pulse-text)] shrink-0">
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isEdit && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
            <span className="text-sm">Active account</span>
          </label>
        )}

        {!isEdit && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.sendWelcomeEmail} onChange={e => setForm(f => ({ ...f, sendWelcomeEmail: e.target.checked }))} className="rounded" />
            <span className="text-sm text-[var(--pulse-muted)]">Send welcome email with temp password</span>
          </label>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>{isEdit ? 'Save Changes' : 'Create User'}</Button>
        </div>
      </div>
    </Modal>
  );
}
