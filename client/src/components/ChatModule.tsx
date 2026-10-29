import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  Loader2, Copy, Check, Send, Bot, Sparkles, Brain, BarChart3,
  Square, Trash2, Pencil, MessageSquare, Plus, RotateCcw, Check as CheckIcon,
} from 'lucide-react';
import { useSettings } from '../SettingsContext';
import { API_BASE_URL, apiHeaders } from '../config';
import { apiErrorFrom } from '../lib/api';
import {
  type ChatMessage,
  type Conversation,
  type SessionStats,
  createConversation,
  loadConversations,
  saveConversations,
  titleFromMessage,
} from '../lib/conversations';
import { ModuleHeader, TextArea, ErrorBanner, EmptyState } from './ui';
import 'highlight.js/styles/github-dark.min.css';

const CONTEXT_WINDOW = 524288;

// Hoisted to module level (R2-5): inline definitions remounted the markdown
// tree on every streamed token, wasting renders and resetting scroll.
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  return (
    <div className="relative group">
      {lang && (
        <span className="absolute top-2 right-2 text-[10px] text-agnes-muted bg-agnes-surface px-1.5 py-0.5 rounded font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {lang}
        </span>
      )}
      <pre className="!my-2 !rounded-lg !bg-[#0d1117] !p-4 !overflow-x-auto"><code className={className}>{children}</code></pre>
    </div>
  );
}

const MARKDOWN_COMPONENTS = {
  code({ children, className, ...rest }: any) {
    const match = /language-(\w+)/.exec(className || '');
    return match
      ? <CodeBlock className={className} {...rest}>{children}</CodeBlock>
      : <code className="bg-agnes-surface px-1 py-0.5 rounded text-xs font-mono text-agnes-accentLight" {...rest}>{children}</code>;
  },
  ul: ({ children, ...rest }: any) => <ul className="list-disc pl-4 my-1 space-y-0.5" {...rest}>{children}</ul>,
  ol: ({ children, ...rest }: any) => <ol className="list-decimal pl-4 my-1 space-y-0.5" {...rest}>{children}</ol>,
  a: ({ children, href, ...rest }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-agnes-accentLight underline hover:no-underline" {...rest}>
      {children}
    </a>
  ),
  table: ({ children, ...rest }: any) => <div className="overflow-x-auto my-1"><table className="text-xs border-collapse border border-agnes-border" {...rest}>{children}</table></div>,
  th: ({ children, ...rest }: any) => <th className="border border-agnes-border px-2 py-1 bg-agnes-surface font-medium" {...rest}>{children}</th>,
  td: ({ children, ...rest }: any) => <td className="border border-agnes-border px-2 py-1" {...rest}>{children}</td>,
};

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

