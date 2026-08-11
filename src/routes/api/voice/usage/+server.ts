import { json, type RequestHandler } from '@sveltejs/kit';
import { readVoiceUsage } from '$lib/server/voiceUsage';

/** Character Voice Design の累計コスト・生成量 (UI初期表示用)。 */
export const GET: RequestHandler = async () => {
	const usage = await readVoiceUsage();
	return json({ usage, timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
};
