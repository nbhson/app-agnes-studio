import { Settings, MessageSquare, Image, Video, Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme';

type ModuleType = 'chat' | 'image' | 'video';

interface Props {
  active: ModuleType;
  onSwitch: (m: ModuleType) => void;
  onSettings: () => void;
  hasApiKey: boolean;
}

const NAV: { id: ModuleType; label: string; icon: typeof MessageSquare; badge: string }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, badge: '2.5 Flash' },
  { id: 'image', label: 'Image', icon: Image, badge: '2.0 Flash' },
  { id: 'video', label: 'Video', icon: Video, badge: 'V2.0' },
];

export default function Sidebar({ active, onSwitch, onSettings, hasApiKey }: Props) {
  const { theme, toggleTheme } = useTheme();

  return (
    // Responsive: 64px icon rail below `lg`, full sidebar from `lg` up (R2-10).
    <aside className="w-16 lg:w-64 shrink-0 h-full bg-agnes-surface border-r border-agnes-border flex flex-col transition-[width] duration-150">
      <div className="p-4 lg:p-5 border-b border-agnes-border flex justify-center lg:justify-start">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-agnes-accent to-purple-400 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm" aria-hidden="true">A</span>
          </div>
          <div className="hidden lg:block">
            <h1 className="font-semibold text-agnes-heading text-sm">Agnes AI Studio</h1>
            <p className="text-xs text-agnes-muted">Multimodal Generation</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 lg:p-3 space-y-1" aria-label="Modules">
        {NAV.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => onSwitch(id)}
            aria-current={active === id ? 'page' : undefined}
            title={label}
            className={`w-full flex items-center lg:justify-start justify-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active === id
                ? 'bg-agnes-accent/20 text-agnes-accentLight border border-agnes-accent/30'
                : 'text-agnes-muted hover:text-agnes-heading hover:bg-agnes-card border border-transparent'
            }`}
          >
            <Icon size={18} className="shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">{label}</span>
            <span className="ml-auto text-xs opacity-50 hidden lg:inline">{badge}</span>
          </button>
        ))}
      </nav>

      <div className="p-2 lg:p-3 border-t border-agnes-border space-y-1">
        {!hasApiKey && (
          <div className="hidden lg:block px-3 py-2 rounded-lg bg-agnes-error/10 border border-agnes-error/30 mb-2">
            <p className="text-xs text-agnes-error">API key not configured</p>
          </div>
        )}
        <button
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="w-full flex items-center lg:justify-start justify-center gap-3 px-3 py-2.5 rounded-lg text-sm text-agnes-muted hover:text-agnes-heading hover:bg-agnes-card transition-all"
        >
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          <span className="hidden lg:inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button
          onClick={onSettings}
          className="w-full flex items-center lg:justify-start justify-center gap-3 px-3 py-2.5 rounded-lg text-sm text-agnes-muted hover:text-agnes-heading hover:bg-agnes-card transition-all"
        >
          <Settings size={18} aria-hidden="true" />
          <span className="hidden lg:inline">Settings</span>
        </button>
      </div>
    </aside>
  );
}
