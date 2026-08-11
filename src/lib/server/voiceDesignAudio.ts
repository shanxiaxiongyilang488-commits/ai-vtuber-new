import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * プロバイダが返すリモート音声URLを static/generated/voice-design/ へ保存し、
 * アプリ内で安定して再生できる公開パスを返す (リモートURLは期限切れの可能性があるため)。
 */
export async function persistVoiceDesignAudio(remoteUrl: string): Promise<string> {
	const response = await fetch(remoteUrl);
	if (!response.ok) throw new Error(`audio download failed: HTTP ${response.status}`);
	const buffer = new Uint8Array(await response.arrayBuffer());
	const extension = /\.wav(?:$|\?)/i.test(remoteUrl) ? 'wav' : 'mp3';
	const fileName = `cvd_${Date.now()}_${randomUUID().slice(0, 8)}.${extension}`;
	const dir = path.join(process.cwd(), 'static', 'generated', 'voice-design');
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, fileName), buffer);
	return `/generated/voice-design/${fileName}`;
}

export function countPreviewChars(value: string): number {
	return Array.from(value.replace(/\s+/g, '')).length;
}
