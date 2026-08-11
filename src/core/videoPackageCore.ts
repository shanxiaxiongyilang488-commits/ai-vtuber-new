import type { StoryBlueprint } from './storyBlueprintCore';
import type { PanelBounds, StoryScene } from './sceneTimeline';
import type { StoryCard, StoryCardCut } from '$lib/storycard/storycard';
import { motionPromptFromTimeline } from '$lib/animationSheetMotionPrompt';

export interface VideoPackage {
  version: 1;
  /** UI-facing project identity. Omitted by legacy packages and inferred on read. */
  project_type?: 'animation_sheet';
  /**
   * The character this Animation Project belongs to (video protagonist).
   * Independent of the conversation character; empty when unresolved.
   */
  owner_character_id?: string;
  animation_sheet_count?: number;
	/** Detected physical panel borders. Legacy projects may omit this. */
	panelBounds?: PanelBounds[];
  source_storycard_id: string;
  title: string;
  duration: number;
  character_name: string;
  reference_images: string[];
  story_summary: string;
	/** The Scene Timeline — single source of truth for all prompt generation. */
	scenes: StoryScene[];
  dialogues: string[];
  camera_style: string;
  music_mood: string;
  motion_prompt: string;
  export_targets: ('HappyOyster' | 'FAL' | 'Vidu' | 'Seedance')[];
}

/** Legacy saved packages duplicated the Scene Timeline into a scene_timeline field. */
type LegacyVideoPackage = VideoPackage & { scene_timeline?: StoryScene[] };

/**
 * Read-boundary normalizer: folds the legacy scene_timeline duplicate back into
 * scenes and drops it, so every consumer reads exactly one Scene Timeline.
 * Persisted data is never rewritten; normalization happens on read only.
 */
export function normalizeVideoPackage(videoPackage: VideoPackage): VideoPackage {
  const { scene_timeline, ...rest } = videoPackage as LegacyVideoPackage;
  return {
    ...rest,
    scenes: Array.isArray(scene_timeline) && scene_timeline.length > 0 ? scene_timeline : rest.scenes,
  };
}

/** A complete hand-off package for multi-cut video generators. */
export function createVideoPackage(blueprint: StoryBlueprint, characterName: string, referenceImages: string[] = []): VideoPackage {
  return {
    version: 1,
    source_storycard_id: '',
    title: blueprint.title,
    duration: blueprint.duration,
    character_name: characterName,
    reference_images: referenceImages,
    story_summary: blueprint.story_summary,
    scenes: blueprint.scenes,
    dialogues: blueprint.dialogues,
    camera_style: blueprint.camera,
    music_mood: blueprint.music_mood,
    motion_prompt: '',
    export_targets: ['HappyOyster', 'FAL', 'Vidu'],
  };
}

function timecodeSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/u.exec(value.trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2]);
}

function cutDuration(cut: StoryCardCut, fallback: number): number {
  if (typeof cut.duration === 'number' && Number.isFinite(cut.duration) && cut.duration > 0) return cut.duration;
  const start = timecodeSeconds(cut.start ?? cut.time?.split(/\s*[-~〜]\s*/u)[0]);
  const end = timecodeSeconds(cut.end ?? cut.time?.split(/\s*[-~〜]\s*/u)[1]);
  return start !== null && end !== null && end > start ? end - start : fallback;
}

/** Explicit StoryCard -> Video Package boundary. It never invokes the legacy 30-60 second template. */
export function createVideoPackageFromStoryCard(
  storyCard: StoryCard,
  characterName: string,
  referenceImages: string[] = [],
  motionPrompt = '',
): VideoPackage {
  const duration = Math.max(1, Number(storyCard.duration) || 1);
  const fallbackCutDuration = duration / Math.max(1, storyCard.cuts.length);
  const rawDurations = storyCard.cuts.map((cut) => cutDuration(cut, fallbackCutDuration));
  const rawTotal = rawDurations.reduce((sum, value) => sum + value, 0) || duration;
  const scale = duration / rawTotal;
  const scenes = storyCard.cuts.map((cut, index) => ({
    id: index + 1,
	sceneIndex: index,
	title: cut.title || `SCENE${String(index + 1).padStart(2, '0')}`,
	timecode: cut.time || [cut.start, cut.end].filter(Boolean).join('-'),
	thumbnailUrl: referenceImages[0] || storyCard.references.find((reference) => reference.kind === 'image')?.url || '',
	sourcePanel: `PANEL${String(index + 1).padStart(2, '0')}`,
	sourceSheetId: referenceImages[0] || storyCard.references.find((reference) => reference.kind === 'image')?.id || '',
    duration: Number((rawDurations[index] * scale).toFixed(3)),
    visual: [
      cut.description || cut.visual || cut.summary || cut.title || `CUT${String(index + 1).padStart(2, '0')}`,
      (cut.requiredUnits ?? cut.characters ?? []).length > 0
        ? `Required units: ${(cut.requiredUnits ?? cut.characters ?? []).join(', ')}`
        : '',
    ].filter(Boolean).join('\n'),
    action: cut.action || cut.description || cut.summary,
    dialogue: cut.dialogue || '',
    camera: cut.camera || storyCard.style || 'preserve StoryCard framing',
    mood: cut.emotion || storyCard.emotion || storyCard.theme || 'natural',
	tags: [...new Set([...(cut.requiredUnits ?? []), ...(cut.references ?? [])].filter(Boolean))],
  }));
  if (scenes.length > 0) {
    const previousTotal = scenes.slice(0, -1).reduce((sum, scene) => sum + scene.duration, 0);
    scenes[scenes.length - 1].duration = Number(Math.max(0.001, duration - previousTotal).toFixed(3));
  }
  return {
    version: 1,
	project_type: 'animation_sheet',
	animation_sheet_count: [...new Set(referenceImages.filter(Boolean))].length,
    source_storycard_id: storyCard.id,
    title: storyCard.title,
    duration,
    character_name: characterName || storyCard.characters.map((item) => item.name).join(', ') || 'Character',
    reference_images: [...new Set(referenceImages.filter(Boolean))].slice(0, 10),
    story_summary: storyCard.summary,
    scenes,
    dialogues: scenes.map((scene) => scene.dialogue).filter(Boolean),
    camera_style: storyCard.style || storyCard.cuts.map((cut) => cut.camera).filter(Boolean).join(' / ') || 'follow each scene camera instruction',
    music_mood: storyCard.emotion || storyCard.theme || 'no music requirement',
    motion_prompt: motionPrompt.trim(),
    export_targets: ['Seedance'],
  };
}

