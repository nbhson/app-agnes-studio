import { useState } from 'react';
import { useSettings } from '../SettingsContext';
import { API_BASE_URL } from '../config';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: Props) {
  const { apiKey, setApiKey } = useSettings();
  const [input, setInput] = useState(apiKey);

  if (!open) return null;

  const handleSave = () => {
    setApiKey(input);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-agnes-card border border-agnes-border rounded-2xl p-6 w-full max-w-md mx-4 animate-slide-up shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-1">Settings</h2>
        <p className="text-sm text-agnes-muted mb-6">Configure your Agnes API key</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-agnes-text mb-2">API Base URL</label>
            <input
              type="text"
              value={API_BASE_URL}
              disabled
              className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 text-sm text-agnes-muted cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-agnes-text mb-2">API Key</label>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxx"
              className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent"
            />
            <p className="text-xs text-agnes-muted mt-2">
              Keep your API key secure. It is stored only in your browser local storage.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-agnes-border text-sm text-agnes-muted hover:text-white hover:border-agnes-accent transition-colors"
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
