import { forwardRef } from 'react';

// ─── BUTTON ────────────────────────────────────────────────────────────────
export const Button = forwardRef(({
  children, variant = 'primary', size = 'md', loading, className = '', disabled, ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pulse-accent)]';
  const variants = {
    primary:   'bg-[var(--pulse-accent)] hover:bg-[var(--pulse-accent-hover)] text-white shadow-sm',
    secondary: 'bg-[var(--pulse-surface-2)] hover:bg-[var(--pulse-border)] text-[var(--pulse-text)] border border-[var(--pulse-border)]',
    ghost:     'hover:bg-[var(--pulse-surface-2)] text-[var(--pulse-muted)] hover:text-[var(--pulse-text)]',
    danger:    'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
    success:   'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20',
  };
  const sizes = {
    xs: 'text-xs px-2.5 py-1.5',
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-5 py-2.5',
  };
  return (
    <button ref={ref} disabled={disabled || loading} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
});
Button.displayName = 'Button';

// ─── INPUT ─────────────────────────────────────────────────────────────────
export const Input = forwardRef(({ label, error, className = '', hint, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-sm font-medium text-[var(--pulse-text)]">{label}</label>}
    <input
      ref={ref}
      className={`w-full bg-[var(--pulse-surface-2)] border ${error ? 'border-red-500/60' : 'border-[var(--pulse-border)]'} 
        rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] placeholder:text-[var(--pulse-muted)]
        focus:outline-none focus:border-[var(--pulse-accent)] focus:ring-1 focus:ring-[var(--pulse-accent)]
        transition-colors ${className}`}
      {...props}
    />
    {hint && !error && <p className="text-xs text-[var(--pulse-muted)]">{hint}</p>}
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Input.displayName = 'Input';

// ─── SELECT ────────────────────────────────────────────────────────────────
export const Select = forwardRef(({ label, error, children, className = '', ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-sm font-medium text-[var(--pulse-text)]">{label}</label>}
    <select
      ref={ref}
      className={`w-full bg-[var(--pulse-surface-2)] border ${error ? 'border-red-500/60' : 'border-[var(--pulse-border)]'}
        rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)]
        focus:outline-none focus:border-[var(--pulse-accent)] focus:ring-1 focus:ring-[var(--pulse-accent)]
        transition-colors cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Select.displayName = 'Select';

// ─── TEXTAREA ──────────────────────────────────────────────────────────────
export const Textarea = forwardRef(({ label, error, className = '', ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-sm font-medium text-[var(--pulse-text)]">{label}</label>}
    <textarea
      ref={ref}
      className={`w-full bg-[var(--pulse-surface-2)] border ${error ? 'border-red-500/60' : 'border-[var(--pulse-border)]'}
        rounded-lg px-3 py-2 text-sm text-[var(--pulse-text)] placeholder:text-[var(--pulse-muted)]
        focus:outline-none focus:border-[var(--pulse-accent)] focus:ring-1 focus:ring-[var(--pulse-accent)]
        transition-colors resize-none ${className}`}
      {...props}
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Textarea.displayName = 'Textarea';

// ─── CARD ──────────────────────────────────────────────────────────────────
export const Card = ({ children, className = '', ...props }) => (
  <div
    className={`bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-xl ${className}`}
    {...props}
  >
    {children}
  </div>
);

// ─── BADGE ─────────────────────────────────────────────────────────────────
export const Badge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default:  'bg-[var(--pulse-surface-2)] text-[var(--pulse-muted)] border-[var(--pulse-border)]',
    success:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger:   'bg-red-500/10 text-red-400 border-red-500/20',
    accent:   'bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] border-[var(--pulse-accent)]/20',
    info:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

// ─── SPINNER ───────────────────────────────────────────────────────────────
export const Spinner = ({ size = 'md', className = '' }) => {
  const sizes = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5', lg: 'w-8 h-8' };
  return (
    <svg className={`animate-spin text-current ${sizes[size]} ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
};

// ─── MODAL ─────────────────────────────────────────────────────────────────
export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} bg-[var(--pulse-surface)] border border-[var(--pulse-border)] rounded-2xl shadow-2xl animate-fade-in`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--pulse-border)]">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="text-[var(--pulse-muted)] hover:text-[var(--pulse-text)] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// ─── EMPTY STATE ───────────────────────────────────────────────────────────
export const Empty = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {icon && <div className="text-4xl mb-4">{icon}</div>}
    <p className="font-medium text-[var(--pulse-text)] mb-1">{title}</p>
    {description && <p className="text-sm text-[var(--pulse-muted)] mb-4 max-w-xs">{description}</p>}
    {action}
  </div>
);

// ─── DIVIDER ───────────────────────────────────────────────────────────────
export const Divider = ({ className = '' }) => (
  <hr className={`border-[var(--pulse-border)] ${className}`} />
);

// ─── AVATAR ────────────────────────────────────────────────────────────────
export const Avatar = ({ user, size = 'md', className = '' }) => {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base', xl: 'w-12 h-12 text-lg' };
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={initials} className={`${sizes[size]} rounded-full object-cover ${className}`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-[var(--pulse-accent-soft)] text-[var(--pulse-accent)] font-semibold flex items-center justify-center shrink-0 ${className}`}>
      {initials}
    </div>
  );
};
