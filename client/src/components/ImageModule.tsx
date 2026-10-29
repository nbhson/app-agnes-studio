import { useState, useEffect } from 'react';
import { Download, Loader2, Image as ImageIcon, Copy, Check, RefreshCw, BarChart3, Layers } from 'lucide-react';
import { useSettings } from '../SettingsContext';
import { postJson, parseUrlList } from '../lib/api';
import { loadImageResults, saveImageResults } from '../lib/imageHistory';
import { ModuleHeader, Field, TextArea, TextInput, ErrorBanner, EmptyState, SegmentedControl, StatChip } from './ui';

type SizeOption = '1024x1024' | '1024x768' | '768x1024' | '1920x1080' | '1080x1920';

const SIZES: { value: SizeOption; label: string; desc: string; pixels: number }[] = [
  { value: '1024x1024', label: '1:1', desc: 'Square', pixels: 1048576 },
  { value: '1024x768', label: '4:3', desc: 'Landscape', pixels: 786432 },
  { value: '768x1024', label: '3:4', desc: 'Portrait', pixels: 786432 },
  { value: '1920x1080', label: '16:9', desc: 'Wide', pixels: 2073600 },
  { value: '1080x1920', label: '9:16', desc: 'Vertical', pixels: 2073600 },
];

type Mode = 'text-to-image' | 'image-to-image';

export interface ImageResult {
  url: string;
  b64: string;
  revisedPrompt: string;
  timestamp: number;
  resolution: string;
}

export default function ImageModule() {
  const { hasApiKey } = useSettings();
  const [mode, setMode] = useState<Mode>('text-to-image');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<SizeOption>('1024x1024');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [imageUrls, setImageUrls] = useState<string>('');
  const [loading, setLoading] = useState(false);
  // Round 4: results persist across reloads (URL-based; b64 stays session-only).
  const [results, setResults] = useState<ImageResult[]>(() => loadImageResults());
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [totalImages, setTotalImages] = useState(0);
  const [totalPixels, setTotalPixels] = useState(0);

  // Persist on change — quota handling lives in saveImageResults (trims on
  // QuotaExceededError, gives up silently as last resort).
  useEffect(() => {
    saveImageResults(results);
  }, [results]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading || !hasApiKey) return;

    setLoading(true);
    setError(null);

    const extraBody: Record<string, unknown> = { response_format: 'url' };
    if (mode === 'image-to-image' && imageUrls.trim()) {
      extraBody.image = parseUrlList(imageUrls);
    }
    if (negativePrompt.trim()) {
      // Correct `negative_prompt` field — Round-1 fix #9 (used to be joined
      // into the main prompt, inverting its meaning).
      extraBody.negative_prompt = negativePrompt.trim();
    }

    try {
      const data = await postJson<{ data?: any[] }>('/v1/images/generations', {
        model: 'agnes-image-2.0-flash',
        prompt: prompt.trim(),
        size,
        extra_body: extraBody,
      });
      const sizeInfo = SIZES.find((s) => s.value === size)!;
      const generated: ImageResult[] = (data.data || []).map((item: any) => ({
        url: item.url || '',
        b64: item.b64_json || '',
        revisedPrompt: item.revised_prompt || prompt.trim(),
        timestamp: Date.now(),
        resolution: sizeInfo.label,
      }));
      setResults((prev) => [...prev, ...generated]);
      setTotalImages((prev) => prev + generated.length);
      setTotalPixels((prev) => prev + generated.length * sizeInfo.pixels);
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

  const downloadImage = async (result: ImageResult) => {
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

  const currentSizeInfo = SIZES.find((s) => s.value === size)!;

  return (
    <div className="flex h-full flex-col xl:flex-row">
      <div className="flex-1 flex flex-col min-w-0">
        <ModuleHeader
          icon={ImageIcon}
          gradient="from-cyan-500 to-blue-600"
          title="Image Generation"
          subtitle="agnes-image-2.0-flash"
          stats={
            <>
              <StatChip icon={BarChart3}>{totalImages} images</StatChip>
              <StatChip icon={Layers}>{(totalPixels / 1e6).toFixed(1)}M px</StatChip>
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
                { value: 'text-to-image', label: 'Text to Image' },
                { value: 'image-to-image', label: 'Image to Image' },
              ]}
            />

            {mode === 'image-to-image' && (
              <Field label="Input Image URLs (one per line)">
                <TextArea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  placeholder={'https://example.com/image1.png\nhttps://example.com/image2.png'}
                  rows={3}
                  aria-label="Input image URLs"
                />
              </Field>
            )}

            <Field label="Prompt" htmlFor="img-prompt">
              <TextArea
                id="img-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                rows={4}
              />
            </Field>

            <Field label="Negative Prompt (optional)" htmlFor="img-negative">
              <TextInput
                id="img-negative"
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid in the image..."
              />
            </Field>

            <Field label={`Size · ${currentSizeInfo.label} · ${currentSizeInfo.desc} · ${(currentSizeInfo.pixels / 1e6).toFixed(1)}MP`}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Image size">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={size === s.value}
                    onClick={() => setSize(s.value)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                      size === s.value
                        ? 'border-agnes-accent bg-agnes-accent/20 text-agnes-accentLight'
                        : 'border-agnes-border text-agnes-muted hover:text-agnes-heading hover:border-agnes-accent/50'
                    }`}
                  >
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs opacity-60">{s.desc} · {(s.pixels / 1e6).toFixed(1)}MP</div>
                  </button>
                ))}
              </div>
            </Field>

            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

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

      <div className="w-full xl:w-80 flex flex-col border-t xl:border-t-0 xl:border-l border-agnes-border">
        <div className="px-4 py-3 border-b border-agnes-border flex items-center justify-between">
          <h3 className="font-medium text-agnes-heading text-sm">Results</h3>
          <span className="text-xs text-agnes-muted">{results.length} images</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {results.length === 0 && !loading && (
            <EmptyState icon={ImageIcon}>
              <p className="text-xs text-agnes-muted">Generated images will appear here</p>
            </EmptyState>
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
                    aria-label="Download image"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => copyUrl(r.url || `data:image/png;base64,${r.b64}`)}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                    title="Copy URL"
                    aria-label="Copy image URL"
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

