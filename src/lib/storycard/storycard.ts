export type StoryCardPackageKind = 'image' | 'video' | 'comic';

export interface StoryCardCharacter {
	id?: string;
	name: string;
	role?: string;
	description?: string;
}

export type StoryCardReferenceKind =
	| 'image'
	| 'video'
	| 'audio'
	| 'text'
	| 'memory'
	| 'character'
	| 'other';

export interface StoryCardReference {
	id: string;
	kind: StoryCardReferenceKind;
	title?: string;
	url?: string;
	summary?: string;
	tags?: string[];
}

export interface StoryCardCut {
	id: string;
	order: number;
	start?: string;
	end?: string;
	description?: string;
	requiredUnits?: string[];
	time?: string;
	title?: string;
	summary: string;
	visual?: string;
	characters?: string[];
	action?: string;
	motion?: string;
	dialogue?: string;
	camera?: string;
	emotion?: string;
	duration?: number;
	references?: string[];
}

export interface StoryCard {
	id: string;
	/** `video` is retained for legacy projects and is read as an Animation Project. */
	type?: 'video_storycard' | 'video';
	isFallback?: boolean;
	sourceModel?: string;
	parseSuccess?: boolean;
	generationError?: {
		stage: 'storycard_json_parse' | 'storycard_validation';
		message: string;
		rawResponse: string;
		rawResponseLength: number;
		rawResponseTruncated: boolean;
		motionPromptGenerationStarted: boolean;
		preservedMotionPrompt: boolean;
	};
	title: string;
	summary: string;
	theme: string;
	goal: string;
	characters: StoryCardCharacter[];
	references: StoryCardReference[];
	location: string;
	style: string;
	emotion: string;
	duration: number;
	cuts: StoryCardCut[];
	createdAt: string;
	updatedAt: string;
}
