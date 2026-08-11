import { json, type RequestHandler } from '@sveltejs/kit';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VoiceDesignSession } from '$lib/voiceDesign';

/**
 * Character Voice Design の生成履歴 (キャラクターごと)。
 * data/voice-design-history/<characterId>.json に保存。
 * 既存の analyze / generate-candidates / refine / save-profile 処理には手を入れず、
 * UI側が生成完了後にこのAPIへ upsert する追加型の履歴ストア。
 */

const HISTORY_DIR = path.join(process.cwd(), 'data', 'voice-design-history');
const MAX_SESSIONS_PER_CHARACTER = 50;
const AUDIO_PUBLIC_PREFIX = '/generated/voice-design/';

function safeCharacterId(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function historyPath(characterId: string): string {
	return path.join(HISTORY_DIR, `${safeCharacterId(characterId)}.json`);
}

async function readSessions(characterId: string): Promise<VoiceDesignSession[]> {
	try {
		const raw = await readFile(historyPath(characterId), 'utf-8');
		const data = JSON.parse(raw) as { sessions?: VoiceDesignSession[] };
		return Array.isArray(data.sessions) ? data.sessions : [];
	} catch {
		return [];
	}
}

async function writeSessions(characterId: string, sessions: VoiceDesignSession[]): Promise<void> {
	await mkdir(HISTORY_DIR, { recursive: true });
	await writeFile(historyPath(characterId), `${JSON.stringify({ sessions }, null, 2)}\n`, 'utf-8');
}

/** セッションが参照する音声ファイルを削除する (公開prefix配下のみ対象)。 */
async function deleteSessionAudio(session: VoiceDesignSession): Promise<void> {
	for (const candidate of session.candidates ?? []) {
		const url = candidate.audioUrl ?? '';
		if (!url.startsWith(AUDIO_PUBLIC_PREFIX)) continue;
		const fileName = path.basename(url);
		if (!/^cvd_[\w.-]+$/.test(fileName)) continue;
		await unlink(path.join(process.cwd(), 'static', 'generated', 'voice-design', fileName)).catch(() => undefined);
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const characterId = url.searchParams.get('characterId')?.trim() ?? '';
	if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
	const sessions = await readSessions(characterId);
	sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	return json({ sessions }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
	let body: { session?: VoiceDesignSession };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const session = body.session;
	if (!session || typeof session !== 'object') return json({ message: 'session is required' }, { status: 400 });
	if (!session.id || !session.characterId) return json({ message: 'session.id and session.characterId are required' }, { status: 400 });
	if (!Array.isArray(session.candidates) || session.candidates.length === 0) {
		return json({ message: 'session.candidates is required' }, { status: 400 });
	}
	// サムネイルは縮小済みdata URLのみ受け付ける (元画像の巨大data URL保存を防ぐ)。
	if (typeof session.imageThumb === 'string' && session.imageThumb.length > 120_000) {
		return json({ message: 'imageThumb is too large (use a downscaled thumbnail)' }, { status: 400 });
	}

	const sessions = await readSessions(session.characterId);
	const index = sessions.findIndex((item) => item.id === session.id);
	const next: VoiceDesignSession = { ...session, updatedAt: new Date().toISOString() };
	if (index >= 0) sessions[index] = next;
	else sessions.push(next);
	// 上限超過分は古い順に音声ごと削除。
	sessions.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	while (sessions.length > MAX_SESSIONS_PER_CHARACTER) {
		const removed = sessions.shift();
		if (removed) await deleteSessionAudio(removed);
	}
	await writeSessions(session.characterId, sessions);
	console.log('[VOICE_DESIGN_HISTORY_UPSERT]', {
		characterId: session.characterId,
		sessionId: session.id,
		candidates: session.candidates.length,
		adopted: session.adoptedCandidateId ?? null,
	});
	return json({ ok: true, count: sessions.length });
};

export const DELETE: RequestHandler = async ({ url }) => {
	const characterId = url.searchParams.get('characterId')?.trim() ?? '';
	const id = url.searchParams.get('id')?.trim() ?? '';
	if (!characterId || !id) return json({ message: 'characterId and id are required' }, { status: 400 });
	const sessions = await readSessions(characterId);
	const target = sessions.find((item) => item.id === id);
	if (!target) return json({ message: 'session not found' }, { status: 404 });
	await deleteSessionAudio(target);
	await writeSessions(characterId, sessions.filter((item) => item.id !== id));
	console.log('[VOICE_DESIGN_HISTORY_DELETE]', { characterId, sessionId: id });
	return json({ ok: true });
};
