import { json } from '@sveltejs/kit';
import { prepareRunpodH3 } from '$lib/server/runpodH3';
import { readSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  try {
    const settings = await readSettings();
    if (!settings.runpod.apiKey.trim() || !settings.runpod.videoEndpointId.trim()) {
      return json({ ok: false, message: 'RunPod APIキーとH3 Video Endpoint IDを保存してください。' }, { status: 400 });
    }
    const result = await prepareRunpodH3({
      apiKey: settings.runpod.apiKey,
      endpointId: settings.runpod.videoEndpointId,
    });
    return json({ ok: true, model: 'MiniMax-H3', ...result });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'MiniMax H3モデルの準備に失敗しました。';
    return json({ ok: false, message }, { status: 502 });
  }
};
