import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatModule from './components/ChatModule';
import ImageModule from './components/ImageModule';
import VideoModule from './components/VideoModule';
import SettingsModal from './components/SettingsModal';
import { SettingsProvider, useSettings } from './SettingsContext';
import { ThemeProvider } from './theme';

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
          <div
            role="status"
            className="px-4 sm:px-6 py-2 bg-agnes-error/10 border-b border-agnes-error/20 flex items-center gap-3"
          >
            <span className="text-xs text-agnes-error">
              API key not configured. Please add your API key to start generating.
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-xs text-agnes-error underline hover:no-underline shrink-0"
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
      {settingsOpen && <SettingsModal open onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </ThemeProvider>
  );
}
