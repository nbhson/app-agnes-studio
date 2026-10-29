import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../SettingsContext';
import { API_BASE_URL } from '../config';
import { Field } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: Props) {
  const { apiKey, setApiKey } = useSettings();
  const [input, setInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset the draft each time the modal opens; focus the key field.
  useEffect(() => {
    if (open) {
      setInput(apiKey);
      setShowKey(false);
      inputRef.current?.focus();
    }
  }, [open, apiKey]);

  // A11y (R2-9): Esc closes; Tab is trapped inside the dialog; body scroll
  // is locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && containerRef.current) {
        const focusables = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !containerRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !containerRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    setApiKey(input.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={containerRef} className="relative bg-agnes-card border border-agnes-border rounded-2xl p-6 w-full max-w-md mx-4 animate-slide-up shadow-2xl">
        <h2 id="settings-title" className="text-xl font-semibold text-agnes-heading mb-1">Settings</h2>
        <p className="text-sm text-agnes-muted mb-6">Configure your Agnes API key</p>

        <div className="space-y-4">
          <Field label="API Base URL" htmlFor="settings-base-url">
            <input
              id="settings-base-url"
              type="text"
              value={API_BASE_URL}
              disabled
              readOnly
              className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 text-sm text-agnes-muted cursor-not-allowed"
            />
          </Field>
          <Field label="API Key" htmlFor="settings-api-key">
            <div className="relative">
              <input
                ref={inputRef}
                id="settings-api-key"
                type={showKey ? 'text' : 'password'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 pr-16 text-sm text-agnes-text placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-agnes-muted hover:text-agnes-heading rounded transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <p className="text-xs text-agnes-muted">
            Keep your API key secure. It is stored only in your browser local storage.
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-agnes-border text-sm text-agnes-muted hover:text-agnes-heading hover:border-agnes-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 rounded-lg bg-agnes-accent text-white text-sm font-medium hover:bg-agnes-accentLight transition-colors"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}
