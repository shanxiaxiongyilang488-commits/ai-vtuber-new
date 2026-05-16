import { json } from '@sveltejs/kit';
import { generateReply } from '$lib/aiRouter';
import type { Character } from '$lib/types/character';
import type { MobileChatMessage, MobileChatSettings, MobileLongTermMemory } from '$lib/mobile-chat/types';

type RequestBody = {
	input?: string;
	settings?: MobileChatSettings;
	shortTermMessages?: MobileChatMessage[];
	longTermMemories?: MobileLongTermMemory[];
};

export async function POST({ request }) {
	try {
		const body = (await request.json()) as RequestBody;
		const input = body.input?.trim();

		if (!input) {
			return json({ error: 'input is required' }, { status: 400 });
		}

		const settings = body.settings;
		if (!settings) {
			return json({ error: 'settings is required' }, { status: 400 });
		}

		const character: Character = {
			id: 'char1',
			name: settings.characterName || 'リセア',
			firstPerson: '私',
			secondPerson: 'あなた',
			catchPhrase: '',
			systemPrompt: settings.systemPrompt,
			aiEngine: settings.aiEngine,
			voiceEngine: 'none',
			voiceId: '',
			speakerId: 0,
			ollamaModel: settings.model
		};

		const reply = await generateReply({
			engine: settings.aiEngine,
			prompt: buildMobilePrompt({
				input,
				characterName: character.name,
				systemPrompt: settings.systemPrompt,
				shortTermMessages: body.shortTermMessages ?? [],
				longTermMemories: body.longTermMemories ?? []
			}),
			character
		});

		return json({ text: reply });
	} catch (error) {
		console.error('[mobile-chat/reply]', error);
		return json({ error: 'mobile-chat reply failed' }, { status: 500 });
	}
}

function buildMobilePrompt({
	input,
	characterName,
	systemPrompt,
	shortTermMessages,
	longTermMemories
}: {
	input: string;
	characterName: string;
	systemPrompt: string;
	shortTermMessages: MobileChatMessage[];
	longTermMemories: MobileLongTermMemory[];
}): string {
	const memories = longTermMemories
		.slice(0, 12)
		.map((memory) => {
			const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : '';
			return `- ${memory.title}${tags}: ${memory.content}`;
		})
		.join('\n');

	const recent = shortTermMessages
		.slice(-50)
		.map((message) => `${message.speaker}: ${message.text}`)
		.join('\n');

	return [
		systemPrompt,
		'',
		'【長期記憶】',
		memories || 'まだありません。',
		'',
		'【最近の会話】',
		recent || 'まだありません。',
		'',
		'【返答ルール】',
		`- あなたは${characterName}として返答する`,
		'- 既知の記憶を必要な時だけ自然に使う',
		'- 短くしすぎず、スマホで読みやすい長さにする',
		'- 自分の名前を毎回名乗らない',
		'',
		`ユーザー: ${input}`,
		`${characterName}:`
	].join('\n');
}
