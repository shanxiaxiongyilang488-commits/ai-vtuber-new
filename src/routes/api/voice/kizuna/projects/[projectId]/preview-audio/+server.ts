import { json, type RequestHandler } from '@sveltejs/kit';
import { requestKizunaVoice } from '$lib/server/kizunaVoice';

export const GET: RequestHandler = async ({ params }) => {
  const projectId = params.projectId ?? '';
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) return json({ detail: 'invalid project id' }, { status: 400 });
  const { env } = await import('$env/dynamic/private');
  try {
    const response = await requestKizunaVoice(env, `/v1/projects/${encodeURIComponent(projectId)}/preview/audio`, {}, 30_000);
    if (!response.ok) return new Response(await response.text(), { status: response.status, headers: { 'content-type': response.headers.get('content-type') || 'text/plain' } });
    return new Response(response.body, {
      headers: {
        'content-type': response.headers.get('content-type') || 'audio/wav',
        'content-disposition': `inline; filename="${projectId}-preview.wav"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[api/voice/kizuna/preview-audio]', error);
    return json({ detail: error instanceof Error ? error.message : 'Kizuna preview audio failed' }, { status: 502 });
  }
};
