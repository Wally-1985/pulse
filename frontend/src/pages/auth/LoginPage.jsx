import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button, Input } from '../../components/ui';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', mfaCode: '', rememberMe: false });
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(form);
      if (result?.requiresMfa) {
        setStep('mfa');
        setLoading(false);
        return;
      }
      const roles = result?.user?.roles || [];
      if (roles.includes('admin') || roles.includes('manager')) {
        navigate('/manager');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pulse-bg)' }}>
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--pulse-accent), transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[var(--pulse-accent)] flex items-center justify-center text-white font-bold text-xl mb-3 shadow-lg shadow-[var(--pulse-accent)]/30">
            P
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Pulse</h1>
          <p className="text-sm text-[var(--pulse-muted)] mt-1">
            {step === 'mfa' ? 'Enter your verification code' : 'Sign in to your account'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {step === 'credentials' ? (
              <>
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={set('email')}
                  autoComplete="email"
                  required
                />
                <div>
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={set('password')}
                    autoComplete="current-password"
                    required
                  />
                  <div className="flex justify-end mt-1.5">
                    <a href="/forgot-password" className="text-xs text-[var(--pulse-accent)] hover:underline">
                      Forgot password?
                    </a>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.rememberMe}
                    onChange={set('rememberMe')}
                    className="rounded border-[var(--pulse-border)] bg-[var(--pulse-surface-2)] text-[var(--pulse-accent)]"
                  />
                  <span className="text-sm text-[var(--pulse-muted)]">Remember me for 30 days</span>
                </label>
              </>
            ) : (
              <>
                <div className="text-center py-2">
                  <p className="text-sm text-[var(--pulse-muted)]">Open your authenticator app and enter the 6-digit code.</p>
                </div>
                <Input
                  label="Verification Code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={form.mfaCode}
                  onChange={set('mfaCode')}
                  maxLength={6}
                  className="text-center text-lg tracking-widest font-mono"
                  autoFocus
                />
                <button type="button" onClick={() => setStep('credentials')} className="text-xs text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] text-center">
                  ← Back
                </button>
              </>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full mt-1">
              {step === 'mfa' ? 'Verify' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--pulse-muted)] mt-4">
          Pulse — Team Performance Tracker
        </p>
      </div>
    </div>
  );
}
