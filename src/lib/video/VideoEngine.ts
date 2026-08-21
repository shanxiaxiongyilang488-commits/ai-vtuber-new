import type { VideoPackage } from '../../core/videoPackageCore';

export type GeneratedVideo = {
  url: string;
  engine: string;
  model?: string;
  prompt?: string;
};

export interface VideoEngine {
  generate(packageData: VideoPackage): Promise<GeneratedVideo>;
}

export type VideoEngineId = 'kling-fal' | 'veo-fal' | 'seedance-fal' | 'sora-fal' | 'vidu' | 'happy-oyster';

export const VIDEO_ENGINE_OPTIONS: Array<{ id: VideoEngineId; label: string; model?: string }> = [
  { id: 'kling-fal', label: 'Kling (FAL)' },
  { id: 'veo-fal', label: 'Veo (FAL)', model: 'fal-ai/veo-3.1/text-to-video' },
  { id: 'seedance-fal', label: 'Seedance (FAL)', model: 'bytedance/seedance-2.0/text-to-video' },
  { id: 'sora-fal', label: 'Sora 2 (FAL)' },
  { id: 'vidu', label: 'Vidu' },
  { id: 'happy-oyster', label: 'HappyOyster' },
];

/** Local deterministic engine used to verify the entire chat-video UI without API credentials. */
export class MockVideoEngine implements VideoEngine {
  async generate(_packageData: VideoPackage): Promise<GeneratedVideo> {
    return { url: '/mock/sample.mp4', engine: 'mock', model: 'local-mock-mp4' };
  }
}

/** Browser client for the server-side FAL adapter. API keys never leave the server. */
export class FalVideoEngine implements VideoEngine {
  constructor(private readonly id: VideoEngineId = 'kling-fal', private readonly model?: string) {}
  async generate(packageData: VideoPackage): Promise<GeneratedVideo> {
    const response = await fetch('/api/video-package/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engine: this.id === 'sora-fal' ? 'sora' : 'fal', model: this.model, videoPackage: packageData }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.url) throw new Error(data?.message ?? data?.error ?? 'FAL video generation failed');
    return { url: String(data.url), engine: this.id, model: data.model, prompt: data.engineRequest?.prompt };
  }
}

/** Placeholder adapters keep external providers selectable without silently routing them to FAL. */
export class ExternalVideoEngine implements VideoEngine {
  constructor(private readonly id: Extract<VideoEngineId, 'vidu' | 'happy-oyster'>) {}
  async generate(_packageData: VideoPackage): Promise<GeneratedVideo> {
    throw new Error(`${this.id} API connector is not configured yet`);
  }
}
