import type { MobileChatSettings } from '$lib/mobile-chat/types';

export async function speakMobileChat(text: string, settings: MobileChatSettings): Promise<void> {
	if (!text || settings.ttsProvider === 'none') return;

	if (settings.ttsProvider === 'voicevox') {
		await speakVoiceVox(text, settings);
		return;
	}

	await speakIrodori(text, settings);
}

async function speakVoiceVox(text: string, settings: MobileChatSettings): Promise<void> {
	const endpoint = trimSlash(settings.voicevoxEndpoint);
	const speaker = settings.voicevoxSpeakerId;
	const queryRes = await fetch(`${endpoint}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {
		method: 'POST'
	});

	if (!queryRes.ok) throw new Error(`VOICEVOX audio_query failed (${queryRes.status})`);

	const query = await queryRes.json();
	const audioRes = await fetch(`${endpoint}/synthesis?speaker=${speaker}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(query)
	});

	if (!audioRes.ok) throw new Error(`VOICEVOX synthesis failed (${audioRes.status})`);

	await playAudioBlob(await audioRes.blob());
}

async function speakIrodori(text: string, settings: MobileChatSettings): Promise<void> {
	const endpoint = trimSlash(settings.irodoriEndpoint);
	const res = await fetch(`${endpoint}/synthesis`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			text,
			speaker: settings.irodoriSpeakerId
		})
	});

	if (!res.ok) throw new Error(`Irodori TTS synthesis failed (${res.status})`);

	await playAudioBlob(await res.blob());
}

function playAudioBlob(blob: Blob): Promise<void> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(blob);
		const audio = new Audio(url);
		const finish = () => {
			URL.revokeObjectURL(url);
			resolve();
		};

		audio.addEventListener('ended', finish, { once: true });
		audio.addEventListener('pause', finish, { once: true });
		audio.addEventListener('error', finish, { once: true });
		audio.play().catch(finish);
	});
}

function trimSlash(value: string): string {
	return value.trim().replace(/\/+$/, '');
}