export default function ChatModule() {
  const { hasApiKey } = useSettings();

  // Boot once: load persisted conversations or start with a fresh one (F1).
  const boot = useRef<Conversation[] | null>(null);
  if (!boot.current) {
    const loaded = loadConversations();
    boot.current = loaded.length ? loaded : [createConversation()];
  }
  const [conversations, setConversations] = useState<Conversation[]>(boot.current);
  const [activeId, setActiveId] = useState<string>(boot.current[0].id);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const messages = active.messages;
  const stats: SessionStats = active.stats;
  // Latest values for callbacks that must not go stale (delete while streaming).
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  /** Patch one conversation by id. */
  const patchConv = useCallback((convId: string, fn: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === convId ? fn(c) : c)));
  }, []);

  // Debounced persistence (F1) — token streams mutate state many times/second.
  const convsRef = useRef(conversations);
  convsRef.current = conversations;
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveConversations(convsRef.current), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Unmount: cancel in-flight stream and flush pending persistence.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveConversations(convsRef.current);
  }, []);

  const runStream = useCallback(async (
    conversationId: string,
    history: ChatMessage[],
    assistantId: string,
    thinking: boolean
  ) => {
    let content = '';
    let reasoning = '';
    let usage: Usage | null = null;
    let rafId = 0;
    const flush = () => {
      setConversations((prev) => prev.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, content, reasoning } : m
          ),
        };
      }));
    };

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          model: 'agnes-2.5-flash',
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          ...(thinking ? { chat_template_kwargs: { enable_thinking: true } } : {}),
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw await apiErrorFrom(resp);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      // Line-buffered SSE parsing (Round-1 fix #6/#7): keep the partial tail
      // and decode progressively so multi-byte chars survive chunk boundaries.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.usage) usage = parsed.usage;
            if (parsed.choices?.[0]?.finish_reason) continue;
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.reasoning_content) reasoning += delta.reasoning_content;
            if (delta.content) content += delta.content;
            // Throttle React updates to one per animation frame.
            if (!rafId) {
              rafId = requestAnimationFrame(() => {
                rafId = 0;
                flush();
              });
            }
          } catch { /* malformed chunk */ }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (rafId) cancelAnimationFrame(rafId);
      // Final flush: attach usage + update per-conversation stats.
      setConversations((prev) => prev.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId ? { ...m, content, reasoning, usage: usage ?? undefined } : m
          ),
          stats: usage
            ? {
                totalPromptTokens: c.stats.totalPromptTokens + usage.prompt_tokens,
                totalCompletionTokens: c.stats.totalCompletionTokens + usage.completion_tokens,
                totalTokens: c.stats.totalTokens + usage.total_tokens,
                messageCount: c.stats.messageCount + 1,
              }
            : c.stats,
          updatedAt: Date.now(),
        };
      }));
      setLoading(false);
    }
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || loading || !hasApiKey) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), id: crypto.randomUUID() };
    const assistantId = crypto.randomUUID();
    const isFirst = active.messages.length === 0;
    const history = [...active.messages, userMsg];
    patchConv(activeId, (c) => ({
      ...c,
      title: isFirst ? titleFromMessage(userMsg.content) : c.title,
      messages: [...c.messages, userMsg, { role: 'assistant', content: '', reasoning: '', id: assistantId }],
      updatedAt: Date.now(),
    }));
    setInput('');
    setError(null);
    setLoading(true);
    void runStream(activeId, history, assistantId, thinkingEnabled);
  }, [input, loading, hasApiKey, active, activeId, patchConv, runStream, thinkingEnabled]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newConversation = useCallback(() => {
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setError(null);
  }, []);

  const deleteConversation = useCallback((convId: string) => {
    if (loading && convId === activeId) abortRef.current?.abort();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== convId);
      if (next.length === 0) {
        const fresh = createConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (convId === activeIdRef.current) setActiveId(next[0].id);
      return next;
    });
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const title = titleFromMessage(renameDraft);
    patchConv(renamingId, (c) => ({ ...c, title }));
    setRenamingId(null);
  }, [renameDraft, renamingId, patchConv]);

  const regenerate = useCallback(() => {
    if (loading || !hasApiKey) return;
    const msgs = active.messages;
    const lastUserIdx = msgs.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const history = msgs.slice(0, lastUserIdx + 1);
    const assistantId = crypto.randomUUID();
    patchConv(activeId, (c) => ({
      ...c,
      messages: [...history, { role: 'assistant', content: '', reasoning: '', id: assistantId }],
      updatedAt: Date.now(),
    }));
    setError(null);
    setLoading(true);
    void runStream(activeId, history, assistantId, thinkingEnabled);
  }, [active, loading, hasApiKey, patchConv, runStream, thinkingEnabled]);

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const usagePct = Math.min((stats.totalTokens / CONTEXT_WINDOW) * 100, 100);
  const canRegenerate = !loading && hasApiKey && messages.some((m) => m.role === 'user');

  const conversationList = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full">
      {/* Conversation rail (F1) — collapses away on small screens */}
      <div className="hidden md:flex w-60 flex-col border-r border-agnes-border bg-agnes-surface/40">
        <div className="px-3 py-3 border-b border-agnes-border flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-agnes-muted">Conversations</span>
          <button
            onClick={newConversation}
            aria-label="New conversation"
            title="New conversation"
            className="p-1.5 rounded-md text-agnes-muted hover:text-agnes-heading hover:bg-agnes-card transition-colors"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversationList.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                c.id === activeId
                  ? 'bg-agnes-accent/15 text-agnes-heading border border-agnes-accent/30'
                  : 'text-agnes-muted hover:text-agnes-heading hover:bg-agnes-card border border-transparent'
              }`}
              onClick={() => c.id !== renamingId && setActiveId(c.id)}
            >
              <MessageSquare size={14} className="shrink-0" aria-hidden="true" />
              {renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  aria-label="Conversation title"
                  className="flex-1 min-w-0 bg-transparent text-sm text-agnes-text border-b border-agnes-accent focus:outline-none"
                />
              ) : (
                <span className="truncate text-sm flex-1">{c.title}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameDraft(c.title); }}
                aria-label={`Rename ${c.title}`}
                className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              >
                {renamingId === c.id ? <CheckIcon size={13} className="text-agnes-success" /> : <Pencil size={13} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                aria-label={`Delete ${c.title}`}
                className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:!text-agnes-error transition-opacity"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <ModuleHeader
          icon={Sparkles}
          gradient="from-agnes-accent to-purple-400"
          title="Chat"
          subtitle={`agnes-2.5-flash · ${CONTEXT_WINDOW.toLocaleString()} context`}
          actions={
            <>
              <button
                onClick={() => setThinkingEnabled((v) => !v)}
                aria-pressed={thinkingEnabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  thinkingEnabled
                    ? 'border-agnes-accent/50 bg-agnes-accent/20 text-agnes-accentLight'
                    : 'border-agnes-border text-agnes-muted hover:text-agnes-heading hover:border-agnes-accent/50'
                }`}
              >
                <Brain size={14} className={thinkingEnabled ? 'animate-pulse-glow' : ''} aria-hidden="true" />
                <span className="hidden sm:inline">Thinking</span>
              </button>
              <button
                onClick={regenerate}
                disabled={!canRegenerate}
                aria-label="Regenerate last response"
                className="px-3 py-1.5 rounded-lg border border-agnes-border text-xs text-agnes-muted hover:text-agnes-heading disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
              <button
                onClick={newConversation}
                aria-label="New conversation"
                className="px-3 py-1.5 rounded-lg border border-agnes-border text-xs text-agnes-muted hover:text-agnes-heading transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New</span>
              </button>
            </>
          }
          stats={<span className="hidden md:flex items-center gap-1"><BarChart3 size={12} /> {stats.totalTokens.toLocaleString()} tokens</span>}
        />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <EmptyState icon={Bot}>
              <p className="text-sm text-agnes-text">Start a conversation with Agnes</p>
              <p className="text-xs text-agnes-muted mt-1">Streaming, multi-turn, thinking mode, markdown &amp; history</p>
            </EmptyState>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className={`max-w-xl px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-agnes-accent text-white' : 'bg-agnes-card border border-agnes-border text-agnes-text'}`}>
                {msg.role === 'assistant' && msg.reasoning && (
                  <div className="mb-3 pb-3 border-b border-agnes-border/50">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Brain size={13} className="text-agnes-accentLight" />
                      <span className="text-[11px] font-medium text-agnes-accentLight uppercase tracking-wide">Reasoning</span>
                    </div>
                    <p className="text-xs text-agnes-muted leading-relaxed whitespace-pre-wrap break-words">{msg.reasoning}</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  {msg.role === 'assistant' && <Bot size={16} className="mt-0.5 text-agnes-accentLight shrink-0" aria-hidden="true" />}
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>
                    {msg.content || (msg.reasoning ? '(thinking...)' : '')}
                  </ReactMarkdown>
                </div>
                {msg.role === 'assistant' && msg.usage && (
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-agnes-muted font-mono">
                    <span>In: {msg.usage.prompt_tokens.toLocaleString()}</span>
                    <span>Out: {msg.usage.completion_tokens.toLocaleString()}</span>
                    <span className="text-agnes-accentLight">Σ {msg.usage.total_tokens.toLocaleString()}</span>
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <button onClick={() => copyMessage(msg.content, msg.id)} className="mt-1.5 text-xs text-agnes-muted hover:text-agnes-heading transition-colors flex items-center gap-1">
                    {copiedId === msg.id ? <Check size={12} className="text-agnes-success" /> : <Copy size={12} />}
                    {copiedId === msg.id ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start animate-slide-up">
              <div className="max-w-xl px-4 py-3 rounded-2xl bg-agnes-card border border-agnes-border">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin-slow text-agnes-accent" />
                  <span className="text-xs text-agnes-muted">{thinkingEnabled ? 'Agnes is reasoning...' : 'Agnes is thinking...'}</span>
                </div>
              </div>
            </div>
          )}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <div ref={messagesEndRef} />
        </div>
        <div className="px-4 sm:px-6 py-2.5 border-t border-agnes-border bg-agnes-surface/50">
          <div className="flex items-center justify-between text-xs text-agnes-muted">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1"><BarChart3 size={12} /> {stats.totalTokens.toLocaleString()} tokens</span>
              <span className="hidden sm:inline">In: {stats.totalPromptTokens.toLocaleString()}</span>
              <span className="hidden sm:inline">Out: {stats.totalCompletionTokens.toLocaleString()}</span>
              <span>{stats.messageCount} msgs</span>
            </div>
            <div className="flex items-center gap-2 w-32" title={`${usagePct.toFixed(1)}% of context window`}>
              <div className="flex-1 h-1 bg-agnes-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${usagePct > 80 ? 'bg-agnes-error' : 'bg-agnes-accent'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <span className="font-mono text-[10px]">{usagePct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-4 border-t border-agnes-border">
          <div className="flex gap-3">
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Agnes... (Enter to send, Shift+Enter for new line)"
              aria-label="Chat message"
              rows={3}
              disabled={loading || !hasApiKey}
            />
            {loading ? (
              <button
                onClick={stop}
                aria-label="Stop generating"
                className="px-4 py-3 rounded-xl bg-agnes-error/90 text-white font-medium hover:bg-agnes-error transition-all flex items-center gap-2 shrink-0"
              >
                <Square size={16} />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!hasApiKey || !input.trim()}
                className="px-4 py-3 rounded-xl bg-gradient-to-r from-agnes-accent to-purple-600 text-white font-medium hover:from-agnes-accentLight hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0"
              >
                <Send size={18} aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

