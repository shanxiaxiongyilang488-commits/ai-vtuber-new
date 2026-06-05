import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviderKey, readSettings, resolveVoiceBackendUrl } from '$lib/server/settings';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { generateIrodoriSample } from '$lib/server/irodoriGradio';
import { resolveVoiceModel } from '$lib/server/irodoriModels';

const FALLBACK_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

type SpeakRequest = {
  text?: string;
  caption?: string;
  characterName?: string;
  speaker?: string;
  voiceId?: string;
  voice?: string;
  COLAB_TTS_VOICE?: string;
  provider?: string;
  voiceName?: string;
  speed?: number;
};

async function resolveIrodoriBaseUrl(
  env: Record<string, string | undefined>,
  allowColabFallback = false,
): Promise<string> {
  const settings = await readSettings();
  const settingsUrl = resolveVoiceBackendUrl(settings);
  const envUrl = env.IRODORI_TTS_URL?.trim() ?? '';
  const colabUrl = allowColabFallback ? (env.COLAB_TTS_URL?.trim() ?? '') : '';
  const source = settingsUrl ? `settings.voice.${settings.voice.backend}` : (envUrl ? 'env.IRODORI_TTS_URL' : (colabUrl ? 'env.COLAB_TTS_URL' : 'none'));
  const url = (settingsUrl || envUrl || colabUrl).replace(/\/+$/, '');

  console.log('[IRODORI URL SOURCE]', source);
  console.log('[IRODORI URL]', url);

  return url;
}

function resolveIrodoriTtsModel(env: Record<string, string | undefined>): string {
  const requested = env.IRODORI_TTS_CHECKPOINT || (
    env.IRODORI_TTS_MODEL && env.IRODORI_TTS_MODEL !== 'irodori-tts'
      ? env.IRODORI_TTS_MODEL
      : undefined
  );
  return resolveVoiceModel(env, 'irodori-tts', requested);
}

function resolveIrodoriVoiceDesignModel(
  env: Record<string, string | undefined>,
  requestedModel?: string,
): string {
  const requested = requestedModel || env.IRODORI_VOICE_DESIGN_CHECKPOINT;
  return resolveVoiceModel(env, 'kizuna-voice-designer', requested);
}

async function resolveIrodoriVoiceProfile(body: SpeakRequest) {
  const settings = await readSettings();
  const requestedName = (body.characterName || body.speaker || '').trim();
  const requestedVoice = (body.voice || body.COLAB_TTS_VOICE || body.voiceName || body.voiceId || '').trim();
  const profiles = settings.irodori.voiceProfiles;
  const profile = requestedName
    ? profiles[requestedName]
    : Object.values(profiles).find((item) => item.voice && item.voice === requestedVoice);

  return {
    profile,
    caption: (body.caption || profile?.caption || '').trim(),
    captionSource: body.caption ? 'request' : (profile?.caption ? 'voice-profile' : 'none'),
    voice: (requestedVoice || profile?.voice || '').trim(),
    characterName: requestedName || profile?.characterName || '',
    ttsModel: profile?.ttsModel || '',
    designerModel: profile?.designerModel || '',
  };
}

