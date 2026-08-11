import { json, type RequestHandler } from '@sveltejs/kit';
import { chatGemini, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { parseAiJson } from '$lib/server/aiJson';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import { getVisualMemoryRecord, saveVisualMemoryRecord } from '$lib/server/visualMemoryStore';
import { readSettings } from '$lib/server/settings';
import { normalizeCharacterVisualMemory } from '$lib/types/characterVisualMemory';
import type { ChatImageInput } from '$lib/providers/types';

type BuilderExtraction = {
	characterName: string;
	criticalFeatures: string[];
	hair: string;
	face: string;
	body: string;
	outfit: string;
	mechanicalParts: string[];
	tailUnit: string;
	earUnit: string;
	connectionPort: string;
	colorPalette: string[];
};

const SYSTEM_PROMPT = [
	'You are Visual Memory Builder.',
	'Analyze all supplied reference images together as views of one character.',
	'Extract only stable, directly visible identity and construction details shared or clarified across the images.',
	'Do not invent personality, story, motion, hidden mechanisms, or names that are not visibly written or provided.',
	'When views disagree, prefer details repeated across more images and describe uncertainty briefly.',
	'criticalFeatures must contain only features visible or explicitly written in the supplied references.',
	'Do not carry over previous character tags. For SHIRO, do not include ORANGE_MESH unless it is visibly written in the supplied SHIRO references.',
	'Return JSON only. No markdown.',
	'Schema: {"characterName":"","criticalFeatures":[],"hair":"","face":"","body":"","outfit":"","mechanicalParts":[],"tailUnit":"","earUnit":"","connectionPort":"","colorPalette":[]}',
].join('\n');

function text(value: unknown, limit = 1200): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function list(value: unknown, limit = 40): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => text(item, 300)).filter(Boolean))].slice(0, limit);
}

function normalizeExtraction(value: unknown): BuilderExtraction {
	const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	return {
		characterName: text(data.characterName, 200),
		criticalFeatures: list(data.criticalFeatures, 40),
		hair: text(data.hair),
		face: text(data.face),
		body: text(data.body),
		outfit: text(data.outfit),
		mechanicalParts: list(data.mechanicalParts),
		tailUnit: text(data.tailUnit),
		earUnit: text(data.earUnit),
		connectionPort: text(data.connectionPort),
		colorPalette: list(data.colorPalette, 20),
	};
}

function deriveCriticalFeatures(characterId: string, extraction: BuilderExtraction): string[] {
	const values = [
		...extraction.criticalFeatures,
		extraction.earUnit,
		extraction.tailUnit,
		extraction.connectionPort,
		...extraction.mechanicalParts,
	].map((item) => item.trim()).filter(Boolean);
	const blocked = characterId === 'shiro' ? new Set(['ORANGE_MESH']) : new Set<string>();
	return [...new Set(values)].filter((item) => !blocked.has(item.toUpperCase())).slice(0, 40);
}

function normalizeImages(value: unknown): ChatImageInput[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item, index): ChatImageInput[] => {
		if (typeof item === 'string' && item.startsWith('data:image/')) {
			return [{ dataUrl: item, name: `visual-memory-reference-${index + 1}` }];
		}
		if (!item || typeof item !== 'object') return [];
		const source = item as Record<string, unknown>;
		const dataUrl = typeof source.dataUrl === 'string' ? source.dataUrl : '';
		if (!dataUrl.startsWith('data:image/')) return [];
		return [{ dataUrl, name: text(source.name, 300) || `visual-memory-reference-${index + 1}` }];
	}).slice(0, 12);
}

