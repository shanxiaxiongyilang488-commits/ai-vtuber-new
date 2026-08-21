import type { StoryScene } from '../core/sceneTimeline';

export type AnimationSheetMotionScene = {
	id?: number | string;
	eventType?: 'story_event' | 'scene_transition' | 'character_action';
	storyEvent?: string;
	sceneTransition?: string;
	requiredEvent?: boolean;
	characters?: string[];
	duration?: number;
	timecode?: string;
	title?: string;
	visual?: string;
	motion?: string;
	camera?: string;
	mood?: string;
	dialogue?: string;
	sourcePanel?: string;
};

export const ANIMATION_SHEET_STYLE_DIRECTIVES = [
	'anime style',
	'2D animation',
	'cel shading',
	'character sheet consistency',
	'reference character design',
	'dream bug visual style',
] as const;

export function animationSheetStylePrompt(): string {
	return [
		'ANIMATION SHEET STYLE LOCK — apply to every scene:',
		...ANIMATION_SHEET_STYLE_DIRECTIVES.map((directive) => `- ${directive}`),
		'- Inherit the original animation sheet linework, color palette, lighting, atmosphere, and composition.',
		'- Preserve the original world setting, background design, props, and visual storytelling language.',
		'- Keep the same face, hair, silhouette, outfit, accessories, proportions, colors, and distinguishing character features as the reference character design.',
		'- Do not redesign, photorealize, restyle, or replace the character or world between scenes.',
	].join('\n');
}

/** The only Motion Prompt generator. Pure: no logging, no side effects. */
export function buildAnimationSheetMotionPrompt(scenes: AnimationSheetMotionScene[]): string {
	const sceneBlocks = scenes.map((scene, index) => [
		`SCENE ${String(scene.id ?? index + 1).padStart(2, '0')} / ${scene.duration ?? 1}s${scene.timecode ? ` / ${scene.timecode}` : ''}${scene.sourcePanel ? ` / ${scene.sourcePanel}` : ''}`,
		scene.requiredEvent ? 'Priority: REQUIRED STORY EVENT - do not omit, merge, or replace this beat' : `Priority: ${scene.eventType ?? 'character_action'}`,
		scene.storyEvent ? `Story Event: ${scene.storyEvent}` : '',
		scene.sceneTransition ? `Scene Transition: ${scene.sceneTransition}` : '',
		scene.title ? `Title: ${scene.title}` : '',
		scene.characters?.length ? `Characters: ${scene.characters.join(', ')}` : '',
		`Visual: ${scene.visual || 'preserve the complete source-panel composition, world setting, art direction, and reference character design'}`,
		`Motion: ${scene.motion || 'follow the visible pose progression while preserving character sheet consistency'}`,
		`Camera: ${scene.camera || 'preserve the depicted framing and 2D animation composition'}`,
		scene.mood ? `Mood: ${scene.mood}` : '',
		scene.dialogue ? `Dialogue: ${scene.dialogue}` : '',
	].filter(Boolean).join('\n')).join('\n\n');

	return [
		animationSheetStylePrompt(),
		'STORY CONTINUITY PRIORITY:\n1. Preserve required story events.\n2. Preserve scene, location, time, and state transitions.\n3. Add character actions and expressions only after the story progression is secured.\nNever replace a required event with a repeated smile, glance, turn, or pose.',
		'SCENE MOTION:',
		sceneBlocks,
	].filter(Boolean).join('\n\n');
}

/**
 * Regenerates the Motion Prompt from a Scene Timeline. This is the single
 * entry point for every Motion Prompt in the app: the prompt is always derived
 * from the timeline and never stored state, manual edits, or an LLM rewrite.
 */
export function motionPromptFromTimeline(scenes: StoryScene[]): string {
	if (scenes.length === 0) return '';
	return buildAnimationSheetMotionPrompt(scenes.map((scene) => ({
		id: scene.id,
		eventType: scene.eventType,
		storyEvent: scene.storyEvent,
		sceneTransition: scene.sceneTransition,
		requiredEvent: scene.requiredEvent,
		characters: scene.characters,
		duration: scene.duration,
		timecode: scene.timecode,
		title: scene.title,
		visual: scene.visual,
		motion: scene.action,
		camera: scene.camera,
		mood: scene.mood && scene.mood !== 'follow the animation sheet' ? scene.mood : '',
		dialogue: scene.dialogue,
		sourcePanel: scene.sourcePanel,
	})));
}
