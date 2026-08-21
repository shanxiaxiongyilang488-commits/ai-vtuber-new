export interface CameraSettings { shot: 'medium_closeup' | 'medium' | 'closeup'; movement: 'none' | 'subtle_push_in'; }
export interface MotionSettings { target: 'breathing' | 'hair' | 'ears' | 'body' | 'hand'; action: string; timing?: string; intensity?: number; }
export interface LightingSettings { type: 'warm_soft' | 'soft_daylight' | 'cool_soft'; intensity: number; }

export interface AnimationBlueprint {
  title: string;
  duration: number;
  loop: boolean;
  mood: string;
  camera: CameraSettings;
  motions: MotionSettings[];
  lighting: LightingSettings;
  keywords: string[];
}

const TRIGGERS = ['アニメ', '動画', '動き', '5秒', 'ループ', 'motion', 'アニメ化', 'ショートアニメ'];
const STORY_ANIMATION_TRIGGERS = ['起動', '朝', '続き', 'シーン', 'ストーリー', '挨拶', 'boot', 'wake', 'morning', 'scene', 'story', 'greeting'];

export type AnimationRequestKind = 'idle' | 'story' | null;

/** Story terms always win over the short idle-motion path. */
export function animationRequestKind(text: string): AnimationRequestKind {
  const lower = text.toLowerCase();
  if (STORY_ANIMATION_TRIGGERS.some((trigger) => lower.includes(trigger))) return 'story';
  if (TRIGGERS.some((trigger) => lower.includes(trigger.toLowerCase()))) return 'idle';
  return null;
}

export function isAnimationRequest(text: string): boolean {
  return animationRequestKind(text) !== null;
}

/** Creates a short looping idle-animation blueprint. This function never calls a video API. */
export function createAnimationBlueprint(text: string, characterName = 'キャラクター'): AnimationBlueprint {
  const lower = text.toLowerCase();
  const sleeping = /(眠|スリープ|寝)/u.test(text);
  const waving = /(手を振|手振|wave)/u.test(lower);
  const thinking = /(考え込|考える|thinking)/u.test(lower);
  const durationMatch = text.match(/([1-9]|10)\s*秒/u);
  const duration = Math.min(10, Math.max(1, Number(durationMatch?.[1] ?? 5)));
  const loop = !waving && !/(一回|一度|non.?loop)/iu.test(text);
  const mood = sleeping ? 'peaceful' : waving ? 'cheerful' : thinking ? 'thoughtful' : 'gentle';
  const motions: MotionSettings[] = [
    { target: 'breathing', action: 'cycle', timing: '3.8s', intensity: 0.08 },
    { target: 'hair', action: 'subtle_sway', intensity: 0.04 },
  ];
  if (sleeping) motions.push({ target: 'ears', action: 'twitch', timing: '1.0s, 4.0s', intensity: 0.08 });
  if (waving) motions.push({ target: 'body', action: 'turn_toward_camera', timing: '0.8s' }, { target: 'hand', action: 'small_wave', timing: '1.2s-3.8s', intensity: 0.25 });
  if (thinking) motions.push({ target: 'body', action: 'gentle_thinking_tilt', timing: '1.0s', intensity: 0.1 });
  return {
    title: sleeping ? `${characterName}のスリープモード` : waving ? `${characterName}が振り向いて手を振る` : thinking ? `${characterName}が考え込む` : `${characterName}の短いアニメ`,
    duration, loop, mood,
    camera: { shot: sleeping ? 'medium_closeup' : 'medium', movement: 'none' },
    motions,
    lighting: { type: sleeping ? 'warm_soft' : 'soft_daylight', intensity: 0.7 },
    keywords: [mood, ...(sleeping ? ['sleep', 'gentle', 'protected'] : waving ? ['wave', 'friendly', 'gentle'] : thinking ? ['thinking', 'quiet', 'gentle'] : ['subtle', 'character'])],
  };
}

export function animationBlueprintToYaml(blueprint: AnimationBlueprint): string {
  const motion = blueprint.motions.map((entry) => [
    `  - target: ${entry.target}`,
    `    action: ${entry.action}`,
    ...(entry.timing ? [`    timing: ${entry.timing}`] : []),
    ...(entry.intensity !== undefined ? [`    intensity: ${entry.intensity}`] : []),
  ].join('\n')).join('\n');
  return [
    `title: ${blueprint.title}`,
    `duration: ${blueprint.duration}s`,
    `loop: ${blueprint.loop}`,
    'camera:', `  shot: ${blueprint.camera.shot}`, `  movement: ${blueprint.camera.movement}`,
    'motion:', motion,
    'lighting:', `  type: ${blueprint.lighting.type}`, `  intensity: ${blueprint.lighting.intensity}`,
    `mood: ${blueprint.mood}`,
    'keywords:', ...blueprint.keywords.map((keyword) => `  - ${keyword}`),
  ].join('\n');
}
