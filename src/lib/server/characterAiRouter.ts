import { chatOpenAI, OPENAI_ORCHESTRATION_MODEL } from '$lib/providers/openai';
import { chatGemini, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { chatGrok } from '$lib/providers/grok';
import { chatClaude } from '$lib/providers/claude';
import { chatLMStudio } from '$lib/providers/lmstudio';
import type { ChatImageInput } from '$lib/providers/types';
import { readSettings } from '$lib/server/settings';
import { resolveCharacterAiProvider, type CharacterAiRole } from '$lib/server/characterSettings';

export type CharacterAiResult = { text: string; provider: string; model: string; selection: string };

export async function runCharacterAi(input: {
	characterId?: string;
	role: CharacterAiRole;
	systemPrompt: string;
	userMessage: string;
	images?: ChatImageInput[];
	maxTokens?: number;
}): Promise<CharacterAiResult> {
	const settings = await readSettings();
	const selection = resolveCharacterAiProvider(input.characterId, input.role);
	const common = {
		systemPrompt: input.systemPrompt,
		userMessage: input.userMessage,
		images: input.images,
		maxTokens: input.maxTokens,
		requestId: `character-ai:${input.role}`,
	};
	if (selection === 'Gemini') {
		const model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
		return { text: await chatGemini({ ...common, apiKey: settings.gemini.key, model }), provider: 'gemini', model, selection };
	}
	if (selection === 'Grok') {
		const model = settings.grok.model;
		const result = await chatGrok({ ...common, apiKey: settings.grok.apiKey, baseUrl: settings.grok.baseUrl, model });
		if (!result.ok) throw new Error('Grok API key is not configured');
		return { text: result.text, provider: 'grok', model, selection };
	}
	if (selection === 'Claude') {
		const model = settings.anthropic.model;
		return { text: await chatClaude({ ...common, apiKey: settings.anthropic.key, model }), provider: 'claude', model, selection };
	}
	if (selection === 'Local LLM') {
		const model = settings.local.model;
		return { text: await chatLMStudio({ ...common, model }), provider: 'lmstudio', model, selection };
	}
	const model = OPENAI_ORCHESTRATION_MODEL;
	return { text: await chatOpenAI({ ...common, apiKey: settings.openai.key, model }), provider: 'openai', model, selection: selection === 'AUTO' ? 'GPT-5.5' : selection };
}
