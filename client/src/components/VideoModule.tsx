import { API_BASE_URL, apiHeaders } from '../config';
import { useState, useEffect, useRef } from 'react';
import { Download, Video as VideoIcon, Copy, Check, Film, Loader2, BarChart3, Layers, Clock } from 'lucide-react';
import { useSettings } from '../SettingsContext';

type GenMode = 'text-to-video' | 'image-to-video' | 'keyframes';
type VideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

interface VideoItem {
  video_id: string;
  task_id: string;
  status: VideoStatus;
  progress: number;
  prompt: string;
  size: string;
  seconds: string;
  created_at: number;
  completed_at?: number;
  video_url?: string;
  error?: string;
}

export default function VideoModule() {
  const { hasApiKey } = useSettings();
  const [mode, setMode] = useState<GenMode>('text-to-video');
  const [prompt, setPrompt] = useState('');
  const [imageUrls, setImageUrls] = useState<string>('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1152);
  const [height, setHeight] = useState(768);
  const [numFrames, setNumFrames] = useState(121);
  const [frameRate, setFrameRate] = useState(24);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<Map<string, VideoItem>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pollRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  useEffect(() => {
    return () => {
      pollRefs.current.forEach(ref => clearTimeout(ref));
    };
  }, []);

  const startPolling = (videoId: string, taskId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/agnesapi?video_id=${encodeURIComponent(videoId)}`,
          { headers: apiHeaders() }, // thiếu apiHeaders trước đây → poll 401 khi PROXY_TOKEN bật
        );
        if (!res.ok) return;
        const data = await res.json();
        setTasks(prev => {
          const next = new Map(prev);
          const existing = next.get(taskId);
          if (existing) {
            next.set(taskId, { ...existing, ...data });
          }
          return next;
        });

        if (data.status === 'completed' || data.status === 'failed') {
          setCompletedTasks(prev => data.status === 'completed' ? prev + 1 : prev);
          return;
        }
      } catch {}

      const ref = setTimeout(poll, 3000);
      pollRefs.current.set(taskId, ref);
    };
    const ref = setTimeout(poll, 3000);
    pollRefs.current.set(taskId, ref);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading || !hasApiKey) return;

    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      model: 'agnes-video-v2.0',
      prompt: prompt.trim(),
      width,
      height,
      num_frames: numFrames,
      frame_rate: frameRate,
    };

    if (mode === 'image-to-video' && imageUrls.trim()) {
      body.image = imageUrls.trim().split('\n').map((u: string) => u.trim()).filter(Boolean)[0];
    }

    if (mode === 'keyframes' && imageUrls.trim()) {
      body.extra_body = {
        image: imageUrls.trim().split('\n').map((u: string) => u.trim()).filter(Boolean),
        mode: 'keyframes',
      };
    }

    if (negativePrompt.trim()) {
      body.negative_prompt = negativePrompt.trim();
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/videos`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const task: VideoItem = {
        video_id: data.video_id,
        task_id: data.task_id,
        status: data.status as VideoStatus,
        progress: data.progress || 0,
        prompt: prompt.trim(),
        size: data.size || `${width}x${height}`,
        seconds: data.seconds || '0',
        created_at: data.created_at,
        completed_at: data.completed_at,
        video_url: data.metadata?.url,
        error: data.error?.message,
      };

      setTasks(prev => {
        const next = new Map(prev);
        next.set(task.task_id, task);
        return next;
      });
      setTotalTasks(prev => prev + 1);
      if (data.status === 'completed') {
        setCompletedTasks(prev => prev + 1);
        setTotalDuration(prev => prev + parseFloat(data.seconds || '0'));
      }
      if (data.status !== 'completed' && data.status !== 'failed') {
        startPolling(data.video_id, data.task_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create video task');
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const durationSeconds = Math.round(numFrames / frameRate);
  const allTasks = Array.from(tasks.values()).reverse();

  const statusColor = (s: VideoStatus) => {
    switch (s) {
      case 'queued': return 'text-agnes-warning';
      case 'in_progress': return 'text-agnes-accentLight';
      case 'completed': return 'text-agnes-success';
      case 'failed': return 'text-agnes-error';
    }
  };

  const statusLabel = (s: VideoStatus) => {
    switch (s) {
      case 'queued': return 'Queued';
      case 'in_progress': return 'Generating';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
    }
  };

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-agnes-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center">
              <VideoIcon size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Video Generation</h2>
              <p className="text-xs text-agnes-muted">agnes-video-v2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-agnes-muted">
            <span className="flex items-center gap-1"><BarChart3 size={12} /> {totalTasks} tasks</span>
            <span className="flex items-center gap-1"><Check size={12} className="text-agnes-success" /> {completedTasks} done</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {totalDuration.toFixed(0)}s total</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex gap-2 p-1 bg-agnes-surface rounded-lg w-fit">
            {(['text-to-video', 'image-to-video', 'keyframes'] as GenMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === m ? 'bg-agnes-card text-white shadow-sm' : 'text-agnes-muted hover:text-white'
                }`}
              >
                {m === 'text-to-video' ? 'Text to Video' : m === 'image-to-video' ? 'Image to Video' : 'Keyframes'}
              </button>
            ))}
          </div>

          {(mode === 'image-to-video' || mode === 'keyframes') && (
            <div>
              <label className="block text-sm font-medium text-agnes-text mb-2">
                {mode === 'keyframes' ? 'Keyframe URLs (one per line)' : 'Input Image URL'}
              </label>
              <textarea
                value={imageUrls}
                onChange={(e) => setImageUrls(e.target.value)}
                placeholder={mode === 'keyframes'
                  ? 'https://example.com/kf1.png\nhttps://example.com/kf2.png'
                  : 'https://example.com/image.png'}
                rows={3}
                className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-3 text-sm text-white placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent resize-none"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-agnes-text mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video you want to generate..."
              rows={4}
              className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-3 text-sm text-white placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-agnes-text mb-2">Negative Prompt (optional)</label>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="What to avoid..."
              className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-agnes-text mb-2">Resolution</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-agnes-accent"
                />
                <span className="text-agnes-muted self-center">×</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-agnes-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-agnes-text mb-2">
                Duration: ~{durationSeconds}s · {numFrames}f @ {frameRate}fps
              </label>
              <div className="flex gap-2">
                <select
                  value={numFrames}
                  onChange={(e) => setNumFrames(Number(e.target.value))}
                  className="flex-1 bg-agnes-surface border border-agnes-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-agnes-accent"
                >
                  {[81, 121, 161, 201, 241, 321, 401, 441].map(n => (
                    <option key={n} value={n}>{n}f</option>
                  ))}
                </select>
                <select
                  value={frameRate}
                  onChange={(e) => setFrameRate(Number(e.target.value))}
                  className="flex-1 bg-agnes-surface border border-agnes-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-agnes-accent"
                >
                  {[12, 16, 24, 30, 60].map(r => (
                    <option key={r} value={r}>{r}fps</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-agnes-error/10 border border-agnes-error/30 text-sm text-agnes-error">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading || !hasApiKey || !prompt.trim()}
            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-orange-600 text-white font-medium hover:from-rose-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin-slow" />
                Creating Task...
              </>
            ) : (
              <>
                <Film size={18} />
                Generate Video
              </>
            )}
          </button>
        </div>
      </div>

      <div className="w-80 flex flex-col border-l border-agnes-border">
        <div className="px-4 py-3 border-b border-agnes-border">
          <h3 className="font-medium text-white text-sm">Tasks ({allTasks.length})</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {allTasks.length === 0 && !loading && (
            <div className="text-center py-8 opacity-40">
              <VideoIcon size={32} className="mx-auto mb-2" />
              <p className="text-xs text-agnes-muted">Generated video tasks will appear here</p>
            </div>
          )}

          {allTasks.map(task => (
            <div key={task.task_id} className="animate-slide-up bg-agnes-card border border-agnes-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${statusColor(task.status)}`}>
                  {statusLabel(task.status)}
                </span>
                <span className="text-xs text-agnes-muted flex items-center gap-1"><Layers size={10} /> {task.size}</span>
              </div>

              {task.progress > 0 && task.status !== 'completed' && task.status !== 'failed' && (
                <div className="w-full bg-agnes-surface rounded-full h-1.5">
                  <div
                    className="bg-agnes-accent h-1.5 rounded-full transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              )}

              <p className="text-xs text-agnes-muted line-clamp-2">{task.prompt}</p>

              <div className="flex items-center justify-between text-xs text-agnes-muted">
                <span className="flex items-center gap-1"><Clock size={10} /> {task.seconds}s</span>
                <span className="font-mono text-[10px]">{task.task_id.slice(0, 12)}...</span>
              </div>

              {task.status === 'completed' && task.video_url && (
                <div className="space-y-2 pt-1 border-t border-agnes-border">
                  <video
                    src={task.video_url}
                    controls
                    className="w-full rounded-lg"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadVideo(task.video_url || "", `agnes-video-${task.task_id.slice(-8)}.mp4`)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-agnes-surface border border-agnes-border text-xs text-white hover:border-agnes-accent/50 transition-colors"
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(task.video_url || "");
                        setCopiedId(task.task_id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      className="px-3 py-2 rounded-lg bg-agnes-surface border border-agnes-border text-xs text-white hover:border-agnes-accent/50 transition-colors"
                    >
                      {copiedId === task.task_id ? <Check size={14} className="text-agnes-success" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {task.status === 'failed' && task.error && (
                <p className="text-xs text-agnes-error">{task.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
