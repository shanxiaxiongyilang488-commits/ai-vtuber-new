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

/**
 * 思考レイヤー: 「気付く→思い出す→関係から考える→推測する→感じる→決める」の流れを構成する。
 * thoughts の各要素に type を付与するが、emoji/text は従来形式のまま（後方互換）。
 */
const THOUGHT_TYPES = ['notice', 'memory', 'emotion', 'hypothesis', 'relationship', 'decision'] as const;
type ThoughtType = (typeof THOUGHT_TYPES)[number];
const THOUGHT_TYPE_SET = new Set<string>(THOUGHT_TYPES);
const THOUGHT_TYPE_EMOJI: Record<ThoughtType, string> = {
	notice: '🤔',
	memory: '💭',
	emotion: '😳',
	hypothesis: '🤔',
	relationship: '😊',
	decision: '✨',
};

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
		// notice レイヤーで「TAIL_UNIT_02の位置が…」のように具体的に言及できるよう、生のユニットIDも渡す。
		const recentFailureFeatures = Array.isArray(failureSource.features)
			? failureSource.features.filter((name): name is string => typeof name === 'string' && name.trim().length > 0).slice(0, 4)
			: [];
		const recentThoughts = Array.isArray(body.recentThoughts)
			? body.recentThoughts.filter((line): line is string => typeof line === 'string' && line.trim().length > 0).map((line) => line.slice(0, 80)).slice(-20)
			: [];

		const settings = await readSettings();
		const model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
		const systemPrompt = [
			`You are the inner voice of the character "${character.name}".`,
			'Convert the ACTUAL memory state in the user message JSON into a natural Japanese inner monologue (脳内ログ) that reads like real thinking in progress, not a template.',
			'Do NOT output isolated feelings. Build one believable chain of thought: notice something → recall → connect it to the user → guess why → feel → decide what to do next.',
			'',
			'Each thought has a "type". Meanings:',
			'- "notice": something just noticed in the current situation. When recentFailure.features has unit IDs (e.g. TAIL_UNIT_02), you may mention the ID verbatim (「TAIL_UNIT_02の位置がおかしいかも…」).',
			'- "memory": a recollection grounded in memoryHits, spoken as your own memory (「そういえば…」「前にも…」), never as records or data.',
			`- "relationship": a thought about ${userName}, grounded in relationshipHits or recentConversation (「${userName}、ここ毎回確認してるんだよね…」).`,
			'- "hypothesis": a guess about WHY, connecting a notice or memory (「…のかな」「…かもしれない」).',
			'- "emotion": a short honest feeling reacting to the surrounding thoughts (悔しい・嬉しい・不安 など).',
			'- "decision": the concrete next action, tied to goalText (「もう一度…してみよう…」).',
			'',
			'Hard rules:',
			'- Use only facts present in the input JSON. Never invent events, people, places, or objects.',
			'- Write 3 to 6 thoughts ordered as a chain of thinking: usually notice or memory first, decision last. Use at least 3 different types. Never output the same type twice in a row.',
			'- Each text is a short first-person murmur, at most 40 Japanese characters, ending with "…".',
			'- Mix technical detail and feeling: a concrete notice may be followed by an emotion or hypothesis reacting to it.',
			'- "memory" requires memoryHits; "relationship" requires relationshipHits or recentConversation. Skip a type when its source input is empty.',
			'- If recentFailure is non-empty: begin with a notice about it and include a hypothesis about the cause.',
			'- Include exactly one "decision" thought about goalText (what to do right now).',
			'- Never describe, list, or confirm your own appearance or design outside a failure reflection.',
			'- Match the overall tone to emotion when provided.',
			'- recentThoughts lists lines already shown to the user. Never repeat or closely paraphrase any of them; every line must be newly worded.',
			'- Avoid system jargon (score, prompt, Visual Memory, 検索, ログ, データ, 設定, メモリ). Unit/feature IDs from recentFailure.features are the only allowed technical tokens.',
			'- Return JSON only: {"thoughts":[{"type":"notice","emoji":"🤔","text":"..."}]}',
			'- type must be one of: notice memory emotion hypothesis relationship decision',
			'- emoji must be one of: 😊 🤔 😳 ✨ 💭 😤 😌 😢',
		].join('\n');
		const result = await chatGeminiWithMeta({
			apiKey: settings.gemini.key,
			model,
			systemPrompt,
			userMessage: JSON.stringify({ phase, goalText, userName, recentConversation, memoryHits, relationshipHits, emotion, recentFailure: { features: recentFailureFeatures, friendlyNames: recentFailure }, recentThoughts }),
			// gemini-3.5-flash は thinking トークンも maxTokens(=maxOutputTokens) に含まれるため余裕を持たせる。
			maxTokens: 4096,
		});
		raw = result.text;
		const parsed = parseAiJson(raw, {
			label: 'Inner monologue',
			logTag: '[INNER_MONOLOGUE_RAW]',
			context: { characterId: params.id, model, finishReason: result.finishReason },
		}) as Record<string, unknown>;
		const seenTexts = new Set(recentThoughts);
		const thoughts = Array.isArray(parsed.thoughts)
			? parsed.thoughts.slice(0, MAX_THOUGHTS).flatMap((item) => {
				const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
				const line = text(source.text, 80);
				// 同一レスポンス内・直近表示済みの両方に対する重複ガード（プロンプト指示の保険）。
				if (!line || seenTexts.has(line)) return [];
				seenTexts.add(line);
				const type: ThoughtType = typeof source.type === 'string' && THOUGHT_TYPE_SET.has(source.type.trim())
					? source.type.trim() as ThoughtType
					: 'emotion';
				const emoji = typeof source.emoji === 'string' && ALLOWED_EMOJIS.has(source.emoji.trim())
					? source.emoji.trim()
					: THOUGHT_TYPE_EMOJI[type];
				return [{ type, emoji, text: line }];
			})
			: [];
		if (thoughts.length === 0) throw new Error('Inner monologue was empty');
		console.log('[INNER_MONOLOGUE]', { characterId: params.id, phase, count: thoughts.length, types: thoughts.map((thought) => thought.type), model });
		return json({ thoughts, model, provider: 'gemini' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[INNER_MONOLOGUE_ERROR]', { message, rawHead: raw.slice(0, 300) });
		return json({ message }, { status: message === 'character not found' ? 404 : 502 });
	}
};