async function registeredImages(urls: string[], requestUrl: URL): Promise<ChatImageInput[]> {
	const images: ChatImageInput[] = [];
	for (const [index, rawUrl] of urls.entries()) {
		try {
			const imageUrl = new URL(rawUrl, requestUrl);
			const response = await fetch(imageUrl);
			if (!response.ok) continue;
			const mime = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
			if (!mime.startsWith('image/')) continue;
			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) continue;
			images.push({ dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, name: imageUrl.pathname.split('/').at(-1) || `registered-reference-${index + 1}` });
		} catch { /* invalid or unavailable registered image */ }
	}
	return images.slice(0, 12);
}

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const body = await request.json() as Record<string, unknown>;
		const targetCharacterId = text(body.characterId, 200).toLowerCase();
		if (!targetCharacterId) return json({ message: 'characterId is required' }, { status: 400 });
		const currentEntry = getMemoryCharacter(targetCharacterId);
		const currentVisualMemory = getVisualMemoryRecord(targetCharacterId, currentEntry.visualMemory).visualMemory;
		const useRegisteredImages = body.useRegisteredImages === true;
		let images = normalizeImages(body.images);
		if (useRegisteredImages) {
			images = await registeredImages(currentVisualMemory.referenceImages.map((reference) => reference.url), url);
		}
		if (images.length < (useRegisteredImages ? 1 : 4)) {
			return json({ message: useRegisteredImages ? 'No registered Visual Memory images are available' : 'Visual Memory Builder requires at least 4 reference images' }, { status: 400 });
		}
		const settings = await readSettings();
		const model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
		const raw = await chatGemini({
			apiKey: settings.gemini.key,
			model,
			systemPrompt: SYSTEM_PROMPT,
			userMessage: JSON.stringify({
				characterId: targetCharacterId,
				knownCharacterName: currentEntry.name,
				imageCount: images.length,
				instruction: 'Build one consolidated Visual Memory record from every reference image.',
			}),
			images,
			// gemini-3.5-flash は thinking トークンも maxTokens(=maxOutputTokens) に含まれるため余裕を持たせる。
			maxTokens: 4096,
		});
		const extraction = normalizeExtraction(parseAiJson(raw, {
			label: 'Visual Memory Builder',
			logTag: '[VISUAL_MEMORY_BUILDER_RAW]',
			context: { characterId: targetCharacterId, model },
		}));
		const current = normalizeCharacterVisualMemory(currentVisualMemory);
		const nextCriticalFeatures = deriveCriticalFeatures(targetCharacterId, extraction);
		const next = normalizeCharacterVisualMemory({
			...current,
			characterName: extraction.characterName || current.characterName || currentEntry.name,
			criticalFeatures: nextCriticalFeatures,
			appearance: {
				...current.appearance,
				hair: extraction.hair || current.appearance.hair,
				face: extraction.face || current.appearance.face,
				body: extraction.body || current.appearance.body,
				outfit: extraction.outfit || current.appearance.outfit,
				colorPalette: extraction.colorPalette.length > 0 ? extraction.colorPalette : current.appearance.colorPalette,
			},
			equipment: {
				...current.equipment,
				mechanicalParts: extraction.mechanicalParts.length > 0 ? extraction.mechanicalParts : current.equipment.mechanicalParts,
				tailUnit: extraction.tailUnit || current.equipment.tailUnit,
				earUnit: extraction.earUnit || current.equipment.earUnit,
				headUnit: extraction.earUnit || current.equipment.headUnit,
				connectionPort: extraction.connectionPort || current.equipment.connectionPort,
			},
		});
		const saved = saveVisualMemoryRecord(targetCharacterId, next);
		console.log('[VISUAL_MEMORY_BUILDER_SAVED]', {
			selectedCharacterId: text(body.selectedCharacterId, 200).toLowerCase() || targetCharacterId,
			targetCharacterId,
			beforeCriticalFeatures: current.criticalFeatures,
			afterCriticalFeatures: saved.visualMemory.criticalFeatures,
			referenceImagesCount: saved.visualMemory.referenceImages.length,
			attachmentsCount: images.length,
			savedVisualMemoryCharacterId: saved.characterId,
			imageCount: images.length,
			provider: 'gemini',
			model,
			mechanicalPartsCount: extraction.mechanicalParts.length,
			colorPaletteCount: extraction.colorPalette.length,
		});
		return json({
			extraction,
			visualMemory: saved.visualMemory,
			updatedAt: saved.updatedAt,
			provider: 'gemini',
			model,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[VISUAL_MEMORY_BUILDER_ERROR]', error);
		return json({ message }, { status: 502 });
	}
};
