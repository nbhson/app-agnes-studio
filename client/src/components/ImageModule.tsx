import { useState } from 'react';
import { Download, Loader2, Image as ImageIcon, Copy, Check, RefreshCw, BarChart3, Layers } from 'lucide-react';
import { useSettings } from '../SettingsContext';

type SizeOption = '1024x1024' | '1024x768' | '768x1024' | '1920x1080' | '1080x1920';

const SIZES: { value: SizeOption; label: string; desc: string; pixels: number }[] = [
  { value: '1024x1024', label: '1:1', desc: 'Square', pixels: 1048576 },
  { value: '1024x768', label: '4:3', desc: 'Landscape', pixels: 786432 },
  { value: '768x1024', label: '3:4', desc: 'Portrait', pixels: 786432 },
  { value: '1920x1080', label: '16:9', desc: 'Wide', pixels: 2073600 },
  { value: '1080x1920', label: '9:16', desc: 'Vertical', pixels: 2073600 },
];

type Mode = 'text-to-image' | 'image-to-image';

export default function ImageModule() {
  const { hasApiKey } = useSettings();
  const [mode, setMode] = useState<Mode>('text-to-image');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<SizeOption>('1024x1024');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [imageUrls, setImageUrls] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ url: string; b64: string; revisedPrompt: string; timestamp: number; resolution: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [totalImages, setTotalImages] = useState(0);
  const [totalPixels, setTotalPixels] = useState(0);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading || !hasApiKey) return;

    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      model: 'agnes-image-2.0-flash',
      prompt: prompt.trim(),
      size,
      extra_body: {
        response_format: 'url',
      },
    };

    if (mode === 'image-to-image' && imageUrls.trim()) {
      (body.extra_body as Record<string, unknown>).image = imageUrls.trim().split('\n').map((u: string) => u.trim()).filter(Boolean);
    }

    if (negativePrompt.trim()) {
      body.prompt = `${negativePrompt.trim()}\n${prompt.trim()}`;
    }

    try {
      const response = await fetch('http://localhost:3001/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const sizeInfo = SIZES.find(s => s.value === size)!;
      const generated = (data.data || []).map((item: any) => ({
        url: item.url || '',
        b64: item.b64_json || '',
        revisedPrompt: item.revised_prompt || prompt.trim(),
        timestamp: Date.now(),
        resolution: sizeInfo.label,
      }));
      setResults(prev => [...prev, ...generated]);
      setTotalImages(prev => prev + generated.length);
      setTotalPixels(prev => prev + generated.length * sizeInfo.pixels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const downloadImage = async (result: typeof results[0]) => {
    try {
      const imgUrl = result.url || `data:image/png;base64,${result.b64}`;
      const resp = await fetch(imgUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agnes-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const currentSizeInfo = SIZES.find(s => s.value === size)!;

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-agnes-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <ImageIcon size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Image Generation</h2>
              <p className="text-xs text-agnes-muted">agnes-image-2.0-flash</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-agnes-muted">
            <span className="flex items-center gap-1"><BarChart3 size={12} /> {totalImages} images</span>
            <span className="flex items-center gap-1"><Layers size={12} /> {(totalPixels / 1e6).toFixed(1)}M px</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="flex gap-2 p-1 bg-agnes-surface rounded-lg w-fit">
              {(['text-to-image', 'image-to-image'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mode === m ? 'bg-agnes-card text-white shadow-sm' : 'text-agnes-muted hover:text-white'
                  }`}
                >
                  {m === 'text-to-image' ? 'Text to Image' : 'Image to Image'}
                </button>
              ))}
            </div>

            {mode === 'image-to-image' && (
              <div>
                <label className="block text-sm font-medium text-agnes-text mb-2">Input Image URLs (one per line)</label>
                <textarea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  placeholder="https://example.com/image1.png
https://example.com/image2.png"
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
                placeholder="Describe the image you want to generate..."
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
                placeholder="What to avoid in the image..."
                className="w-full bg-agnes-surface border border-agnes-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-agnes-muted/50 focus:outline-none focus:border-agnes-accent focus:ring-1 focus:ring-agnes-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-agnes-text mb-2">
                Size · {currentSizeInfo.label} · {currentSizeInfo.desc} · {(currentSizeInfo.pixels / 1e6).toFixed(1)}MP
              </label>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setSize(s.value)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                      size === s.value
                        ? 'border-agnes-accent bg-agnes-accent/20 text-agnes-accentLight'
                        : 'border-agnes-border text-agnes-muted hover:text-white hover:border-agnes-accent/50'
                    }`}
                  >
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs opacity-60">{s.desc} · {(s.pixels / 1e6).toFixed(1)}MP</div>
                  </button>
                ))}
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
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-agnes-accent to-purple-600 text-white font-medium hover:from-agnes-accentLight hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin-slow" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw size={18} />
                  Generate Image
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="w-80 flex flex-col border-l border-agnes-border">
        <div className="px-4 py-3 border-b border-agnes-border flex items-center justify-between">
          <h3 className="font-medium text-white text-sm">Results</h3>
          <span className="text-xs text-agnes-muted">{results.length} images</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {results.length === 0 && !loading && (
            <div className="text-center py-8 opacity-40">
              <ImageIcon size={32} className="mx-auto mb-2" />
              <p className="text-xs text-agnes-muted">Generated images will appear here</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={32} className="animate-spin-slow text-agnes-accent mb-3" />
              <p className="text-sm text-agnes-muted">Generating image...</p>
              <p className="text-xs text-agnes-muted/60 mt-1">This may take a few seconds</p>
            </div>
          )}

          {results.map((r, i) => (
            <div key={`${r.timestamp}-${i}`} className="animate-slide-up space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-agnes-border bg-agnes-surface">
                {(r.url || r.b64) ? (
                  <img
                    src={r.url || `data:image/png;base64,${r.b64}`}
                    alt={r.revisedPrompt}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center">
                    <ImageIcon size={32} className="text-agnes-muted" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                  <button
                    onClick={() => downloadImage(r)}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => copyUrl(r.url || `data:image/png;base64,${r.b64}`)}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                    title="Copy URL"
                  >
                    {copiedUrl === r.url ? <Check size={16} className="text-agnes-success" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-agnes-muted line-clamp-1 flex-1">{r.revisedPrompt}</p>
                <span className="text-[10px] text-agnes-muted/60 ml-2 shrink-0">{r.resolution}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
