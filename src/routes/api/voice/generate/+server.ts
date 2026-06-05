import { json } from '@sveltejs/kit';
import path from 'node:path';
import { generateIrodoriSample } from '$lib/server/irodoriGradio';
import { resolveVoiceModel } from '$lib/server/irodoriModels';
import { readSettings, resolveVoiceBackendUrl } from '$lib/server/settings';
import type { RequestHandler } from './$types';

type VoiceGenerateRequest = {
  text?: string;
  model?: string;
};

export const POST: RequestHandler = async ({ request }) => {
  let body: VoiceGenerateRequest;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = body.text ?? '';
  if (!text.trim()) {
    return json({ error: 'text is required' }, { status: 400 });
  }

  const { env } = await import('$env/dynamic/private');
  let model: string;

  try {
    model = resolveVoiceModel(env, 'irodori-tts', body.model);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid model' }, { status: 400 });
  }

  try {
    const settings = await readSettings();
    const result = await generateIrodoriSample({
      text,
      model,
      baseUrl: resolveVoiceBackendUrl(settings) || env.IRODORI_SAMPLE_URL || 'http://127.0.0.1:7860',
      outputDir: path.join(process.cwd(), 'static', 'generated', 'voice'),
      publicBasePath: '/generated/voice',
    });

    return json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[api/voice/generate] failed:', e);
    return json(
      {
        error: 'voice generation failed',
        detail: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 502 },
    );
  }
};
