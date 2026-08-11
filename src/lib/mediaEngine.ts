import type { MediaInfo } from '$lib/types';
import { createStoryBlueprint } from '../core/storyBlueprintCore';
import { createVideoPackage } from '../core/videoPackageCore';
import { videoGenerationService } from '$lib/video/VideoGenerationService';

export type MediaEngineAction = 'manga' | 'anime' | 'voice' | 'bgm';

export type MediaEngineInput = {
  text: string;
  title?: string;
  source: 'memorycore' | 'personality-lab';
  speaker?: string;
};

const nowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read generated audio'));
    reader.readAsDataURL(blob);
  });
}

function storyboardText(text: string): string {
  return [
    'Storyboard',
    '',
    '1. Establish the character, mood, and location.',
    '2. Create one readable key pose with clear silhouette.',
    '3. Move from the key pose into a short animation beat.',
    '',
    text.trim(),
  ].join('\n');
}

function mediaTitle(input: MediaEngineInput, suffix: string): string {
  return `${input.title?.trim() || input.speaker || 'Chat'} ${suffix}`.trim();
}

export async function createStoryboard(input: MediaEngineInput): Promise<MediaInfo> {
  const prompt = storyboardText(input.text);
  return {
    type: 'storyboard',
    title: mediaTitle(input, 'Storyboard'),
    prompt,
    summary: 'Storyboard -> KeyFrame -> Animation pipeline plan.',
    source: input.source,
    stage: 'storyboard',
    metadata: {
      id: `storyboard-${nowId()}`,
      sourceText: input.text,
    },
  };
}

export async function createKeyFrame(input: MediaEngineInput, storyboard: MediaInfo): Promise<MediaInfo> {
  const prompt = [
    storyboard.prompt || input.text,
    '',
    'Create a single anime key frame. No manga panels, no speech bubbles, no captions.',
    'Cinematic anime still, clean character acting, strong pose, production key visual.',
  ].join('\n');
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      size: '1024x1024',
      renderMode: 'illustration',
      requestId: `media-keyframe-${nowId()}`,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? 'KeyFrame generation failed');
  const url = String(data?.images?.[0]?.url ?? '');
  if (!url) throw new Error('KeyFrame generation returned no image');
  return {
    type: 'image',
    title: mediaTitle(input, 'KeyFrame'),
    url,
    prompt,
    source: input.source,
    stage: 'keyframe',
    metadata: {
      id: `keyframe-${nowId()}`,
      storyboardId: storyboard.metadata?.id,
    },
  };
}

export async function createAnimation(input: MediaEngineInput, keyFrame: MediaInfo): Promise<MediaInfo> {
  const prompt = [
    input.text.trim(),
    '',
    'Animate this as a short anime cut. Smooth camera motion, subtle character acting, clean timing.',
    'No manga page layout, no speech bubbles, no subtitles.',
  ].join('\n');
  const referenceImage = typeof keyFrame.url === 'string' ? keyFrame.url : '';
  const blueprint = createStoryBlueprint(input.text, input.speaker || input.title || 'Character');
  const videoPackage = createVideoPackage(blueprint, input.speaker || input.title || 'Character', referenceImage ? [referenceImage] : []);
  const generated = await videoGenerationService.generate(videoPackage);
  const url = generated.url;
  return {
    type: 'video',
    title: mediaTitle(input, 'Animation'),
    url,
    prompt,
    thumbnailUrl: keyFrame.url,
    source: input.source,
    stage: 'animation',
    metadata: {
      id: `animation-${nowId()}`,
      keyFrameId: keyFrame.metadata?.id,
      model: generated.model,
    },
  };
}

export async function runMediaEngineAction(action: MediaEngineAction, input: MediaEngineInput): Promise<MediaInfo[]> {
  if (!input.text.trim()) throw new Error('Media Engine input text is required');

  if (action === 'voice') {
    const response = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: input.text, provider: 'irodori-tts', speaker: input.speaker }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error ?? data?.message ?? 'Voice generation failed');
    }
    const blob = await response.blob();
    const audioUrl = await blobToDataUrl(blob);
    return [{
      type: 'audio',
      title: mediaTitle(input, 'Voice'),
      url: audioUrl,
      prompt: input.text,
      source: input.source,
      stage: 'voice',
      metadata: { id: `voice-${nowId()}` },
    }];
  }

  if (action === 'bgm') {
    return [{
      type: 'audio',
      title: mediaTitle(input, 'BGM Plan'),
      prompt: input.text,
      summary: 'BGM design card. Save it to PROJECT when you want to keep this direction.',
      source: input.source,
      stage: 'bgm',
      metadata: {
        id: `bgm-${nowId()}`,
        content: [
          'BGM direction:',
          '- short loopable cue',
          '- match the emotional tone of the chat',
          '- avoid vocals unless explicitly requested',
          '',
          input.text,
        ].join('\n'),
      },
    }];
  }

  const storyboard = await createStoryboard(input);
  const keyFrame = await createKeyFrame(input, storyboard);
  if (action === 'manga') return [storyboard, keyFrame];
  const animation = await createAnimation(input, keyFrame);
  return [storyboard, keyFrame, animation];
}

export async function saveMediaToProject(media: MediaInfo): Promise<void> {
  const response = await fetch('/api/project/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ media }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? 'PROJECT save failed');
}
