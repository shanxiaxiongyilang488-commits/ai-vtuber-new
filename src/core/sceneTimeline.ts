/**
 * Scene Timeline — the single source of truth for video generation.
 *
 * The Animation Sheet pipeline is:
 *   Animation Sheet -> Scene Timeline -> Motion Prompt -> Generated Video
 *
 * Every scene extracted from an Animation Sheet lives here, including the
 * narrative metadata (event type, required-event flags, transitions) that must
 * survive all downstream prompt generation. Consumers must never rebuild this
 * data from other representations.
 */

export type SceneEventType = 'story_event' | 'scene_transition' | 'character_action';

export type PanelBounds = {
	/** Stable panel identifier such as PANEL01. Optional on legacy saved projects. */
	panelId?: string;
	/** Zero-based source image index returned by Scene Extractor. */
	sourceSheetIndex?: number;
	x: number;
	y: number;
	width: number;
	height: number;
};

export type StoryScene = {
	id: number;
	/** Narrative priority emitted by Scene Extractor. Optional for legacy projects. */
	eventType?: SceneEventType;
	/** Stable lower_snake_case identity used for required-event audits. */
	eventId?: string;
	/** Concise story milestone that must survive prompt generation. */
	storyEvent?: string;
	/** Location, time, or story-state transition represented by this scene. */
	sceneTransition?: string;
	/** True when dropping this scene would break the Animation Sheet story. */
	requiredEvent?: boolean;
	/** Characters appearing in this scene. Enables per-scene protagonist management. */
	characters?: string[];
	sceneIndex?: number;
	title?: string;
	timecode?: string;
	thumbnailUrl?: string;
	sourcePanel?: string;
	sourceSheetId?: string;
	panelBounds?: PanelBounds;
	duration: number;
	visual: string;
	action: string;
	dialogue: string;
	camera: string;
	mood: string;
	tags?: string[];
};

/** An ordered Scene Timeline extracted from one or more Animation Sheets. */
export type SceneTimeline = StoryScene[];
