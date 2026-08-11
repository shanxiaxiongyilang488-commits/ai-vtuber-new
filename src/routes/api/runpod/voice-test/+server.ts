import { json } from '@sveltejs/kit';
import { readSettings } from '$lib/server/settings';
import { synthesizePreferredRunpodSpeech } from '$lib/server/runpodVoiceRouter';
import type { RequestHandler } from './$types';

const TEST_TEXT = 'こんにちは。RunPodから音声を生成しています。';

export const POST: RequestHandler = async () => {
  const settings = await readSettings();
  const apiKey = settings.runpod.apiKey.trim();
  const endpointId = settings.runpod.voiceEndpointId.trim();
  const hasPod = settings.runpod.voicePodEnabled && settings.runpod.voicePodId.trim();
  if (!apiKey || (!endpointId && !hasPod)) {
    return json(
      { success: false, message: 'RunPodのAPIキーとVoice Endpoint IDを保存してください。' },
      { status: 400 },
    );
  }

  try {
    const result = await synthesizePreferredRunpodSpeech(
      settings.runpod,
      'runpod-settings-test',
      {
        engine: 'irodori',
        mode: 'design',
        model: '',
        caption: 'A clear, friendly young Japanese female voice, recorded dry and close.',
        speed: 1,
        autoSpeak: false,
      },
      TEST_TEXT,
      process.env,
      `settings-test-${Date.now()}`,
    );
    const audioBuffer = new Uint8Array(result.audio).buffer;
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
        'X-Voice-Backend': result.backend,
      },
    });
  } catch (error) {
    console.error('[api/runpod/voice-test] failed:', error);
    return json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'RunPod音声テストに失敗しました。',
      },
      { status: 502 },
    );
  }
};
