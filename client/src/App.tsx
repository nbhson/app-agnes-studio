import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatModule from './components/ChatModule';
import ImageModule from './components/ImageModule';
import VideoModule from './components/VideoModule';
import SettingsModal from './components/SettingsModal';
import { SettingsProvider, useSettings } from './SettingsContext';

type ModuleType = 'chat' | 'image' | 'video';

function AppContent() {
  const { hasApiKey } = useSettings();
  const [activeModule, setActiveModule] = useState<ModuleType>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen bg-agnes-bg overflow-hidden">
      <Sidebar
        active={activeModule}
        onSwitch={setActiveModule}
        onSettings={() => setSettingsOpen(true)}
        hasApiKey={hasApiKey}
      />
      <main className="flex-1 flex flex-col min-w-0">
        {!hasApiKey && (
          <div className="px-6 py-2 bg-agnes-error/10 border-b border-agnes-error/20 flex items-center gap-3">
            <span className="text-xs text-agnes-error">
              API key not configured. Please click Settings to add your API key.
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-xs text-agnes-error underline hover:no-underline"
            >
              Open Settings
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {activeModule === 'chat' && <ChatModule />}
          {activeModule === 'image' && <ImageModule />}
          {activeModule === 'video' && <VideoModule />}
        </div>
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
