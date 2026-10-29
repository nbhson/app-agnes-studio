import { useEffect, useRef, useState, useCallback } from 'react';
import { Download, Video as VideoIcon, Copy, Check, Film, Loader2, BarChart3, Layers, Clock, AlertTriangle } from 'lucide-react';
import { useSettings } from '../SettingsContext';
import { postJson, getJson, parseUrlList } from '../lib/api';
import { ModuleHeader, Field, TextArea, TextInput, ErrorBanner, EmptyState, SegmentedControl, StatChip } from './ui';

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

const POLL_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_POLL_ERRORS = 8;

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
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  // Polling lifecycle (R2-4): pending timeouts + in-flight fetches are cleaned
  // up on unmount, and consecutive network failures cap out instead of
  // scheduling retries forever against a dead server.
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pollAborts = useRef<Map<string, AbortController>>(new Map());
  const pollErrors = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pollTimers.current.forEach((t) => clearTimeout(t));
      pollTimers.current.clear();
      pollAborts.current.forEach((c) => c.abort());
      pollAborts.current.clear();
    };
  }, []);

  const patchTask = useCallback((taskId: string, patch: Partial<VideoItem>) => {
    setTasks((prev) => {
      const next = new Map(prev);
      const existing = prev.get(taskId);
      if (existing) next.set(taskId, { ...existing, ...patch });
      return next;
    });
  }, []);

  /** Give up on a task after too many consecutive poll failures. */
  const failTask = useCallback((taskId: string, message: string) => {
    setTasks((prev) => {
      const next = new Map(prev);
      const existing = prev.get(taskId);
      if (existing && existing.status !== 'completed' && existing.status !== 'failed') {
        next.set(taskId, { ...existing, status: 'failed', error: message });
      }
      return next;
    });
  }, []);

  const schedulePoll = useCallback((videoId: string, taskId: string, delayMs: number) => {
    if (!mountedRef.current) return;
    const ref = setTimeout(() => void pollVideo(videoId, taskId), delayMs);
    pollTimers.current.set(taskId, ref);
  }, []);

  const pollVideo = useCallback(async (videoId: string, taskId: string) => {
    if (!mountedRef.current) return;
    const controller = new AbortController();
    pollAborts.current.set(taskId, controller);
    let terminal = false;
    try {
      const data = await getJson<Partial<VideoItem>>(
        `/agnesapi?video_id=${encodeURIComponent(videoId)}`,
        controller.signal
      );
      if (!mountedRef.current) return;
      pollErrors.current.delete(taskId);
      patchTask(taskId, data);
      if (data.status === 'completed' || data.status === 'failed') {
        if (data.status === 'completed') setCompletedTasks((p) => p + 1);
        terminal = true; // terminal — stop polling
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      const count = (pollErrors.current.get(taskId) ?? 0) + 1;
      pollErrors.current.set(taskId, count);
      if (count >= MAX_CONSECUTIVE_POLL_ERRORS) {
        failTask(taskId, 'Lost connection while polling task status');
        terminal = true;
      }
    } finally {
      pollAborts.current.delete(taskId);
    }
    if (!terminal) schedulePoll(videoId, taskId, POLL_INTERVAL_MS);
  }, [patchTask, failTask, schedulePoll]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading || !hasApiKey) return;

    setLoading(true);
    setError(null);

    try {
      const data = await postJson<any>('/v1/videos', {
        model: 'agnes-video-v2.0',
        prompt: prompt.trim(),
        width,
        height,
        num_frames: numFrames,
        frame_rate: frameRate,
        ...(mode === 'image-to-video' && imageUrls.trim() ? { image: parseUrlList(imageUrls)[0] } : {}),
        ...(mode === 'keyframes' && imageUrls.trim()
          ? { extra_body: { image: parseUrlList(imageUrls), mode: 'keyframes' } }
          : {}),
        ...(negativePrompt.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
      });

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

      setTasks((prev) => {
        const next = new Map(prev);
        next.set(task.task_id, task);
        return next;
      });
      setTotalTasks((prev) => prev + 1);
      if (data.status === 'completed') {
        setCompletedTasks((prev) => prev + 1);
        setTotalDuration((prev) => prev + parseFloat(data.seconds || '0'));
      }
      if (data.status !== 'completed' && data.status !== 'failed') {
        schedulePoll(data.video_id, data.task_id, POLL_INTERVAL_MS);
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
    <div className="flex h-full flex-col xl:flex-row">
      <div className="flex-1 flex flex-col min-w-0">
        <ModuleHeader
          icon={VideoIcon}
          gradient="from-rose-500 to-orange-600"
          title="Video Generation"
          subtitle="agnes-video-v2.0"
          stats={
            <>
              <StatChip icon={BarChart3}>{totalTasks} tasks</StatChip>
              <StatChip icon={Check}><span className="text-agnes-success">{completedTasks} done</span></StatChip>
              <StatChip icon={Clock}>{totalDuration.toFixed(0)}s total</StatChip>
            </>
          }
        />

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <div className="space-y-4 max-w-2xl">
            <SegmentedControl
              label="Generation mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'text-to-video', label: 'Text to Video' },
                { value: 'image-to-video', label: 'Image to Video' },
                { value: 'keyframes', label: 'Keyframes' },
              ]}
            />

            {(mode === 'image-to-video' || mode === 'keyframes') && (
              <Field label={mode === 'keyframes' ? 'Keyframe URLs (one per line)' : 'Input Image URL'}>
                <TextArea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  placeholder={mode === 'keyframes'
                    ? 'https://example.com/kf1.png\nhttps://example.com/kf2.png'
                    : 'https://example.com/image.png'}
                  rows={3}
                  aria-label={mode === 'keyframes' ? 'Keyframe URLs' : 'Input image URL'}
                />
              </Field>
            )}

            <Field label="Prompt" htmlFor="video-prompt">
              <TextArea
                id="video-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the video you want to generate..."
                rows={4}
              />
            </Field>

            <Field label="Negative Prompt (optional)" htmlFor="video-negative">
              <TextInput
                id="video-negative"
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid..."
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Resolution">
                <div className="flex gap-2">
                  <TextInput
                    type="number"
                    aria-label="Video width"
                    value={width}
                    min={256}
                    max={3840}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="!py-2"
                  />
                  <span className="text-agnes-muted self-center" aria-hidden="true">×</span>
                  <TextInput
                    type="number"
                    aria-label="Video height"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="!py-2"
                  />
                </div>
              </Field>
              <Field label={`Duration: ~${durationSeconds}s · ${numFrames}f @ ${frameRate}fps`}>
                <div className="flex gap-2">
                  <select
                    value={numFrames}
                    onChange={(e) => setNumFrames(Number(e.target.value))}
                    aria-label="Number of frames"
                    className="flex-1 bg-agnes-surface border border-agnes-border rounded-lg px-3 py-2 text-sm text-agnes-text focus:outline-none focus:border-agnes-accent transition-colors"
                  >
                    {[81, 121, 161, 201, 241, 321, 401, 441].map((n) => (
                      <option key={n} value={n}>{n}f</option>
                    ))}
                  </select>
                  <select
                    value={frameRate}
                    onChange={(e) => setFrameRate(Number(e.target.value))}
                    aria-label="Frame rate"
                    className="flex-1 bg-agnes-surface border border-agnes-border rounded-lg px-3 py-2 text-sm text-agnes-text focus:outline-none focus:border-agnes-accent transition-colors"
                  >
                    {[12, 16, 24, 30, 60].map((r) => (
                      <option key={r} value={r}>{r}fps</option>
                    ))}
                  </select>
                </div>
              </Field>
            </div>

            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

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
      </div>

      <div className="w-full xl:w-80 flex flex-col border-t xl:border-t-0 xl:border-l border-agnes-border">
        <div className="px-4 py-3 border-b border-agnes-border">
          <h3 className="font-medium text-agnes-heading text-sm">Tasks ({allTasks.length})</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {allTasks.length === 0 && !loading && (
            <EmptyState icon={VideoIcon}>
              <p className="text-xs text-agnes-muted">Generated video tasks will appear here</p>
            </EmptyState>
          )}

          {allTasks.map((task) => (
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
                      onClick={() => downloadVideo(task.video_url || '', `agnes-video-${task.task_id.slice(-8)}.mp4`)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-agnes-surface border border-agnes-border text-xs text-agnes-text hover:border-agnes-accent/50 transition-colors"
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(task.video_url || '');
                        setCopiedId(task.task_id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      aria-label="Copy video URL"
                      className="px-3 py-2 rounded-lg bg-agnes-surface border border-agnes-border text-xs text-agnes-text hover:border-agnes-accent/50 transition-colors"
                    >
                      {copiedId === task.task_id ? <Check size={14} className="text-agnes-success" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {task.status === 'failed' && task.error && (
                <p className="text-xs text-agnes-error flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {task.error}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



