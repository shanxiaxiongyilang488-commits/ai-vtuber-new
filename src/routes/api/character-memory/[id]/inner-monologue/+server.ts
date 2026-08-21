import { json, type RequestHandler } from '@sveltejs/kit';
import { chatGeminiWithMeta, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import { parseAiJson } from '$lib/server/aiJson';
import { readSettings } from '$lib/server/settings';

/**
 * 💭 Thought Translator API:
 * クライアントが実際に参照した記憶（Memory/Relationship検索ヒット・感情・直近会話・前回失敗）を
 * キャラクターの感情的な独り言へ変換する。入力にない事実の捏造は禁止。
 */

const ALLOWED_EMOJIS = new Set(['😊', '🤔', '😳', '✨', '💭', '😤', '😌', '😢']);
const MAX_THOUGHTS = 6;

function text(value: unknown, limit: number): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function list<T>(value: unknown, limit: number, map: (item: Record<string, unknown>) => T | null): T[] {
	if (!Array.isArray(value)) return [];
	return value.slice(0, limit).flatMap((item) => {
		const mapped = map(item && typeof item === 'object' ? item as Record<string, unknown> : {});
		return mapped === null ? [] : [mapped];
	});
}

export const POST: RequestHandler = async ({ params, request }) => {
	let raw = '';
	try {
		if (!params.id) return json({ message: 'character id is required' }, { status: 400 });
		const character = getMemoryCharacter(params.id.toLowerCase());
		const body = await request.json() as Record<string, unknown>;
		const phase = text(body.phase, 20) === 'image' ? 'image' : 'chat';
		const goalText = text(body.goalText, 400);
		const userName = text(body.userName, 60) || 'ユーザー';
		const recentConversation = list(body.recentConversation, 8, (item) => {
			const line = text(item.text, 200);
			return line ? { role: item.role === 'assistant' ? 'assistant' : 'user', text: line } : null;
		});
		const memoryHits = list(body.memoryHits, 4, (item) => {
			const summary = text(item.summary, 200) || text(item.title, 100);
			return summary ? { title: text(item.title, 100), summary } : null;
		});
		const relationshipHits = list(body.relationshipHits, 4, (item) => {
			const value = text(item.value, 200);
			return value ? { category: text(item.category, 60), key: text(item.key, 60), value } : null;
		});
		const emotionSource = body.emotion && typeof body.emotion === 'object' ? body.emotion as Record<string, unknown> : null;
		const emotion = emotionSource
			? { emotion: text(emotionSource.emotion, 30), reason: text(emotionSource.reason, 200) }
			: null;
		const failureSource = body.recentFailure && typeof body.recentFailure === 'object' ? body.recentFailure as Record<string, unknown> : {};
		const recentFailure = Array.isArray(failureSource.friendlyNames)
			? failureSource.friendlyNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0).slice(0, 4)
			: [];
		const recentThoughts = Array.isArray(body.recentThoughts)
			? body.recentThoughts.filter((line): line is string => typeof line === 'string' && line.trim().length > 0).map((line) => line.slice(0, 80)).slice(-20)
			: [];

		const settings = await readSettings();
		const model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
		const systemPrompt = [
			`You are the inner voice of the character "${character.name}".`,
			'Convert the ACTUAL memory state in the user message JSON into natural Japanese inner monologue (ひとりごと).',
			'Hard rules:',
			'- Use only facts present in the input JSON. Never invent events, people, places, or objects.',
			'- Ground every line in one of the REQUIRED sources: emotion, memoryHits, relationshipHits, recentFailure, or recentConversation. Appearance/visual details are auxiliary only: mention them solely when recentFailure requires it.',
			'- Write 2 to 6 lines. Each line is a short first-person murmur, at most 40 Japanese characters, ending with "…".',
			'- Express only these kinds of content, all in first person: current feelings (感情), hesitation or doubt (迷い), expectation (期待), reflection on a past failure (失敗の振り返り), and your impression of the user (ユーザーへの印象). Cover as many of them as the input gives material for.',
			'- Never describe, list, or confirm your own appearance or design. Appearance words may appear only inside a failure reflection.',
			'- Speak memories as your own recollection (「そういえば…」「たしか…」), never as records, settings, or stored information.',
			`- If relationshipHits or recentConversation mention ${userName}, include at least one line about ${userName}.`,
			'- Include exactly one line about goalText (what the character is about to do right now).',
			'- If recentFailure is non-empty, include one embarrassed or careful line about it.',
			'- Match the overall tone to emotion when provided.',
			'- recentThoughts lists lines already shown to the user. Never repeat or closely paraphrase any of them; every line must be newly worded.',
			'- Never use technical words (ID, score, feature, prompt, Visual Memory, 検索, 確認, ログ, データ, 設定, メモリ).',
			'- Return JSON only: {"thoughts":[{"emoji":"😊","text":"..."}]}',
			'- emoji must be one of: 😊 🤔 😳 ✨ 💭 😤 😌 😢',
		].join('\n');
		const result = await chatGeminiWithMeta({
			apiKey: settings.gemini.key,
			model,
			systemPrompt,
			userMessage: JSON.stringify({ phase, goalText, userName, recentConversation, memoryHits, relationshipHits, emotion, recentFailure, recentThoughts }),
			// gemini-3.5-flash は thinking トークンも maxTokens(=maxOutputTokens) に含まれるため余裕を持たせる。
			maxTokens: 4096,
		});
		raw = result.text;
		const parsed = parseAiJson(raw, {
			label: 'Inner monologue',
			logTag: '[INNER_MONOLOGUE_RAW]',
			context: { characterId: params.id, model, finishReason: result.finishReason },
		}) as Record<string, unknown>;
		const thoughts = Array.isArray(parsed.thoughts)
			? parsed.thoughts.slice(0, MAX_THOUGHTS).flatMap((item) => {
				const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
				const line = text(source.text, 80);
				if (!line) return [];
				const emoji = typeof source.emoji === 'string' && ALLOWED_EMOJIS.has(source.emoji.trim()) ? source.emoji.trim() : '💭';
				return [{ emoji, text: line }];
			})
			: [];
		if (thoughts.length === 0) throw new Error('Inner monologue was empty');
		console.log('[INNER_MONOLOGUE]', { characterId: params.id, phase, count: thoughts.length, model });
		return json({ thoughts, model, provider: 'gemini' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[INNER_MONOLOGUE_ERROR]', { message, rawHead: raw.slice(0, 300) });
		return json({ message }, { status: message === 'character not found' ? 404 : 502 });
	}
};
