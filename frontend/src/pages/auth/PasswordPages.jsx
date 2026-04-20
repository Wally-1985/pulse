import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api';
import { Button, Input } from '../../components/ui';
import toast from 'react-hot-toast';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[var(--pulse-accent)] flex items-center justify-center text-white font-bold text-xl mb-3">P</div>
          <h1 className="text-xl font-semibold">Forgot Password</h1>
        </div>

        <div className="bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-2xl p-6">
          {sent ? (
            <div className="text-center">
              <div className="text-3xl mb-3">📬</div>
              <p className="font-medium mb-1">Check your email</p>
              <p className="text-sm text-[var(--pulse-muted)]">If that address is registered, we've sent a reset link.</p>
              <a href="/login" className="mt-4 inline-block text-sm text-[var(--pulse-accent)] hover:underline">← Back to login</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-[var(--pulse-muted)]">Enter your email and we'll send you a reset link.</p>
              <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              <Button type="submit" loading={loading} className="w-full">Send Reset Link</Button>
              <a href="/login" className="text-center text-sm text-[var(--pulse-muted)] hover:text-[var(--pulse-text)]">← Back to login</a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password: form.password });
      toast.success('Password reset! Please log in.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[var(--pulse-muted)]">Invalid reset link. <a href="/login" className="text-[var(--pulse-accent)]">Go to login</a></p>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[var(--pulse-accent)] flex items-center justify-center text-white font-bold text-xl mb-3">P</div>
          <h1 className="text-xl font-semibold">Reset Password</h1>
        </div>
        <div className="bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input label="New Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required hint="At least 8 characters" />
            <Input label="Confirm Password" type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Reset Password</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
