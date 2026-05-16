export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
	id: string;
	role: ChatRole;
	content: string;
	createdAt: number;
};

export type LongTermMemory = {
	id: string;
	title: string;
	content: string;
	tags: string[];
	createdAt: number;
	updatedAt: number;
};

export type ChatContext = {
	characterName: string;
	shortTermMemory: ChatMessage[];
	longTermMemories: LongTermMemory[];
};

export type ChatEngine = {
	id: string;
	label: string;
	reply(input: string, context: ChatContext): Promise<string>;
};

export type SpeechEngine = {
	id: string;
	label: string;
	speak(text: string): Promise<void>;
};

export type LocalLlmSettings = {
	enabled: boolean;
	endpoint: string;
	model: string;
	temperature: number;
};
