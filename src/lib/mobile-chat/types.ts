import type { AIEngine } from '$lib/types/character';

export type MobileChatRole = 'user' | 'assistant';

export type MobileChatMessage = {
	id: string;
	role: MobileChatRole;
	speaker: string;
	text: string;
	createdAt: number;
};

export type MobileLongTermMemory = {
	id: string;
	title: string;
	content: string;
	tags: string[];
	createdAt: number;
	updatedAt: number;
};

export type MobileChatSettings = {
	characterName: string;
	aiEngine: Extract<AIEngine, 'ollama' | 'lmstudio'>;
	model: string;
	systemPrompt: string;
	ttsProvider: 'none' | 'irodori' | 'voicevox';
	voicevoxEndpoint: string;
	voicevoxSpeakerId: number;
	irodoriEndpoint: string;
	irodoriSpeakerId: string;
};

export const defaultMobileChatSettings: MobileChatSettings = {
	characterName: 'リセア',
	aiEngine: 'ollama',
	model: 'qwen2.5:3b',
	systemPrompt:
		'あなたはリセアという名前の、スマホの中にいる記憶付きAIパートナーです。自然な日本語で、親しみやすく、相手の話をよく覚えているように返答してください。返答は長くしすぎず、2〜4文程度にしてください。',
	ttsProvider: 'irodori',
	voicevoxEndpoint: '',
	voicevoxSpeakerId: 1,
	irodoriEndpoint: '',
	irodoriSpeakerId: 'none'
};
