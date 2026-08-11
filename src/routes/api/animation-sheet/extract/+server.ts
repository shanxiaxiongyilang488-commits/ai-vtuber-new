import { json, type RequestHandler } from '@sveltejs/kit';
import { chatGemini, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { readSettings } from '$lib/server/settings';
import { buildAnimationSheetMotionPrompt } from '$lib/animationSheetMotionPrompt';

type ExtractedScene = {
	id: number;
	eventType: 'story_event' | 'scene_transition' | 'character_action';
	eventId: string;
	storyEvent: string;
	sceneTransition: string;
	requiredEvent: boolean;
	characters: string[];
	sourcePanel: string;
	sourceSheetIndex?: number;
	panelBounds?: PanelBounds;
	duration: number;
	timecode: string;
	visual: string;
	motion: string;
	dialogue: string;
	camera: string;
};

type PanelBounds = {
	panelId: string;
	sourceSheetIndex: number;
	x: number;
	y: number;
	width: number;
	height: number;
};

const SYSTEM_PROMPT = [
	'You are Gemini Scene Extractor for ANIMATION_SHEET_MODE.',
	'このアニメシートは動画制作指示書です。SCENE番号と時刻表記をOCR的に読み取り、すべてのシーンを保持してください。要約・省略・統合は禁止です。',
	'Analyze the attached character references and animation sheet in reading order.',
	'PANEL BORDER DETECTION IS REQUIRED. Detect the actual visible rectangular or irregularly spaced frame borders before extracting any scenes.',
	'Never divide an image into an equal grid and never invent panel boundaries from the number of scenes. Captions, labels, reference portraits, and whitespace are not panels.',
	'Each bbox must tightly contain the complete physical panel including all four visible edges when present. Do not cut through artwork, dialogue, characters, or frame borders.',
	'First output exactly ANIMATION_SHEET: true when at least one image is an animation sheet, storyboard, multi-panel scene sheet, or timed shot plan. Otherwise output exactly ANIMATION_SHEET: false and stop.',
	'Extract every explicitly visible scene, duration, dialogue, camera/framing, visual content, and character motion.',
	'SCENE EXTRACTION PRIORITY IS STRICT: (1) story-changing events and milestones, (2) scene/location/time/state transitions, (3) character actions and expressions.',
	'Identify the narrative spine before describing local motion. Preserve every event marked or implied as essential to story progression in the Animation Sheet.',
	'Events such as a performance ending, moving backstage, entering a charging room, reaching a bed-shaped charging pod, and charging starting must remain as separate ordered story beats when shown.',
	'Repeated smiles, glances, turns, poses, and other high-frequency gestures are secondary character_action details. They must never replace, merge, or hide a story event or scene transition.',
	'For every scene visual, preserve visible art direction: anime style, 2D animation, cel shading, linework, color palette, lighting, world/background design, reference character design, and dream bug visual style.',
	'Preserve every printed SCENE number. Never select representative scenes, merge adjacent scenes, renumber scenes, shorten the timeline, or omit a scene.',
	'Printed SCENE labels and printed timecodes have priority over all visual interpretation. Calculate duration from each printed start and end timecode.',
	'Do not create a StoryCard. Do not return JSON. Do not add markdown fences or commentary.',
	'After ANIMATION_SHEET: true, output DETECTED_PANEL_COUNT, DETECTED_SCENE_COUNT, DETECTED_REQUIRED_EVENT_COUNT, DETECTED_REQUIRED_EVENTS, DETECTED_SCENE_IDS, and TIMELINE_END_SECONDS as OCR audit lines.',
	'DETECTED_REQUIRED_EVENTS must be a comma-separated list of stable lower_snake_case event IDs in story order, for example: live_end, backstage_entry, charging_room_entry, charging_pod_entry, charging_start.',
	'Before the scene blocks, return every detected physical panel in reading order using this exact format:',
	'<PANEL>',
	'panel_id: PANEL01',
	'source_sheet_index: 0',
	'bbox: 0.0,0.0,0.5,0.5',
	'</PANEL>',
	'source_sheet_index is the zero-based index of the attached input image containing that panel.',
	'Use exactly one <PANEL> block per physical frame. Then emit exactly one <SCENE> block for each <PANEL> block, with matching source_panel. One panel equals one scene by default; never merge panels.',
	'Return every scene as repeated blocks in this exact line-oriented format:',
	'<SCENE>',
	'id: 1',
	'event_type: story_event',
	'event_id: stable_lower_snake_case_id',
	'story_event: concise narrative milestone or empty',
	'scene_transition: previous place/state -> new place/state or empty',
	'required_event: true',
	'source_panel: PANEL01',
	'source_sheet_index: 0',
	'timecode: 0:00-0:01.5',
	'duration: 3',
	'characters: comma-separated visible character names or empty',
	'dialogue: readable dialogue or empty',
	'camera: camera/framing',
	'visual: visible subject and setting',
	'motion: concrete visible motion',
	'</SCENE>',
	'For characters, list only the characters visibly present in that panel using the names printed on the sheet or matching the attached character references. Do not guess names that are not readable or recognizable.',
	'event_type must be exactly story_event, scene_transition, or character_action. Use story_event for plot/state milestones, scene_transition for a change of place/time/story phase, and character_action only for local gestures that do not advance the story.',
	'Set required_event: true whenever omitting the panel would break the narrative chain or remove a required Animation Sheet event. Give every required event a concise story_event label.',
	'Every required_event must have an event_id that exactly matches one ID in DETECTED_REQUIRED_EVENTS. Do not reuse an event_id.',
	'Use one physical line per field. Duration must be a positive number of seconds. Keep decimal durations such as 1.5 exactly.',
	'bbox must be normalized x,y,width,height coordinates from 0.0 to 1.0 around the complete matching source panel in the animation sheet.',
	'Do not infer unreadable text or details that are not visible.',
].join('\n');

const PRESERVE_TIMELINE_PROMPT = [
	'PRESERVE TIMELINE MODE IS ON.',
	'The response is invalid unless every printed SCENE label has exactly one <SCENE> block.',
	'The response is invalid unless every detected <PANEL> has exactly one matching <SCENE>, and every <SCENE> points to one detected <PANEL>.',
	'Before answering, count all SCENE labels twice and check that DETECTED_SCENE_COUNT equals the number of emitted blocks.',
	'If the sheet shows SCENE01 through SCENE10 ending at 0:15.0, emit exactly 10 blocks whose durations total 15 seconds.',
].join('\n');

function field(block: string, name: string): string {
	return new RegExp(`^${name}\\s*:\\s*(.*)$`, 'imu').exec(block)?.[1]?.trim() ?? '';
}

function parseClockSeconds(value: string): number | null {
	const match = /^(?:(\d+)\s*[:：])?\s*(\d+(?:\.\d+)?)$/u.exec(value.trim());
	if (!match) return null;
	const total = Number(match[1] ?? 0) * 60 + Number(match[2]);
	return Number.isFinite(total) ? total : null;
}

function durationFromTimecode(value: string): number | null {
	const [startText, endText] = value.split(/\s*(?:-|–|—|〜|~|to)\s*/iu);
	if (!startText || !endText) return null;
	const start = parseClockSeconds(startText);
	const end = parseClockSeconds(endText);
	if (start === null || end === null || end <= start) return null;
	return Number((end - start).toFixed(3));
}

function numericAuditField(raw: string, name: string): number | null {
	const value = new RegExp(`^${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'imu').exec(raw)?.[1];
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function detectedSceneIds(raw: string): number[] {
	const value = /^DETECTED_SCENE_IDS\s*:\s*(.*)$/imu.exec(raw)?.[1] ?? '';
	return [...new Set((value.match(/\d+/gu) ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizeEventId(value: string): string {
	return value.trim().replace(/^['"`\[]+|['"`\]]+$/gu, '').toLowerCase().replace(/[\s-]+/gu, '_');
}

function detectedRequiredEventIds(raw: string): string[] {
	const value = /^DETECTED_REQUIRED_EVENTS\s*:\s*(.*)$/imu.exec(raw)?.[1] ?? '';
	return [...new Set(value.split(',').map(normalizeEventId).filter(Boolean))];
}

function parseNormalizedBounds(value: string): Omit<PanelBounds, 'panelId' | 'sourceSheetIndex'> | null {
	const values = (value.match(/-?\d+(?:\.\d+)?/gu) ?? []).map(Number);
	if (values.length !== 4
		|| !values.every((item) => Number.isFinite(item) && item >= 0 && item <= 1)
		|| values[2] <= 0 || values[3] <= 0
		|| values[0] + values[2] > 1.001
		|| values[1] + values[3] > 1.001) return null;
	return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function parsePanelBounds(raw: string): PanelBounds[] {
	return raw.split(/<PANEL>/iu).slice(1).flatMap((part, index) => {
		const block = part.split(/<\/PANEL>/iu)[0] ?? '';
		const bounds = parseNormalizedBounds(field(block, 'bbox'));
		if (!bounds) return [];
		const sourceSheetIndex = Math.max(0, Math.trunc(Number(field(block, 'source_sheet_index')) || 0));
		return [{
			panelId: field(block, 'panel_id') || `PANEL${String(index + 1).padStart(2, '0')}`,
			sourceSheetIndex,
			...bounds,
		}];
	}).slice(0, 40);
}

function parseSceneList(raw: string, detectedPanels: PanelBounds[]): ExtractedScene[] {
	const panelById = new Map(detectedPanels.map((panel) => [panel.panelId.toUpperCase(), panel]));
	return raw.split(/<SCENE>/iu).slice(1).flatMap((part, index) => {
		const block = part.split(/<\/SCENE>/iu)[0] ?? '';
		const timecode = field(block, 'timecode');
		const durationMatch = field(block, 'duration').match(/\d+(?:\.\d+)?/u);
		const duration = durationFromTimecode(timecode) ?? Number(durationMatch?.[0] ?? 0);
		const camera = field(block, 'camera');
		const visual = field(block, 'visual');
		const motion = field(block, 'motion');
		const storyEvent = field(block, 'story_event');
		const sceneTransition = field(block, 'scene_transition');
		const eventId = normalizeEventId(field(block, 'event_id'));
		const rawEventType = field(block, 'event_type').trim().toLowerCase().replace(/[\s-]+/gu, '_');
		const eventType: ExtractedScene['eventType'] = rawEventType === 'story_event' || rawEventType === 'scene_transition' || rawEventType === 'character_action'
			? rawEventType
			: sceneTransition ? 'scene_transition' : storyEvent ? 'story_event' : 'character_action';
		const requiredEvent = /^(?:true|yes|1|required)$/iu.test(field(block, 'required_event'));
		const characters = field(block, 'characters').split(',').map((name) => name.trim()).filter(Boolean).slice(0, 8);
		if (!Number.isFinite(duration) || duration <= 0 || (!camera && !visual && !motion && !storyEvent && !sceneTransition)) return [];
		const sourcePanel = field(block, 'source_panel') || `PANEL${String(index + 1).padStart(2, '0')}`;
		const detectedPanel = panelById.get(sourcePanel.toUpperCase());
		const legacyBounds = parseNormalizedBounds(field(block, 'panel_bbox'));
		const sourceSheetIndex = detectedPanel?.sourceSheetIndex
			?? Math.max(0, Math.trunc(Number(field(block, 'source_sheet_index')) || 0));
		const panelBounds: PanelBounds | undefined = detectedPanel ?? (legacyBounds ? {
			panelId: sourcePanel,
			sourceSheetIndex,
			...legacyBounds,
		} : undefined);
		return [{
			id: Number(field(block, 'id')) || index + 1,
			eventType,
			eventId,
			storyEvent,
			sceneTransition,
			requiredEvent,
			characters,
			sourcePanel,
			sourceSheetIndex,
			...(panelBounds ? { panelBounds } : {}),
			duration,
			timecode,
			dialogue: field(block, 'dialogue'),
			camera,
			visual,
			motion,
		}];
	}).slice(0, 40);
}

function parseVisionImages(value: unknown, fallbackPrefix: string): Array<{ dataUrl: string; name: string }> {
	if (!Array.isArray(value)) return [];
	return value.flatMap((candidate, index) => {
		if (!candidate || typeof candidate !== 'object') return [];
		const image = candidate as { dataUrl?: unknown; name?: unknown };
		if (typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) return [];
		return [{
			dataUrl: image.dataUrl,
			name: typeof image.name === 'string' && image.name.trim() ? image.name.trim() : `${fallbackPrefix}-${index + 1}`,
		}];
	});
}

export const POST: RequestHandler = async ({ request }) => {
	let body: { requestText?: unknown; images?: unknown; attachedImages?: unknown; videoReferenceImages?: unknown; visualMemoryImages?: unknown; preserveTimeline?: unknown };
	let rawResponseForError = '';
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request JSON' }, { status: 400 });
	}
	const attachedImages = parseVisionImages(body.attachedImages ?? body.images, 'attachment');
	const videoReferenceImages = parseVisionImages(body.videoReferenceImages, 'video-reference');
	const visualMemoryImages = parseVisionImages(body.visualMemoryImages, 'visual-memory');
	const images = [...attachedImages, ...videoReferenceImages, ...visualMemoryImages]
		.filter((image, index, all) => all.findIndex((candidate) => candidate.dataUrl === image.dataUrl) === index)
		.slice(0, 10);
	console.log('[ANIMATION_SHEET_VISION_SOURCE_AUDIT]', {
		attachedImages: attachedImages.map((image) => image.name),
		videoReferenceImages: videoReferenceImages.map((image) => image.name),
		visualMemoryImages: visualMemoryImages.map((image) => image.name),
		totalImages: images.length,
	});
	console.log('[ANIMATION_SHEET_GEMINI_VISION_INPUT]', {
		count: images.length,
		imageNames: images.map((image) => image.name),
	});
	if (images.length < 1) return json({ message: 'ANIMATION_SHEET_MODE requires an animation sheet image' }, { status: 400 });

	try {
		const settings = await readSettings();
		const model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
		const requestText = typeof body.requestText === 'string' ? body.requestText : '';
		const preserveTimeline = body.preserveTimeline !== false;
		const explicitAnimationSheetRequest = /(?:このアニメシートで動画(?:を)?\s*作って|絵コンテから動画(?:を)?\s*作って)/u.test(requestText);
		const rawResponse = await chatGemini({
			apiKey: settings.gemini.key,
			model,
			systemPrompt: `${SYSTEM_PROMPT}${preserveTimeline ? `\n${PRESERVE_TIMELINE_PROMPT}` : ''}${explicitAnimationSheetRequest ? '\nThe user explicitly requested animation from an animation sheet/storyboard. Set ANIMATION_SHEET: true and extract its scenes.' : ''}`,
			userMessage: requestText || 'このキャラ資料とアニメシートから動画用Scene Listを抽出してください。',
			images,
			maxTokens: 6000,
		});
		rawResponseForError = rawResponse;
		const animationSheetDetected = /^ANIMATION_SHEET\s*:\s*true\s*$/imu.test(rawResponse);
		if (!animationSheetDetected) {
			console.log('[ANIMATION_SHEET_DETECTION]', { animationSheetDetected: false, model });
			return json({ animationSheetDetected: false, scenes: [], totalDuration: 0, motionPrompt: '', model, rawResponse });
		}
		const detectedPanels = parsePanelBounds(rawResponse);
		const scenes = parseSceneList(rawResponse, detectedPanels);
		if (scenes.length === 0) throw new Error('Gemini Scene Extractor returned no valid scenes');
		const totalDuration = Number(scenes.reduce((sum, scene) => sum + scene.duration, 0).toFixed(3));
		const auditedIds = detectedSceneIds(rawResponse);
		const declaredSceneCount = numericAuditField(rawResponse, 'DETECTED_SCENE_COUNT');
		const detectedSceneCount = declaredSceneCount ?? (auditedIds.length || scenes.length);
		const declaredPanelCount = numericAuditField(rawResponse, 'DETECTED_PANEL_COUNT');
		const detectedPanelCount = declaredPanelCount ?? detectedPanels.length;
		const parsedRequiredEventCount = scenes.filter((scene) => scene.requiredEvent).length;
		const declaredRequiredEventCount = numericAuditField(rawResponse, 'DETECTED_REQUIRED_EVENT_COUNT');
		const detectedRequiredEvents = detectedRequiredEventIds(rawResponse);
		const detectedRequiredEventCount = declaredRequiredEventCount ?? (detectedRequiredEvents.length || parsedRequiredEventCount);
		const extractedRequiredEventIds = new Set(scenes.filter((scene) => scene.requiredEvent).map((scene) => scene.eventId).filter(Boolean));
		const namedMissingRequiredEvents = detectedRequiredEvents.filter((eventId) => !extractedRequiredEventIds.has(eventId));
		const unnamedMissingRequiredCount = Math.max(0, detectedRequiredEventCount - parsedRequiredEventCount - namedMissingRequiredEvents.length);
		const missingRequiredEvents = [
			...namedMissingRequiredEvents,
			...Array.from({ length: unnamedMissingRequiredCount }, (_, index) => `unknown_required_event_${index + 1}`),
		];
		const requiredEventWithoutId = scenes.filter((scene) => scene.requiredEvent && !scene.eventId).map((scene) => scene.id);
		const requiredEventWithoutLabel = scenes.filter((scene) => scene.requiredEvent && !scene.storyEvent.trim()).map((scene) => scene.id);
		const requiredEventMismatch = missingRequiredEvents.length > 0 || requiredEventWithoutId.length > 0 || requiredEventWithoutLabel.length > 0;
		const expectedIds = auditedIds.length > 0
			? auditedIds
			: Array.from({ length: detectedSceneCount }, (_, index) => index + 1);
		const extractedIds = new Set(scenes.map((scene) => scene.id));
		const omittedScenes = expectedIds.filter((id) => !extractedIds.has(id));
		const timelineEnd = numericAuditField(rawResponse, 'TIMELINE_END_SECONDS');
		const timelineDurationMismatch = timelineEnd !== null && Math.abs(totalDuration - timelineEnd) > 0.05;
		const scenePanelIds = scenes.map((scene) => scene.sourcePanel.toUpperCase());
		const detectedPanelIds = detectedPanels.map((panel) => panel.panelId.toUpperCase());
		const panelSceneMismatch = detectedPanels.length !== scenes.length
			|| new Set(scenePanelIds).size !== scenes.length
			|| detectedPanelIds.some((panelId) => !scenePanelIds.includes(panelId));
		const scenesMissingPanelBounds = scenes.filter((scene) => !scene.panelBounds).map((scene) => scene.id);
		const timelineIncompleteReasons = [
			scenes.length < detectedSceneCount ? 'scene_count_shortfall' : '',
			omittedScenes.length > 0 ? 'omitted_scene_ids' : '',
			timelineDurationMismatch ? 'timeline_duration_mismatch' : '',
			detectedPanels.length === 0 ? 'no_panel_bounds_detected' : '',
			detectedPanelCount !== scenes.length ? 'panel_count_scene_count_mismatch' : '',
			panelSceneMismatch ? 'panel_scene_mapping_mismatch' : '',
			missingRequiredEvents.length > 0 ? 'missing_required_events' : '',
			requiredEventWithoutId.length > 0 ? 'required_event_without_id' : '',
			requiredEventWithoutLabel.length > 0 ? 'required_event_without_story_label' : '',
			scenesMissingPanelBounds.length > 0 ? 'scene_missing_panel_bounds' : '',
		].filter(Boolean);
		const timelineIncomplete = preserveTimeline && timelineIncompleteReasons.length > 0;
		console.log('[ANIMATION_SHEET_TIMELINE_PARSE]', {
			detectedSceneCount,
			detectedDurations: scenes.map((scene) => scene.duration),
			totalDuration,
			omittedScenes,
			detectedPanelCount,
			panelBounds: detectedPanels,
			panelSceneMismatch,
			detectedRequiredEventCount,
			detectedRequiredEvents,
			parsedRequiredEventCount,
			requiredEvents: scenes.filter((scene) => scene.requiredEvent).map((scene) => ({ id: scene.eventId, label: scene.storyEvent, scene: scene.id })),
			missingRequiredEvents,
			requiredEventMismatch,
			timelineIncompleteReasons,
		});
		if (timelineIncomplete) {
			const failureAudit = {
				timelineIncompleteReasons,
				detectedSceneCount,
				extractedSceneCount: scenes.length,
				extractedScenes: scenes.map((scene) => ({
					id: scene.id,
					eventId: scene.eventId,
					eventType: scene.eventType,
					requiredEvent: scene.requiredEvent,
					storyEvent: scene.storyEvent,
					sceneTransition: scene.sceneTransition,
					sourcePanel: scene.sourcePanel,
					timecode: scene.timecode,
					duration: scene.duration,
					camera: scene.camera,
					visual: scene.visual,
					motion: scene.motion,
					dialogue: scene.dialogue,
				})),
				omittedScenes,
				timelineEnd,
				totalDuration,
				detectedRequiredEventCount,
				detectedRequiredEvents,
				parsedRequiredEventCount,
				missingRequiredEvents,
				requiredEventWithoutId,
				requiredEventWithoutLabel,
				scenesMissingPanelBounds,
				requiredEventMismatch,
			};
			console.warn('[ANIMATION_SHEET_TIMELINE_INCOMPLETE]', failureAudit);
			for (const eventId of missingRequiredEvents) console.error(`Missing Required Event:\n- ${eventId}`);
			console.error('[ANIMATION_SHEET_EXTRACTED_SCENES]', failureAudit.extractedScenes);
			console.error('[ANIMATION_SHEET_MISSING_SCENES]', omittedScenes);
			console.error('[ANIMATION_SHEET_GEMINI_RAW_RESPONSE]', rawResponse);
		}
		const firstTenTotal = Number(scenes.slice(0, 10).reduce((sum, scene) => sum + scene.duration, 0).toFixed(3));
		console.log('[ANIMATION_SHEET_SCENE_DURATIONS]', {
			model,
			scenes: scenes.map((scene, index) => ({
				scene: `SCENE${String(index + 1).padStart(2, '0')}`,
				duration: scene.duration,
			})),
			firstTenTotal,
			totalDuration,
		});
		const motionPrompt = buildAnimationSheetMotionPrompt(scenes);
		console.log(`[MOTION_PROMPT]\n${motionPrompt}`);
		console.log(`Prompt Length: ${motionPrompt.length}`);
		console.log('[ANIMATION_SHEET_MODE]', {
			ANIMATION_SHEET_MODE: true,
			sceneCount: scenes.length,
			totalDuration,
			generatedMotionPromptLength: motionPrompt.length,
			model,
		});
		return json({
			animationSheetDetected: true,
			scenes,
			panelBounds: detectedPanels,
			totalDuration,
			detectedPanelCount,
			detectedSceneCount,
			detectedRequiredEventCount,
			detectedRequiredEvents,
			missingRequiredEvents,
			detectedDurations: scenes.map((scene) => scene.duration),
			omittedScenes,
			timelineEnd,
			timelineIncomplete,
			timelineIncompleteReasons,
			preserveTimeline,
			motionPrompt,
			model,
			rawResponse,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[ANIMATION_SHEET_MODE_ERROR]', { message, rawResponse: rawResponseForError });
		return json({ message }, { status: 502 });
	}
};