async function generateIrodoriSpeech(
  text: string,
  caption: string,
  voice: string,
  model: string,
  baseUrl: string,
  env: Record<string, string | undefined>,
): Promise<{ audioUrl: string; audioBuffer: ArrayBuffer }> {
  const result = await generateIrodoriSample({
    text,
    caption,
    voice,
    model: caption ? resolveIrodoriVoiceDesignModel(env, model) : (model || resolveIrodoriTtsModel(env)),
    baseUrl,
    outputDir: path.join(process.cwd(), 'static', 'audio'),
    publicBasePath: '/audio',
  });
  const filePath = path.join(process.cwd(), 'static', result.audioUrl.replace(/^\//, ''));
  const audioBuffer = await readFile(filePath);
  return { audioUrl: result.audioUrl, audioBuffer: audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: SpeakRequest;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = body.text ?? '';
  const voiceId = body.voiceId ?? '';
  const provider = body.provider ?? '';
  const voiceName = body.voiceName ?? '';
  const irodoriProfile = await resolveIrodoriVoiceProfile(body);
  const caption = irodoriProfile.caption;
  const voice = irodoriProfile.voice;

  console.log('[IRODORI REQUEST BODY]', body);
  console.log('[IRODORI TEXT]', text);
  console.log('[IRODORI CAPTION]', caption);
  console.log('[IRODORI CAPTION SOURCE]', irodoriProfile.captionSource);
  console.log('[IRODORI VOICE]', voice);
  console.log('[IRODORI CHARACTER]', irodoriProfile.characterName);

  if (!text) {
    return json({ error: 'text is required' }, { status: 400 });
  }

  const { env } = await import('$env/dynamic/private');

  if (!provider && !voiceId && !voice && !voiceName) {
    console.log('[TTS REQUEST]');

    const baseUrl = await resolveIrodoriBaseUrl(env);
    if (!baseUrl) {
      console.error('[speak] Irodori URL is not set');
      return json({ error: 'Irodori URL not set' }, { status: 500 });
    }
    let generated: { audioUrl: string; audioBuffer: ArrayBuffer };
    try {
      generated = await generateIrodoriSpeech(text, caption, voice || voiceName || voiceId, caption ? irodoriProfile.designerModel : irodoriProfile.ttsModel, baseUrl, env);
    } catch (e) {
      console.error('[speak] Irodori TTS fetch error:', e);
      return json({ error: 'Irodori TTS connection failed' }, { status: 502 });
    }

    console.log('[TTS GENERATED]', generated.audioUrl);
    return json({ audioUrl: generated.audioUrl });
  }

  if (provider === 'irodori-tts' || provider === 'colab-tts') {
    const baseUrl = await resolveIrodoriBaseUrl(env, provider === 'colab-tts');
    if (!baseUrl) {
      console.error('[speak] Irodori URL is not set');
      return json({ error: 'Irodori URL not set' }, { status: 500 });
    }

    let generated: { audioUrl: string; audioBuffer: ArrayBuffer };
    try {
      generated = await generateIrodoriSpeech(text, caption, voice || voiceName || voiceId, caption ? irodoriProfile.designerModel : irodoriProfile.ttsModel, baseUrl, env);
    } catch (e) {
      console.error('[speak] Irodori TTS fetch error:', e);
      return json({ error: 'Irodori TTS connection failed' }, { status: 502 });
    }

    console.log(`[speak] Irodori TTS bytes=${generated.audioBuffer.byteLength}`);

    return new Response(generated.audioBuffer, {
      headers: { 'Content-Type': 'audio/wav' },
    });
  }

  if (provider === 'google') {
    const googleApiKey = env.GOOGLE_TTS_API_KEY;
    if (!googleApiKey) {
      console.error('[speak] GOOGLE_TTS_API_KEY is not set');
      return json({ error: 'GOOGLE_TTS_API_KEY not set' }, { status: 500 });
    }

    const targetVoice = voiceName || 'ja-JP-Neural2-B';
    const languageCode = targetVoice.slice(0, 5);

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
            audioConfig: { audioEncoding: 'MP3' },
          }),
        },
      );
    } catch (e) {
      console.error('[speak] Google TTS fetch error:', e);
      return json({ error: 'Google TTS connection failed' }, { status: 502 });
    }

    if (!googleRes.ok) {
      const errText = await googleRes.text().catch(() => '');
      console.error(`[speak] Google TTS HTTP ${googleRes.status}:`, errText);
      return json(
        { error: `Google TTS error: HTTP ${googleRes.status}`, detail: errText },
        { status: googleRes.status },
      );
    }

    const googleData = (await googleRes.json()) as { audioContent: string };
    const binaryStr = atob(googleData.audioContent);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    console.log(`[speak] Google TTS voice=${targetVoice}, bytes=${bytes.byteLength}`);
    return new Response(bytes.buffer, {
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  }

  const apiKey = await getProviderKey('elevenlabs');

  if (!apiKey) {
    console.error('[speak] ElevenLabs API key is not set');
    return json({ error: 'ElevenLabs API key not set' }, { status: 500 });
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
    return json({ error: 'ElevenLabs connection failed' }, { status: 502 });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[speak] ElevenLabs HTTP ${response.status}:`, errText);
    return json(
      { error: `ElevenLabs error: HTTP ${response.status}`, detail: errText },
      { status: response.status },
    );
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[speak] audio size=${audioBuffer.byteLength} bytes`);

  return new Response(audioBuffer, {
    headers: { 'Content-Type': 'audio/mpeg' },
  });
};
