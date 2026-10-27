import { API_BASE_URL, apiHeaders } from './config';
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
  apiUrl: API_BASE_URL,
  hasApiKey: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>(() => {
    return localStorage.getItem('agnes_api_key') || '';
  });

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    localStorage.setItem('agnes_api_key', key);
    fetch(`${API_BASE_URL}/api/key`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key }),
    }).catch(console.error);
  }, []);

  return (
    <SettingsContext.Provider value={{ apiKey, setApiKey, apiUrl: API_BASE_URL, hasApiKey: !!apiKey }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
