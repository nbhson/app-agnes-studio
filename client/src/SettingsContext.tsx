import { createContext, useContext, useState, useCallback } from 'react';

interface SettingsContextType {
  apiKey: string;
  setApiKey: (key: string) => void;
  apiUrl: string;
  hasApiKey: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  apiKey: '',
  setApiKey: () => {},
  apiUrl: 'http://localhost:3001',
  hasApiKey: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>(() => {
    return localStorage.getItem('agnes_api_key') || '';
  });

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    localStorage.setItem('agnes_api_key', key);
    fetch('http://localhost:3001/api/key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).catch(console.error);
  }, []);

  return (
    <SettingsContext.Provider value={{ apiKey, setApiKey, apiUrl: 'http://localhost:3001', hasApiKey: !!apiKey }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
