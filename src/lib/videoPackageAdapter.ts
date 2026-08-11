import type { VideoPackage } from '../core/videoPackageCore';

export type VideoEngine = 'happy-oyster' | 'fal' | 'vidu' | 'sora';

export type EngineVideoRequest = {
  engine: VideoEngine;
  prompt: string;
  duration: number;
  task: 'text-to-video' | 'image-to-video';
  referenceImage: string;
  model?: string;
  storyboard?: Array<{ id: number; duration: number; prompt: string }>;
};

function scenePrompt(videoPackage: VideoPackage, index = 0): string {
  const scene = videoPackage.scenes[index] ?? videoPackage.scenes[0];
  if (!scene) throw new Error('Video Package must contain at least one scene');
  return [
    `Character: ${videoPackage.character_name}.`, scene.visual, scene.action,
    `Camera: ${scene.camera}.`, `Mood: ${scene.mood}.`,
    `Overall camera style: ${videoPackage.camera_style}.`, `Music direction: ${videoPackage.music_mood}.`,
    videoPackage.motion_prompt ? `Motion Prompt: ${videoPackage.motion_prompt}` : '',
    'Natural daily-life acting. Avoid dramatic PV styling, action battle, flashy effects, subtitles, and watermarks.',
  ].filter(Boolean).join(' ');
}

/** Converts a provider-neutral Video Package into one engine-specific request. */
export function toEngineVideoRequest(videoPackage: VideoPackage, engine: VideoEngine): EngineVideoRequest {
  const referenceImage = videoPackage.reference_images[0] ?? '';
  const task = referenceImage ? 'image-to-video' : 'text-to-video';
  const storyboard = videoPackage.scenes.map((scene, index) => ({ id: scene.id, duration: scene.duration, prompt: scenePrompt(videoPackage, index) }));
  if (engine === 'happy-oyster') {
    return { engine, prompt: scenePrompt(videoPackage), duration: Math.min(10, videoPackage.duration), task, referenceImage, storyboard };
  }
  if (engine === 'vidu') {
    return { engine, prompt: scenePrompt(videoPackage), duration: Math.min(10, videoPackage.duration), task, referenceImage, model: 'fal-ai/vidu/q3/text-to-video', storyboard };
  }
  if (engine === 'sora') {
    return {
      engine,
      prompt: scenePrompt(videoPackage),
      duration: Math.min(12, videoPackage.duration),
      task,
      referenceImage,
      model: referenceImage ? 'fal-ai/sora-2/image-to-video' : 'fal-ai/sora-2/text-to-video',
      storyboard,
    };
  }
  return {
    engine,
    prompt: scenePrompt(videoPackage),
    duration: Math.min(10, videoPackage.duration),
    task,
    referenceImage,
    model: referenceImage ? 'fal-ai/kling-video/v3/pro/image-to-video' : 'fal-ai/kling-video/o3/pro/text-to-video',
    storyboard,
  };
}
