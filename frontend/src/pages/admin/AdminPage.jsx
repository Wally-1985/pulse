import { useState, useEffect } from 'react';
import { adminApi } from '../../api';
import { Card, Button, Input, Badge, Spinner, Modal } from '../../components/ui';
import toast from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'smtp', label: 'SMTP' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'backups', label: 'Backups' },
  { key: 'api', label: 'API Keys' },
  { key: 'health', label: 'System Health' },
];

export default function AdminPage() {
  usePageTitle('Admin Settings');
  const [tab, setTab] = useState('general');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getSettings().then(r => { setSettings(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const saveSettings = async (updates) => {
    try {
      await adminApi.updateSettings(updates);
      setSettings(s => ({ ...s, ...updates }));
      toast.success('Settings saved');
    } catch { toast.error('Failed to save settings'); }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Admin Settings</h1>
      <div className="flex gap-6">
        <div className="w-44 shrink-0">
          <nav className="flex flex-col gap-0.5">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`text-left px-3 py-2 rounded-lg text-sm transition-all
                  ${tab === t.key ? 'bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] font-medium' : 'text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] hover:bg-[var(--pulse-surface-2)]'}`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex-1 min-w-0">
          {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div> : (
            <>
              {tab === 'general' && <GeneralTab settings={settings} onSave={saveSettings} />}
              {tab === 'smtp' && <SmtpTab settings={settings} onSave={saveSettings} />}
              {tab === 'holidays' && <HolidaysTab />}
              {tab === 'audit' && <AuditTab />}
              {tab === 'backups' && <BackupsTab />}
              {tab === 'api' && <ApiKeysTab />}
              {tab === 'health' && <HealthTab />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ settings, onSave }) {
  const [form, setForm] = useState({
    app_name: settings.app_name || 'Pulse',
    default_working_hours: settings.default_working_hours || '9',
    missing_entry_alert_time: settings.missing_entry_alert_time || '17:00',
    auth_method: settings.auth_method || 'password',
    sso_provider: settings.sso_provider || '',
    sso_client_id: settings.sso_client_id || '',
    sso_client_secret: settings.sso_client_secret || '',
    sso_discovery_url: settings.sso_discovery_url || '',
    sso_redirect_uri: settings.sso_redirect_uri || '',
  });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const isSSO = form.auth_method === 'sso';

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">General Settings</h2>
      <div className="flex flex-col gap-4">
        <Input label="App Name" value={form.app_name} onChange={set('app_name')} />
        <Input label="Default Working Hours Per Day" type="number" min="1" max="24" value={form.default_working_hours} onChange={set('default_working_hours')} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Missing Entry Alert Time</label>
          <input type="time" value={form.missing_entry_alert_time} onChange={set('missing_entry_alert_time')}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] w-40" />
          <p className="text-xs text-[var(--pulse-muted)]">Daily time to check for missing entries and send alerts to staff who haven&apos;t submitted. Only runs on rostered working days.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Authentication Method</label>
          <select value={form.auth_method} onChange={set('auth_method')}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
            <option value="password">Email + Password</option>
            <option value="sso">SSO (Single Sign-On)</option>
          </select>
        </div>

        {isSSO && (
          <div className="flex flex-col gap-4 p-4 bg-[var(--pulse-surface-2)] rounded-xl border border-[var(--pulse-border)]">
            <p className="text-sm font-medium text-[var(--pulse-accent)]">SSO Configuration</p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">SSO Provider</label>
              <select value={form.sso_provider} onChange={set('sso_provider')}
                className="bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
                <option value="">Select provider...</option>
                <option value="azure">Microsoft Azure AD</option>
                <option value="google">Google Workspace</option>
                <option value="okta">Okta</option>
                <option value="onelogin">OneLogin</option>
                <option value="custom">Custom OIDC</option>
              </select>
            </div>
            <Input label="Client ID" placeholder="Your SSO application client ID" value={form.sso_client_id} onChange={set('sso_client_id')} />
            <Input label="Client Secret" type="password" placeholder="Your SSO client secret" value={form.sso_client_secret} onChange={set('sso_client_secret')} />
            <Input label="Discovery / Metadata URL" placeholder="https://login.microsoftonline.com/{tenant}/.well-known/openid-configuration" value={form.sso_discovery_url} onChange={set('sso_discovery_url')} />
            <Input label="Redirect URI" placeholder={`${window.location.origin}/auth/callback`} value={form.sso_redirect_uri} onChange={set('sso_redirect_uri')} hint="Must match the redirect URI configured in your SSO provider" />
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">⚠️ Switching to SSO will affect all users. Make sure SSO is fully configured before saving, or users will be locked out.</p>
            </div>
          </div>
        )}

        <Button onClick={() => onSave(form)} className="w-fit">Save Changes</Button>
      </div>
    </Card>
  );
}

function SmtpTab({ settings, onSave }) {
  const [form, setForm] = useState({
    smtp_host: settings.smtp_host || '',
    smtp_port: settings.smtp_port || '587',
    smtp_user: settings.smtp_user || '',
    smtp_pass: '',
    smtp_from: settings.smtp_from || '',
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">SMTP Settings</h2>
      <div className="flex flex-col gap-4">
        <Input label="SMTP Host" placeholder="smtp.example.com" value={form.smtp_host} onChange={set('smtp_host')} />
        <Input label="Port" type="number" value={form.smtp_port} onChange={set('smtp_port')} />
        <Input label="Username" value={form.smtp_user} onChange={set('smtp_user')} />
        <Input label="Password" type="password" placeholder="Leave blank to keep existing" value={form.smtp_pass} onChange={set('smtp_pass')} />
        <Input label="From Address" placeholder="Pulse <noreply@example.com>" value={form.smtp_from} onChange={set('smtp_from')} />
        <Button onClick={() => onSave(Object.fromEntries(Object.entries(form).filter(([k, v]) => k !== 'smtp_pass' || v)))} className="w-fit">
          Save SMTP Settings
        </Button>
      </div>
    </Card>
  );
}

const AU_STATES = ['', 'QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

function HolidaysTab() {
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ name: '', date: '', state: '' });
  useEffect(() => { adminApi.getHolidays().then(r => setHolidays(r.data)); }, []);
  const add = async () => {
    if (!form.name || !form.date) return;
    try { await adminApi.createHoliday(form); setHolidays(h => [...h, { ...form, id: Date.now() }]); setForm({ name: '', date: '', state: '' }); toast.success('Holiday added'); }
    catch { toast.error('Failed to add'); }
  };
  const remove = async (id) => {
    try { await adminApi.deleteHoliday(id); setHolidays(h => h.filter(x => x.id !== id)); toast.success('Removed'); }
    catch { toast.error('Failed to delete'); }
  };
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">Public Holidays</h2>
      <p className="text-sm text-[var(--pulse-muted)] mb-4">Days listed here are excluded from missing entry reminders. Leave state blank to apply to all states.</p>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input placeholder="Holiday name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="flex-1 min-w-32" />
        <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]" />
        <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
          className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]">
          <option value="">All States</option>
          {AU_STATES.filter(s => s).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button onClick={add} disabled={!form.name || !form.date}>Add</Button>
      </div>
      <div className="flex flex-col gap-2">
        {holidays.map(h => (
          <div key={h.id} className="flex items-center justify-between py-2 px-3 bg-[var(--pulse-surface-2)] rounded-lg">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{h.name}</p>
                {h.state ? <span className="text-xs px-1.5 py-0.5 bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] rounded">{h.state}</span> : <span className="text-xs text-[var(--pulse-muted)]">All States</span>}
              </div>
              <p className="text-xs text-[var(--pulse-muted)]">{h.date}</p>
            </div>
            <Button size="xs" variant="danger" onClick={() => remove(h.id)}>Remove</Button>
          </div>
        ))}
        {holidays.length === 0 && <p className="text-sm text-[var(--pulse-muted)] text-center py-6">No holidays configured</p>}
      </div>
    </Card>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setLoading(true);
    adminApi.getAuditLogs({ page, limit: 25 }).then(r => { setLogs(r.data.logs); setTotal(r.data.total); }).finally(() => setLoading(false));
  }, [page]);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Audit Log</h2>
        <Button size="sm" variant="secondary" onClick={() => adminApi.exportAuditLogs({}).then(r => {
          const url = URL.createObjectURL(r.data);
          const a = document.createElement('a'); a.href = url; a.download = 'audit-logs.csv'; a.click();
        })}>Export CSV</Button>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[var(--pulse-muted)] border-b border-[var(--pulse-border)]">
              <th className="text-left py-2 pr-3">Time</th>
              <th className="text-left py-2 pr-3">User</th>
              <th className="text-left py-2 pr-3">Action</th>
              <th className="text-left py-2">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--pulse-border)]">
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="py-2 pr-3 font-mono text-[var(--pulse-muted)] whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{log.email || '—'}</td>
                  <td className="py-2 pr-3"><Badge variant="default">{log.action_type}</Badge></td>
                  <td className="py-2"><Badge variant={log.success ? 'success' : 'danger'}>{log.success ? 'OK' : 'Failed'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--pulse-border)]">
            <p className="text-xs text-[var(--pulse-muted)]">{total} total records</p>
            <div className="flex gap-2">
              <Button size="xs" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
              <Button size="xs" variant="secondary" disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}>Next →</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function BackupsTab() {
  const [backups, setBackups] = useState([]);
  const [running, setRunning] = useState(false);
  const load = () => adminApi.listBackups().then(r => setBackups(r.data));
  useEffect(() => { load(); }, []);
  const deleteBackup = async (filename) => {
    if (!confirm('Delete ' + filename + '? This cannot be undone.')) return;
    try { await adminApi.deleteBackup(filename); load(); toast.success('Backup deleted'); }
    catch { toast.error('Failed to delete backup'); }
  };

  const runBackup = async () => {
    setRunning(true);
    try {
      const r = await adminApi.runBackup();
      toast.success('Backup created: ' + r.data.filename);
    } catch (e) { toast.error(e.response?.data?.error || 'Backup failed'); }
    finally { setRunning(false); load(); }
  };
  const formatSize = (bytes) => bytes > 1024*1024 ? (bytes/1024/1024).toFixed(1)+' MB' : (bytes/1024).toFixed(1)+' KB';
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">Backups</h2>
        <Button size="sm" onClick={runBackup} loading={running}>Run Backup Now</Button>
      </div>
      <p className="text-sm text-[var(--pulse-muted)] mb-4">Each backup includes the database, app source files, and settings.</p>
      <div className="flex flex-col gap-2">
        {backups.map(b => (
          <div key={b.filename} className="flex items-center justify-between py-2 px-3 bg-[var(--pulse-surface-2)] rounded-lg">
            <div>
              <p className="text-sm font-mono">{b.filename}</p>
              <p className="text-xs text-[var(--pulse-muted)]">{formatSize(b.size)} · {new Date(b.createdAt).toLocaleString()}</p>
            </div>
            <Button size="xs" variant="danger" onClick={() => deleteBackup(b.filename)}>Delete</Button>
            <Button size="xs" variant="secondary" onClick={() => adminApi.downloadBackup(b.filename).then(r => {
              const url = URL.createObjectURL(r.data);
              const a = document.createElement('a'); a.href = url; a.download = b.filename; a.click();
            })}>Download</Button>
          </div>
        ))}
        {backups.length === 0 && <p className="text-sm text-[var(--pulse-muted)] text-center py-6">No backups yet</p>}
      </div>
    </Card>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [form, setForm] = useState({ name: '', permissions: { read: true, write: false } });
  const load = () => adminApi.getApiKeys().then(r => setKeys(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!form.name) { toast.error('Key name required'); return; }
    try { const r = await adminApi.createApiKey(form); setNewKey(r.data.key); load(); setShowCreate(false); }
    catch { toast.error('Failed to create key'); }
  };
  const revoke = async (id) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await adminApi.revokeApiKey(id); load(); toast.success('Key revoked');
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">API Keys</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>New Key</Button>
      </div>
      {newKey && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <p className="text-xs font-medium text-emerald-400 mb-1">Copy this key now — it won't be shown again:</p>
          <code className="text-xs font-mono break-all text-emerald-300">{newKey}</code>
          <Button size="xs" variant="ghost" className="mt-2" onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied'); }}>Copy</Button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {keys.map(k => (
          <div key={k.id} className={`flex items-center justify-between py-2 px-3 bg-[var(--pulse-surface-2)] rounded-lg ${k.revoked_at ? 'opacity-50' : ''}`}>
            <div>
              <p className="text-sm font-medium">{k.name}</p>
              <p className="text-xs text-[var(--pulse-muted)] font-mono">{k.key_prefix}… · {k.revoked_at ? 'Revoked' : 'Active'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={k.revoked_at ? 'danger' : 'success'}>{k.revoked_at ? 'Revoked' : 'Active'}</Badge>
              {!k.revoked_at && <Button size="xs" variant="danger" onClick={() => revoke(k.id)}>Revoke</Button>}
            </div>
          </div>
        ))}
        {keys.length === 0 && <p className="text-sm text-[var(--pulse-muted)] text-center py-6">No API keys</p>}
      </div>
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create API Key">
        <div className="flex flex-col gap-4">
          <Input label="Key Name" placeholder="e.g. HR System Integration" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Permissions</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.permissions.read} onChange={e => setForm(f => ({ ...f, permissions: { ...f.permissions, read: e.target.checked } }))} /><span className="text-sm">Read</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.permissions.write} onChange={e => setForm(f => ({ ...f, permissions: { ...f.permissions, write: e.target.checked } }))} /><span className="text-sm">Write</span></label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create} disabled={!form.name}>Create Key</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function HealthTab() {
  const [health, setHealth] = useState(null);
  useEffect(() => { adminApi.getSystemHealth().then(r => setHealth(r.data)); }, []);
  if (!health) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">System Health</h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Database', ok: health.db },
          { label: 'Backups', value: health.backupCount + ' stored' },
          { label: 'Last Backup', value: health.lastBackup ? new Date(health.lastBackup).toLocaleString() : 'Never' },
          { label: 'Node.js', value: health.nodeVersion },
          { label: 'Uptime', value: Math.round(health.uptime / 60) + 'm' },
          { label: 'Server Time', value: new Date(health.timestamp).toLocaleString() },
        ].map(item => (
          <div key={item.label} className="p-3 bg-[var(--pulse-surface-2)] rounded-xl">
            <p className="text-xs text-[var(--pulse-muted)] mb-1">{item.label}</p>
            {item.ok !== undefined
              ? <Badge variant={item.ok ? 'success' : 'danger'}>{item.ok ? 'Connected' : 'Error'}</Badge>
              : <p className="text-sm font-medium">{item.value}</p>
            }
          </div>
        ))}
      </div>
    </Card>
  );
}
