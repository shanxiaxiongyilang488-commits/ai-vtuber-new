import { json, type RequestHandler } from '@sveltejs/kit';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import { getVisualMemoryRecord, saveVisualMemoryRecord } from '$lib/server/visualMemoryStore';

export const GET: RequestHandler = async ({ params }) => {
	if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
	try {
		const character = getMemoryCharacter(params.id);
		const record = getVisualMemoryRecord(params.id, character.visualMemory);
		return json({ characterId: record.characterId, visualMemory: record.visualMemory, updatedAt: record.updatedAt });
	} catch (error) {
		return json({ message: error instanceof Error ? error.message : String(error) }, { status: 400 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
		const raw = await request.text();
		let body: Record<string, unknown> = {};
		if (raw.trim()) {
			try {
				body = JSON.parse(raw) as Record<string, unknown>;
			} catch (error) {
				console.error('[VISUAL_MEMORY_SAVE_JSON_PARSE_ERROR]', {
					targetCharacterId: params.id,
					responseLength: raw.length,
					raw,
					error,
				});
				return json({ message: `JSON Parse Error: ${error instanceof Error ? error.message : String(error)}` }, { status: 400 });
			}
		}
		const character = getMemoryCharacter(params.id);
		const before = getVisualMemoryRecord(params.id, character.visualMemory).visualMemory;
		const entry = saveVisualMemoryRecord(params.id, body?.visualMemory);
		console.log('[VISUAL_MEMORY_SAVED]', {
			targetCharacterId: params.id,
			beforeCriticalFeatures: before.criticalFeatures,
			afterCriticalFeatures: entry.visualMemory.criticalFeatures,
			referenceImagesCount: entry.visualMemory.referenceImages.length,
			savedVisualMemoryCharacterId: entry.characterId,
		});
		return json({ visualMemory: entry.visualMemory, updatedAt: entry.updatedAt });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return json({ message }, { status: message === 'character not found' ? 404 : 400 });
	}
};
