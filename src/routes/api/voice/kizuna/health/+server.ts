import { json, type RequestHandler } from '@sveltejs/kit';
import { requestKizunaVoice, resolveKizunaVoiceApiUrl } from '$lib/server/kizunaVoice';

export const GET: RequestHandler = async () => {
  const { env } = await import('$env/dynamic/private');
  try {
    const response = await requestKizunaVoice(env, '/health', {}, 3_000);
    const backend = await response.json().catch(() => ({}));
    return json({ online: response.ok, backend }, { status: response.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.warn('[api/voice/kizuna/health]', error instanceof Error ? error.message : String(error));
    return json({ online: false, message: 'Kizuna Voice backendが起動していません', url: resolveKizunaVoiceApiUrl(env) }, { status: 503 });
  }
};
