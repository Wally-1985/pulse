import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usersApi, authApi, zendeskApi } from '../../api';
import { Card, Button, Input, Badge, Modal, Spinner, Avatar } from '../../components/ui';
import toast from 'react-hot-toast';
import { usePageTitle } from '../../hooks/usePageTitle';

const TIMEZONES = [
  'UTC', 'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
  'Australia/Perth', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore',
];

export default function ProfilePage() {
  usePageTitle('Profile');
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    Promise.all([
      usersApi.getProfile(),
      authApi.getSessions(),
    ]).then(([p, s]) => {
      setProfile(p.data);
      setSessions(s.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Avatar user={user} size="xl" />
        <div>
          <h1 className="text-xl font-semibold">{user?.firstName} {user?.lastName}</h1>
          <p className="text-sm text-[var(--pulse-muted)]">{user?.email}</p>
          <div className="flex gap-1.5 mt-1.5">
            {user?.roles?.map(r => (
              <Badge key={r} variant={r === 'admin' ? 'danger' : r === 'manager' ? 'accent' : 'default'}>
                {r}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl mb-6 w-fit">
        {[
          { key: 'profile', label: 'Profile' },
          { key: 'security', label: 'Security' },
          { key: 'sessions', label: 'Sessions' },
    { key: 'zendesk', label: 'Zendesk' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all
              ${activeTab === tab.key
                ? 'bg-[var(--pulse-accent)] text-white'
                : 'text-[var(--pulse-muted)] hover:text-[var(--pulse-text)]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab profile={profile} onSave={async (data) => {
        await usersApi.updateProfile(data);
        await refreshUser();
        toast.success('Profile updated');
      }} />}
      {activeTab === 'security' && <SecurityTab profile={profile} onMfaChange={() => {
        usersApi.getProfile().then(r => setProfile(r.data));
        refreshUser();
      }} />}
      {activeTab === 'sessions' && <SessionsTab sessions={sessions} currentSessionRefresh={() => authApi.getSessions().then(r => setSessions(r.data))} />}
      {activeTab === 'zendesk' && <ZendeskTab />}
    </div>
  );
}

function ProfileTab({ profile, onSave }) {
  const [form, setForm] = useState({
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    timezone: profile?.timezone || 'UTC',
    notificationPreference: profile?.notification_preference || 'both',
  });
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); }
    catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">Personal Details</h2>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={form.firstName} onChange={set('firstName')} />
          <Input label="Last Name" value={form.lastName} onChange={set('lastName')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Timezone</label>
          <select
            value={form.timezone}
            onChange={set('timezone')}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] focus:outline-none focus:border-[var(--pulse-accent)]"
          >
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Notifications</label>
          <select
            value={form.notificationPreference}
            onChange={set('notificationPreference')}
            className="bg-[var(--pulse-surface-2)] border border-[var(--pulse-border)] rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] focus:outline-none focus:border-[var(--pulse-accent)]"
          >
            <option value="both">Email + In-app</option>
            <option value="email">Email only</option>
            <option value="in_app">In-app only</option>
            <option value="none">None</option>
          </select>
        </div>

        <Button onClick={handleSave} loading={saving} className="w-fit">Save Changes</Button>
      </div>
    </Card>
  );
}

function SecurityTab({ profile, onMfaChange }) {
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const [mfaModal, setMfaModal] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(null); // { secret, qrCode }
  const [mfaCode, setMfaCode] = useState('');
  const [disableModal, setDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwLoading(true);
    try {
      await authApi.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success('Password changed');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const startMfaSetup = async () => {
    try {
      const { data } = await authApi.setupMfa();
      setMfaSetup(data);
      setMfaModal(true);
    } catch { toast.error('Failed to start MFA setup'); }
  };

  const confirmMfa = async () => {
    try {
      await authApi.verifyMfa(mfaCode);
      toast.success('MFA enabled');
      setMfaModal(false);
      setMfaCode('');
      onMfaChange();
    } catch { toast.error('Invalid code — try again'); }
  };

  const confirmDisable = async () => {
    try {
      await authApi.disableMfa(disableCode);
      toast.success('MFA disabled');
      setDisableModal(false);
      setDisableCode('');
      onMfaChange();
    } catch { toast.error('Invalid code'); }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Password */}
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <Input label="Current Password" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} required />
          <Input label="New Password" type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} required hint="At least 8 characters" />
          <Input label="Confirm New Password" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
          {pwError && <p className="text-sm text-red-400">{pwError}</p>}
          <Button type="submit" loading={pwLoading} className="w-fit">Update Password</Button>
        </form>
      </Card>

      {/* MFA */}
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Two-Factor Authentication</h2>
            <p className="text-sm text-[var(--pulse-muted)] mt-1">
              {profile?.mfa_enabled ? 'MFA is enabled on your account.' : 'Add an extra layer of security using an authenticator app.'}
            </p>
          </div>
          <Badge variant={profile?.mfa_enabled ? 'success' : 'default'}>
            {profile?.mfa_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="mt-4">
          {profile?.mfa_enabled ? (
            <Button variant="danger" size="sm" onClick={() => setDisableModal(true)}>Disable MFA</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={startMfaSetup}>Enable MFA</Button>
          )}
        </div>
      </Card>

      {/* MFA Setup Modal */}
      <Modal open={mfaModal} onClose={() => setMfaModal(false)} title="Set Up Two-Factor Authentication">
        {mfaSetup && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--pulse-muted)]">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
            </p>
            <div className="flex justify-center bg-white p-4 rounded-xl">
              <img src={mfaSetup.qrCode} alt="MFA QR Code" className="w-40 h-40" />
            </div>
            <div className="p-3 bg-[var(--pulse-surface-2)] rounded-lg">
              <p className="text-xs text-[var(--pulse-muted)] mb-1">Manual entry key</p>
              <code className="text-xs font-mono break-all text-[var(--pulse-text)]">{mfaSetup.secret}</code>
            </div>
            <Input
              label="Verification Code"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              maxLength={6}
              className="text-center text-lg tracking-widest font-mono"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setMfaModal(false)}>Cancel</Button>
              <Button onClick={confirmMfa} disabled={mfaCode.length !== 6}>Verify & Enable</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Disable MFA Modal */}
      <Modal open={disableModal} onClose={() => setDisableModal(false)} title="Disable Two-Factor Authentication">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--pulse-muted)]">Enter your current authenticator code to confirm disabling MFA.</p>
          <Input
            label="Current Code"
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={disableCode}
            onChange={e => setDisableCode(e.target.value)}
            maxLength={6}
            className="text-center text-lg tracking-widest font-mono"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDisableModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDisable} disabled={disableCode.length !== 6}>Disable MFA</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SessionsTab({ sessions, currentSessionRefresh }) {
  const handleRevoke = async (id) => {
    try {
      await authApi.revokeSession(id);
      toast.success('Session revoked');
      currentSessionRefresh();
    } catch { toast.error('Failed to revoke'); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">Active Sessions</h2>
      <div className="flex flex-col gap-2">
        {sessions.map(s => (
          <div key={s.id} className="flex items-start gap-3 p-3 bg-[var(--pulse-surface-2)] rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-[var(--pulse-accent-soft)] flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-[var(--pulse-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--pulse-muted)] truncate">{s.deviceInfo || 'Unknown device'}</p>
              <p className="text-xs text-[var(--pulse-muted)] mt-0.5">
                {s.ipAddress && `${s.ipAddress} · `}Last active {new Date(s.lastUsedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {s.isCurrent ? (
                <Badge variant="success">Current</Badge>
              ) : (
                <Button size="xs" variant="danger" onClick={() => handleRevoke(s.id)}>Revoke</Button>
              )}
            </div>
          </div>
        ))}
        {sessions.length === 0 && <p className="text-sm text-[var(--pulse-muted)] text-center py-6">No active sessions</p>}
      </div>
    </Card>
  );
}

function ZendeskTab() {
  const [form, setForm] = useState({ subdomain: '', email: '', apiToken: '', enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    zendeskApi.getSettings().then(r => {
      setForm({ subdomain: r.data.subdomain || '', email: r.data.email || '', apiToken: '', enabled: r.data.enabled !== false });
      setHasToken(r.data.has_token);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await zendeskApi.saveSettings(form);
      toast.success('Zendesk settings saved');
      if (form.apiToken) setHasToken(true);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await zendeskApi.testConnection();
      toast.success('Connected as ' + r.data.name + ' (' + r.data.email + ')');
    } catch (err) { toast.error(err.response?.data?.error || 'Connection failed'); }
    finally { setTesting(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-1">Zendesk Integration</h2>
      <p className="text-sm text-[var(--pulse-muted)] mb-4">Connect your Zendesk account to see today's ticket activity on your daily entry page.</p>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="rounded" />
          <span className="text-sm">Enable Zendesk integration</span>
        </label>
        <Input label="Zendesk Subdomain" placeholder="yourcompany (from yourcompany.zendesk.com)" value={form.subdomain} onChange={e => setForm(f => ({ ...f, subdomain: e.target.value }))} />
        <Input label="Your Zendesk Email" type="email" placeholder="you@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <Input
          label="API Token"
          type="password"
          placeholder={hasToken ? 'Token saved — enter new token to update' : 'Paste your Zendesk API token'}
          value={form.apiToken}
          onChange={e => setForm(f => ({ ...f, apiToken: e.target.value }))}
          hint="Generate at Admin > Apps and Integrations > Zendesk API > API Tokens"
        />
        <div className="flex gap-2">
          <Button onClick={handleSave} loading={saving}>Save Settings</Button>
          <Button variant="secondary" onClick={handleTest} loading={testing} disabled={!hasToken && !form.apiToken}>Test Connection</Button>
        </div>
      </div>
    </Card>
  );
}