/**
 * The sole provider prompt projection used by direct video generation.
 * The scene content comes exclusively from the Motion Prompt, which is always
 * regenerated from the Scene Timeline — scenes are never rendered twice.
 */
export function videoPackagePrompt(videoPackage: VideoPackage): string {
  const motionPrompt = videoPackage.motion_prompt.trim() || motionPromptFromTimeline(videoPackage.scenes);
  return [
    `Generate exactly ${videoPackage.duration} seconds of video.`,
	'Preserve content in this strict order: required story events, scene/location/time/state transitions, then character actions and expressions. Never replace a required story beat with a repeated smile, glance, turn, or pose.',
    `Title: ${videoPackage.title}`,
    videoPackage.character_name.trim() ? `Character: ${videoPackage.character_name}` : '',
    `Summary: ${videoPackage.story_summary}`,
    motionPrompt ? `MOTION PROMPT\n${motionPrompt}` : '',
  ].filter(Boolean).join('\n\n');
}

export function videoPackageToYaml(videoPackage: VideoPackage): string {
  return [
    `title: ${videoPackage.title}`,
    `version: ${videoPackage.version}`,
	`project_type: ${videoPackage.project_type ?? 'animation_sheet'}`,
	`owner_character_id: ${JSON.stringify(videoPackage.owner_character_id ?? '')}`,
	`animation_sheet_count: ${videoPackage.animation_sheet_count ?? videoPackage.reference_images.length}`,
    `source_storycard_id: ${JSON.stringify(videoPackage.source_storycard_id)}`,
    `duration: ${videoPackage.duration}s`,
    `character_name: ${JSON.stringify(videoPackage.character_name)}`,
    'reference_images:', ...videoPackage.reference_images.map((image) => `  - ${JSON.stringify(image)}`),
	'panel_bounds:', ...(videoPackage.panelBounds ?? []).flatMap((bounds) => [
		`  - panelId: ${JSON.stringify(bounds.panelId ?? '')}`,
		`    sourceSheetIndex: ${bounds.sourceSheetIndex ?? 0}`,
		`    x: ${bounds.x}`,
		`    y: ${bounds.y}`,
		`    width: ${bounds.width}`,
		`    height: ${bounds.height}`,
	]),
    `story_summary: ${JSON.stringify(videoPackage.story_summary)}`,
    'scenes:',
    ...videoPackage.scenes.flatMap((scene) => [
      `  - id: ${scene.id}`,
	  `    eventType: ${JSON.stringify(scene.eventType ?? '')}`,
	  `    requiredEvent: ${scene.requiredEvent === true}`,
	  `    storyEvent: ${JSON.stringify(scene.storyEvent ?? '')}`,
	  `    sceneTransition: ${JSON.stringify(scene.sceneTransition ?? '')}`,
	  `    sourcePanel: ${JSON.stringify(scene.sourcePanel ?? '')}`,
	  `    sourceSheetId: ${JSON.stringify(scene.sourceSheetId ?? '')}`,
	  ...(scene.panelBounds ? [
		`    panelBounds:`,
		`      panelId: ${JSON.stringify(scene.panelBounds.panelId ?? scene.sourcePanel ?? '')}`,
		`      sourceSheetIndex: ${scene.panelBounds.sourceSheetIndex ?? 0}`,
		`      x: ${scene.panelBounds.x}`,
		`      y: ${scene.panelBounds.y}`,
		`      width: ${scene.panelBounds.width}`,
		`      height: ${scene.panelBounds.height}`,
	  ] : []),
      `    duration: ${scene.duration}s`,
      `    visual: ${JSON.stringify(scene.visual)}`,
      `    action: ${JSON.stringify(scene.action)}`,
      `    camera: ${JSON.stringify(scene.camera)}`,
      `    mood: ${JSON.stringify(scene.mood)}`,
    ]),
    'dialogues:', ...videoPackage.dialogues.map((dialogue) => `  - ${JSON.stringify(dialogue)}`),
    `camera_style: ${JSON.stringify(videoPackage.camera_style)}`,
    `music_mood: ${JSON.stringify(videoPackage.music_mood)}`,
    `motion_prompt: ${JSON.stringify(videoPackage.motion_prompt)}`,
    'export_targets:', ...videoPackage.export_targets.map((target) => `  - ${target}`),
  ].join('\n');
}
