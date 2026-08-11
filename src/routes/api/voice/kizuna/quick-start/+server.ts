import { json, type RequestHandler } from '@sveltejs/kit';
import { kizunaJsonResponse, requestKizunaVoice } from '$lib/server/kizunaVoice';

type QuickStartBody = { style_instruction?: string; seed_voice_backend?: string; compute_target?: string };

export const POST: RequestHandler = async ({ request }) => {
  let body: QuickStartBody;
  try { body = await request.json(); } catch { return json({ detail: 'Invalid JSON' }, { status: 400 }); }
  const styleInstruction = body.style_instruction?.trim() ?? '';
  if (!styleInstruction) return json({ detail: 'style_instruction is required' }, { status: 400 });
  const seedVoiceBackend = body.seed_voice_backend === 'qwen' ? 'qwen' : 'kizuna';
  const { env } = await import('$env/dynamic/private');
  try {
    const response = await requestKizunaVoice(env, '/v1/quick-start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        style_instruction: styleInstruction,
        gpu_memory_gb: 16,
        model_family: 'piper',
        seed_voice_backend: seedVoiceBackend,
        compute_target: body.compute_target?.trim() || 'auto',
      }),
    }, 30_000);
    return kizunaJsonResponse(response);
  } catch (error) {
    console.error('[api/voice/kizuna/quick-start]', error);
    return json({ detail: error instanceof Error ? error.message : 'Kizuna quick-start failed' }, { status: 502 });
  }
};
