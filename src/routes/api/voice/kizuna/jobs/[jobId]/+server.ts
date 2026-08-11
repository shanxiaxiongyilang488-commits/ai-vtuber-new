import { json, type RequestHandler } from '@sveltejs/kit';
import { kizunaJsonResponse, requestKizunaVoice } from '$lib/server/kizunaVoice';

export const GET: RequestHandler = async ({ params }) => {
  const jobId = params.jobId ?? '';
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) return json({ detail: 'invalid job id' }, { status: 400 });
  const { env } = await import('$env/dynamic/private');
  try {
    return kizunaJsonResponse(await requestKizunaVoice(env, `/v1/jobs/${encodeURIComponent(jobId)}`));
  } catch (error) {
    console.error('[api/voice/kizuna/jobs]', error);
    return json({ detail: error instanceof Error ? error.message : 'Kizuna job request failed' }, { status: 502 });
  }
};
