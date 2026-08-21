import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Loader2, Copy, Check, Send, Bot, Sparkles, RefreshCw, Brain, BarChart3 } from 'lucide-react';
import { useSettings } from '../SettingsContext';
import 'highlight.js/styles/github-dark.min.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  id: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface SessionStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  messageCount: number;
}

const CONTEXT_WINDOW = 524288;

export default function ChatModule() {
  const { hasApiKey } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, messageCount: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading || !hasApiKey) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), id: Date.now().toString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { role: 'assistant', content: '', reasoning: '', id: assistantId }]);
    abortRef.current = new AbortController();
    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const body: Record<string, unknown> = {
        model: 'agnes-2.5-flash',
        messages: allMessages,
        stream: true,
      };
      if (thinkingEnabled) {
        body.chat_template_kwargs = { enable_thinking: true };
      }
      const resp = await fetch('http://localhost:3001/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });
      if (!resp.ok) throw new Error('Request failed');
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let reasoningContent = '';
      let currentUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const json = line.slice(6);
            try {
              const parsed = JSON.parse(json);
              if (parsed.usage) {
                currentUsage = parsed.usage;
              }
              if (parsed.choices?.[0]?.finish_reason) {
                continue;
              }
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                if (delta.reasoning_content) {
                  reasoningContent += delta.reasoning_content;
                  setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, reasoning: reasoningContent } : m));
                }
                if (delta.content) {
                  assistantContent += delta.content;
                  setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
                }
              }
            } catch {}
          }
        }
      }
      if (currentUsage) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, usage: currentUsage! } : m));
        setStats(prev => ({
          totalPromptTokens: prev.totalPromptTokens + currentUsage!.prompt_tokens,
          totalCompletionTokens: prev.totalCompletionTokens + currentUsage!.completion_tokens,
          totalTokens: prev.totalTokens + currentUsage!.total_tokens,
          messageCount: prev.messageCount + 1,
        }));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

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

  const CodeBlock = ({ children, className }: { children: React.ReactNode; className?: string }) => {
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
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-4 border-b border-agnes-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-agnes-accent to-purple-400 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Chat</h2>
            <p className="text-xs text-agnes-muted">agnes-2.5-flash · {CONTEXT_WINDOW.toLocaleString()} context</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setThinkingEnabled(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              thinkingEnabled
                ? 'border-agnes-accent/50 bg-agnes-accent/20 text-agnes-accentLight'
                : 'border-agnes-border text-agnes-muted hover:text-white hover:border-agnes-accent/50'
            }`}
          >
            <Brain size={14} className={thinkingEnabled ? 'animate-pulse-glow' : ''} />
            Thinking
          </button>
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setStats({ totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, messageCount: 0 }); abortRef.current?.abort(); }} className="px-3 py-1.5 rounded-lg border border-agnes-border text-xs text-agnes-muted hover:text-white transition-colors">
              <RefreshCw size={14} className="inline mr-1" /> New Chat
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 opacity-40">
            <Bot size={48} className="mx-auto mb-3" />
            <p className="text-sm text-agnes-text">Start a conversation with Agnes</p>
            <p className="text-xs text-agnes-muted mt-1">Supports streaming, multi-turn conversations, thinking mode &amp; markdown</p>
          </div>
        )}
        {messages.map(msg => (
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
                {msg.role === 'assistant' && <Bot size={16} className="mt-0.5 text-agnes-accentLight shrink-0" />}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code({ children, className, node, ...rest }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return match
                        ? <CodeBlock className={className} {...rest}>{children}</CodeBlock>
                        : <code className="bg-agnes-surface px-1 py-0.5 rounded text-xs font-mono text-agnes-accentLight" {...rest}>{children}</code>;
                    },
                    pre({ children, ...rest }: any) {
                      return <pre {...rest}>{children}</pre>;
                    },
                    ul: ({ children, ...rest }: any) => <ul className="list-disc pl-4 my-1 space-y-0.5" {...rest}>{children}</ul>,
                    ol: ({ children, ...rest }: any) => <ol className="list-decimal pl-4 my-1 space-y-0.5" {...rest}>{children}</ol>,
                    a: ({ children, href, ...rest }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-agnes-accentLight underline hover:no-underline" {...rest}>{children}</a>,
                    table: ({ children, ...rest }: any) => <div className="overflow-x-auto my-1"><table className="text-xs border-collapse border border-agnes-border" {...rest}>{children}</table></div>,
                    th: ({ children, ...rest }: any) => <th className="border border-agnes-border px-2 py-1 bg-agnes-surface font-medium" {...rest}>{children}</th>,
                    td: ({ children, ...rest }: any) => <td className="border border-agnes-border px-2 py-1" {...rest}>{children}</td>,
                  }}
                >
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
                <button onClick={() => copyMessage(msg.content, msg.id)} className="mt-1.5 text-xs text-agnes-muted hover:text-white transition-colors flex items-center gap-1">
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
        {error && (
          <div className="px-4 py-2 rounded-lg bg-agnes-error/10 border border-agnes-error/30 text-xs text-agnes-error">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="px-6 py-3 border-t border-agnes-border bg-agnes-surface/50">
        <div className="flex items-center justify-between text-xs text-agnes-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><BarChart3 size={12} /> {stats.totalTokens.toLocaleString()} tokens</span>
            <span>In: {stats.totalPromptTokens.toLocaleString()}</span>
            <span>Out: {stats.totalCompletionTokens.toLocaleString()}</span>
            <span>{stats.messageCount} msgs</span>
          </div>
          <div className="flex items-center gap-2 w-32">
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
      <div className="px-6 py-4 border-t border-agnes-border">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Agnes... (Enter to send, Shift+Enter for new line)"
            rows={3}
            disabled={loading || !hasApiKey}
            className="flex-1 bg-agnes-surface border border-agnes-border rounded-xl px-4 py-3 text-sm text-white placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent resize-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !hasApiKey || !input.trim()}
            className="px-4 py-3 rounded-xl bg-gradient-to-r from-agnes-accent to-purple-600 text-white font-medium hover:from-agnes-accentLight hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0"
          >
            {loading ? <Loader2 size={18} className="animate-spin-slow" /> : <Send size={18} />}
            <span className="hidden sm:inline">{loading ? 'Sending...' : 'Send'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
