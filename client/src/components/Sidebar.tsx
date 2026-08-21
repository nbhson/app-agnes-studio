import { Settings, MessageSquare, Image, Video } from 'lucide-react';

type ModuleType = 'chat' | 'image' | 'video';

interface Props {
  active: ModuleType;
  onSwitch: (m: ModuleType) => void;
  onSettings: () => void;
  hasApiKey: boolean;
}

export default function Sidebar({ active, onSwitch, onSettings, hasApiKey }: Props) {
  return (
    <aside className="w-64 min-h-screen bg-agnes-surface border-r border-agnes-border flex flex-col">
      <div className="p-5 border-b border-agnes-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-agnes-accent to-purple-400 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <h1 className="font-semibold text-white text-sm">Agnes AI Studio</h1>
            <p className="text-xs text-agnes-muted">Multimodal Generation</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <button
          onClick={() => onSwitch('chat')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            active === 'chat'
              ? 'bg-agnes-accent/20 text-agnes-accentLight border border-agnes-accent/30'
              : 'text-agnes-muted hover:text-white hover:bg-agnes-card border border-transparent'
          }`}
        >
          <MessageSquare size={18} />
          Chat
          <span className="ml-auto text-xs opacity-50">2.5 Flash</span>
        </button>

        <button
          onClick={() => onSwitch('image')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            active === 'image'
              ? 'bg-agnes-accent/20 text-agnes-accentLight border border-agnes-accent/30'
              : 'text-agnes-muted hover:text-white hover:bg-agnes-card border border-transparent'
          }`}
        >
          <Image size={18} />
          Image
          <span className="ml-auto text-xs opacity-50">2.0 Flash</span>
        </button>

        <button
          onClick={() => onSwitch('video')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            active === 'video'
              ? 'bg-agnes-accent/20 text-agnes-accentLight border border-agnes-accent/30'
              : 'text-agnes-muted hover:text-white hover:bg-agnes-card border border-transparent'
          }`}
        >
          <Video size={18} />
          Video
          <span className="ml-auto text-xs opacity-50">V2.0</span>
        </button>
      </nav>

      <div className="p-3 border-t border-agnes-border">
        {!hasApiKey && (
          <div className="px-3 py-2 rounded-lg bg-agnes-error/10 border border-agnes-error/30 mb-2">
            <p className="text-xs text-agnes-error">API key not configured</p>
          </div>
        )}
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-agnes-muted hover:text-white hover:bg-agnes-card transition-all"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>
    </aside>
  );
}
