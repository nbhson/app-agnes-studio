import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

/**
 * Small design-system primitives shared by all modules (R2-6) — keeps
 * spacing/typography consistent and removes per-module class duplicates.
 */

export const inputClass =
  'w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-3 text-sm ' +
  'text-agnes-text placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent ' +
  'focus:ring-1 focus:ring-agnes-accent resize-none transition-colors disabled:opacity-50';

export function ModuleHeader({
  icon: Icon,
  gradient,
  title,
  subtitle,
  stats,
  actions,
}: {
  icon: LucideIcon;
  gradient: string;
  title: string;
  subtitle: string;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-4 sm:px-6 py-4 border-b border-agnes-border flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          <Icon size={16} className="text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-agnes-heading truncate">{title}</h2>
          <p className="text-xs text-agnes-muted truncate">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {actions}
        {stats && <div className="flex items-center gap-2 sm:gap-4 text-xs text-agnes-muted">{stats}</div>}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-agnes-text mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextArea({ className = '', ...rest }: TextareaProps) {
  return <textarea {...rest} className={`${inputClass} ${className}`} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 text-sm text-agnes-text placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent transition-colors ${className}`}
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex gap-2 p-1 bg-agnes-surface rounded-lg w-fit" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            value === o.value
              ? 'bg-agnes-card text-agnes-heading shadow-sm'
              : 'text-agnes-muted hover:text-agnes-heading'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="px-4 py-3 rounded-lg bg-agnes-error/10 border border-agnes-error/30 text-sm text-agnes-error flex items-start justify-between gap-3"
    >
      <span className="break-words">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 text-agnes-error/70 hover:text-agnes-error transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="text-center py-12 opacity-40 select-none">
      <Icon size={40} className="mx-auto mb-3" aria-hidden="true" />
      {children}
    </div>
  );
}

export function StatChip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <Icon size={12} aria-hidden="true" /> {children}
    </span>
  );
}
