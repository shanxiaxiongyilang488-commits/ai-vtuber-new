type LocalVideoRequest = {
  prompt: string;
  duration: number;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  mode: string;
};

type LocalVideoResponse = {
  url?: unknown;
  videoUrl?: unknown;
  video_url?: unknown;
  output?: unknown;
  error?: unknown;
  message?: unknown;
};

function normalizeBaseUrl(value: string): string {
  const baseUrl = value.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Local video worker URL is not configured.');
  const parsed = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('Local video worker must use localhost. Use the RunPod backend for a remote worker.');
  }
  return baseUrl;
}

function outputUrl(data: LocalVideoResponse): string {
  const direct = data.url ?? data.videoUrl ?? data.video_url;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (data.output && typeof data.output === 'object') {
    const nested = data.output as LocalVideoResponse;
    const value = nested.url ?? nested.videoUrl ?? nested.video_url;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function generateLocalVideo(baseUrl: string, input: LocalVideoRequest): Promise<{ url: string; raw: LocalVideoResponse }> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      task: 'video.generate',
      model: 'hunyuan-video-1.5',
      ...input,
    }),
    signal: AbortSignal.timeout(2 * 60 * 60_000),
    cache: 'no-store',
  });
  const raw = await response.text();
  let data: LocalVideoResponse = {};
  try {
    data = raw ? JSON.parse(raw) as LocalVideoResponse : {};
  } catch {
    throw new Error(`Local video worker returned invalid JSON: ${raw.slice(0, 1000)}`);
  }
  if (!response.ok) {
    const detail = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : raw;
    throw new Error(`Local video worker HTTP ${response.status}: ${detail.slice(0, 2000)}`);
  }
  const url = outputUrl(data);
  if (!url) throw new Error('Local video worker completed without a video URL.');
  return { url, raw: data };
}

