/**
 * Multi-conversation persistence for chat (F1).
 * Stored in localStorage; ids are UUIDs so concurrent tabs don't collide.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  id: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface SessionStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  messageCount: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  stats: SessionStats;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'agnes_conversations';
const MAX_CONVERSATIONS = 50;

export const emptyStats = (): SessionStats => ({
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  messageCount: 0,
});

export function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New conversation',
    messages: [],
    stats: emptyStats(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop malformed entries so one bad record can't break the app.
    return parsed
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
      .map((c) => ({
        ...c,
        title: typeof c.title === 'string' && c.title ? c.title : 'Untitled',
        stats: c.stats ?? emptyStats(),
        createdAt: Number(c.createdAt) || Date.now(),
        updatedAt: Number(c.updatedAt) || Date.now(),
      }))
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
  } catch {
    // Quota exceeded (long histories) — drop oldest until it fits.
    try {
      const trimmed = [...conversations]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(1, Math.floor(MAX_CONVERSATIONS / 2)));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* give up silently — persistence is best-effort */
    }
  }
}

export function titleFromMessage(content: string): string {
  const t = content.trim().replace(/\s+/g, ' ');
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || 'New conversation';
}
