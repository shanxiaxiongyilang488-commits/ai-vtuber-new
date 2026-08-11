import { json, type RequestHandler } from '@sveltejs/kit';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getCharacter } from '$lib/server/characterRegistry';
import { normalizeVoiceProfile } from '$lib/server/voiceProfile';
import type { CharacterVoiceCandidate, SavedCharacterVoiceProfile } from '$lib/voiceDesign';

/**
 * 選択した候補をキャラクターのVoice Profileとして保存する。
 * 既存の character.voice (Voice Bridge読み上げ設定) は壊さないよう、
 * 独立ファイル data/voice-profiles/<characterId>.json に保存する。
 */

const PROFILE_DIR = path.join(process.cwd(), 'data', 'voice-profiles');

function profilePath(characterId: string): string {
	const safe = characterId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
	return path.join(PROFILE_DIR, `${safe}.json`);
}

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
	if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });

	let characterName = '';
	try {
		characterName = getCharacter(characterId)?.name ?? '';
	} catch {
		characterName = '';
	}

	const selected = body.selectedCandidate && typeof body.selectedCandidate === 'object'
		? body.selectedCandidate as CharacterVoiceCandidate
		: null;
	if (!selected?.designPrompt || !selected.audioUrl) {
		return json({ message: 'selectedCandidate (designPrompt, audioUrl) is required' }, { status: 400 });
	}

	const saved: SavedCharacterVoiceProfile = {
		characterId,
		...(characterName ? { characterName } : {}),
		profile: normalizeVoiceProfile(body.profile),
		selectedCandidate: selected,
		provider: typeof body.provider === 'string' && body.provider ? body.provider : selected.provider ?? 'unknown',
		model: typeof body.model === 'string' && body.model ? body.model : selected.model ?? 'unknown',
		savedAt: new Date().toISOString(),
	};

	await mkdir(PROFILE_DIR, { recursive: true });
	await writeFile(profilePath(characterId), `${JSON.stringify(saved, null, 2)}\n`, 'utf-8');
	console.log('[VOICE_PROFILE_SAVED]', {
		characterId,
		slot: selected.slot,
		provider: saved.provider,
		model: saved.model,
		voiceId: selected.voiceId ?? null,
	});
	return json({ ok: true, saved, timestamp: saved.savedAt });
};

/** 保存済みVoice Profileの取得。 */
export const GET: RequestHandler = async ({ url }) => {
	const characterId = url.searchParams.get('characterId')?.trim() ?? '';
	if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
	try {
		const raw = await readFile(profilePath(characterId), 'utf-8');
		return json({ saved: JSON.parse(raw) as SavedCharacterVoiceProfile });
	} catch {
		return json({ saved: null });
	}
};
