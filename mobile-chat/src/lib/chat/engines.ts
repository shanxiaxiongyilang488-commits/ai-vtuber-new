import type { ChatContext, ChatEngine, LocalLlmSettings, SpeechEngine } from './types';

type OllamaGenerateResponse = {
	response?: string;
	error?: string;
};

export class EchoChatEngine implements ChatEngine {
	id = 'echo-local-placeholder';
	label = 'ローカル接続待ち';

	async reply(input: string, context: ChatContext): Promise<string> {
		const memoryHint =
			context.longTermMemories.length > 0
				? `覚えていることは ${context.longTermMemories[0].title} から少しずつ使っていくね。`
				: '大事なことは長期記憶に残せるよ。';

		return `${context.characterName}だよ。今は最小構成だから、あなたの言葉を受け止めるところから始めてる。\n\n「${input}」\n\n${memoryHint}`;
	}
}

export class OllamaChatEngine implements ChatEngine {
	id = 'ollama';
	label = 'Ollama';

	constructor(private settings: LocalLlmSettings) {}

	async reply(input: string, context: ChatContext): Promise<string> {
		const response = await fetch(`${normalizeEndpoint(this.settings.endpoint)}/api/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.settings.model,
				prompt: buildPrompt(input, context),
				stream: false,
				options: {
					temperature: this.settings.temperature
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Ollamaから応答を取得できませんでした (${response.status})。`);
		}

		const data = (await response.json()) as OllamaGenerateResponse;

		if (data.error) {
			throw new Error(data.error);
		}

		const reply = data.response?.trim();
		if (!reply) {
			throw new Error('Ollamaの応答が空でした。');
		}

		return reply;
	}
}

export async function testOllamaConnection(settings: LocalLlmSettings): Promise<void> {
	const response = await fetch(`${normalizeEndpoint(settings.endpoint)}/api/tags`);

	if (!response.ok) {
		throw new Error(`Ollamaに接続できませんでした (${response.status})。`);
	}
}

export class NoopSpeechEngine implements SpeechEngine {
	id = 'noop-tts-placeholder';
	label = 'TTS未接続';

	async speak(_text: string): Promise<void> {
		return;
	}
}

function normalizeEndpoint(endpoint: string): string {
	return endpoint.trim().replace(/\/+$/, '');
}

function buildPrompt(input: string, context: ChatContext): string {
	const longTerm = context.longTermMemories
		.slice(0, 12)
		.map((memory) => {
			const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : '';
			return `- ${memory.title}${tags}: ${memory.content}`;
		})
		.join('\n');

	const recent = context.shortTermMemory
		.slice(-20)
		.map((message) => `${message.role === 'user' ? 'ユーザー' : context.characterName}: ${message.content}`)
		.join('\n');

	return [
		`あなたは「${context.characterName}」という名前のAIパートナーです。`,
		'日本語で、親しみやすく、短すぎず長すぎない自然な返答をしてください。',
		'ユーザーの記憶を尊重し、必要な時だけ会話に自然に織り込んでください。',
		'まだ知らないことは決めつけず、やさしく確認してください。',
		longTerm ? `\n長期記憶:\n${longTerm}` : '\n長期記憶: まだありません。',
		recent ? `\n最近の会話:\n${recent}` : '\n最近の会話: まだありません。',
		`\nユーザー: ${input}`,
		`${context.characterName}:`
	].join('\n');
}
