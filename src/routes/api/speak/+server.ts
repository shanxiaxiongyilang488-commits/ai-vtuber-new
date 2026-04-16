// src/routes/api/speak/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// デフォルトVoiceID（ElevenLabsの "Rachel" サンプル音声）
const FALLBACK_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export const POST: RequestHandler = async ({ request }) => {
  let text = '';
  let voiceId = '';
  let provider = '';
  let voiceName = '';

  try {
    const body = await request.json();
    text = body.text ?? '';
    voiceId = body.voiceId ?? '';
    provider = body.provider ?? '';
    voiceName = body.voiceName ?? '';
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!text) {
    return json({ error: 'text is required' }, { status: 400 });
  }

  // SvelteKitでは process.env ではなく $env/dynamic/private を使う
  const { env } = await import('$env/dynamic/private');

  // ===== Google TTS =====
  if (provider === 'google') {
    const googleApiKey = env.GOOGLE_TTS_API_KEY;
    if (!googleApiKey) {
      console.error('[speak] GOOGLE_TTS_API_KEY が設定されていません');
      return json({ error: 'GOOGLE_TTS_API_KEY not set' }, { status: 500 });
    }

    const targetVoice = voiceName || 'ja-JP-Neural2-B';
    const languageCode = targetVoice.slice(0, 5); // 'ja-JP'

    let googleRes: Response;
    try {
      googleRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode, name: targetVoice },
            audioConfig: { audioEncoding: 'MP3' }
          })
        }
      );
    } catch (e) {
      console.error('[speak] Google TTS fetch error:', e);
      return json({ error: 'Google TTS に接続できませんでした' }, { status: 502 });
    }

    if (!googleRes.ok) {
      const errText = await googleRes.text().catch(() => '');
      console.error(`[speak] Google TTS HTTP ${googleRes.status}:`, errText);
      return json(
        { error: `Google TTS error: HTTP ${googleRes.status}`, detail: errText },
        { status: googleRes.status }
      );
    }

    const googleData = await googleRes.json() as { audioContent: string };
    const binaryStr = atob(googleData.audioContent);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    console.log(`[speak] Google TTS voice=${targetVoice}, bytes=${bytes.byteLength}`);
    return new Response(bytes.buffer, {
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  }

  // ===== ElevenLabs (既存) =====
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.error('[speak] ELEVENLABS_API_KEY が設定されていません');
    return json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 });
  }

  const targetVoiceId = voiceId || FALLBACK_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`;

  console.log(`[speak] voiceId=${targetVoiceId}, text="${text.slice(0, 40)}..."`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
        },
      }),
    });
  } catch (e) {
    console.error('[speak] ElevenLabs fetch error:', e);
    return json({ error: 'ElevenLabs に接続できませんでした' }, { status: 502 });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[speak] ElevenLabs HTTP ${response.status}:`, errText);
    return json(
      { error: `ElevenLabs error: HTTP ${response.status}`, detail: errText },
      { status: response.status }
    );
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[speak] audio size=${audioBuffer.byteLength} bytes`);

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
    },
  });
};
