import { API_BASE_URL, apiHeaders } from './config';
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

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

  // Round 4 fix: the server holds the key in memory only. After a server
  // restart or a page reload the client still has a key in localStorage but
  // the proxy doesn't — every request would fail until the user re-saved
  // manually. Re-sync the stored key once on boot (fire-and-forget).
  const bootSyncRef = useRef(false);
  useEffect(() => {
    if (bootSyncRef.current || !apiKey) return;
    bootSyncRef.current = true;
    fetch(`${API_BASE_URL}/api/key`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key: apiKey }),
    }).catch(() => {
      /* server may not be up yet — user sees the error on first request */
    });
    // Run once on mount with the boot-time key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
