import { json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { getCharacter } from '$lib/server/characterRegistry';
import { applyPronunciation } from '$lib/server/pronunciationDictionary';
import { resolvePiperBridgeUrl, synthesizePiperSpeech } from '$lib/server/piperBridge';
import { enqueueVoiceJob, resolveVoiceBridgeUrl, synthesizeSpeech } from '$lib/server/voiceBridge';
import { ensureVoiceBridge, scheduleManagedVoiceBridgeShutdown } from '$lib/server/voiceBridgeProcess';
import { readSettings } from '$lib/server/settings';
import { synthesizePreferredRunpodSpeech } from '$lib/server/runpodVoiceRouter';
import { sanitizeSpeechText } from '$lib/speechText';
import type { RequestHandler } from './$types';

type VoiceSpeakRequest = {
  characterId?: string;
  text?: string;
  /** Per-message VoiceLab caption. The character's saved profile is never mutated. */
  voiceCaption?: string;
  /** Optional audition/playback speed override. */
  voiceSpeed?: number;
  /** Optional post-generation pitch shift in semitones. */
  voicePitchShiftSemitones?: number;
  /** Apply the caption to the saved clone/LoRA instead of designing a new identity. */
  preserveBaseVoice?: boolean;
  /** Return an existing local candidate only; never start the voice model. */
  lookupOnly?: boolean;
  /** Force a distinct user-requested audition candidate without changing chat voice caching. */
  auditionNonce?: string;
};

/** チャット本文を読み上げ向けに整形する (コードブロック・URL・記号を除去)。 */
/** キャラクターの voice 設定を返す (UI が再生ボタン / autoSpeak の表示判定に使う)。 */
export const GET: RequestHandler = async ({ url }) => {
  const characterId = url.searchParams.get('characterId')?.trim() ?? '';
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });

  let character: ReturnType<typeof getCharacter>;
  try {
    character = getCharacter(characterId);
  } catch {
    character = null;
  }
  if (!character) return json({ message: 'character not found' }, { status: 404 });

  return json(
    { characterId: character.id, voice: character.voice ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};

export const POST: RequestHandler = async ({ request }) => {
  let body: VoiceSpeakRequest;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = body.characterId?.trim() ?? '';
  if (!characterId) return json({ success: false, message: 'characterId is required' }, { status: 400 });

  let character: ReturnType<typeof getCharacter>;
  try {
    character = getCharacter(characterId);
  } catch {
    character = null;
  }
  if (!character) return json({ success: false, message: 'character not found' }, { status: 404 });

  const requestedVoiceCaption = typeof body.voiceCaption === 'string'
    ? Array.from(body.voiceCaption.trim()).slice(0, 2000).join('')
    : '';
  const voice = character.voice;
  if (!voice && !requestedVoiceCaption) {
    return json(
      { success: false, message: `voice is not configured for character "${characterId}"` },
      { status: 400 },
    );
  }

  const text = applyPronunciation(sanitizeSpeechText(body.text ?? ''));
  if (!text) return json({ success: false, message: 'text is required' }, { status: 400 });

  const baseVoice = voice ?? {
    engine: 'irodori',
    mode: 'design' as const,
    model: '',
    speed: 1,
    autoSpeak: false,
  };
  const requestedSpeed = typeof body.voiceSpeed === 'number' && Number.isFinite(body.voiceSpeed)
    ? Math.min(1.35, Math.max(0.75, body.voiceSpeed))
    : undefined;
  const requestedPitchShift = typeof body.voicePitchShiftSemitones === 'number' && Number.isFinite(body.voicePitchShiftSemitones)
    ? Math.min(6, Math.max(-6, body.voicePitchShiftSemitones))
    : undefined;
  const auditionNonce = typeof body.auditionNonce === 'string'
    ? body.auditionNonce.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
    : '';
  // Explicit VoiceLab directions redesign the one-off candidate. Conversational
  // delivery adjustments ("もっとはっちゃけて" etc.) retain the saved clone
  // identity and only override caption/prosody/speed for this utterance.
  const effectiveVoice = requestedVoiceCaption && baseVoice.engine !== 'piper'
    ? body.preserveBaseVoice === true && voice
      ? { ...baseVoice, caption: requestedVoiceCaption, speed: requestedSpeed ?? baseVoice.speed, ...(requestedPitchShift !== undefined ? { pitchShiftSemitones: requestedPitchShift } : {}) }
      : { ...baseVoice, mode: 'design' as const, model: '', caption: requestedVoiceCaption, speed: requestedSpeed ?? baseVoice.speed, ...(requestedPitchShift !== undefined ? { pitchShiftSemitones: requestedPitchShift } : {}) }
    : requestedSpeed !== undefined
      ? { ...baseVoice, speed: requestedSpeed, ...(requestedPitchShift !== undefined ? { pitchShiftSemitones: requestedPitchShift } : {}) }
      : requestedPitchShift !== undefined
        ? { ...baseVoice, pitchShiftSemitones: requestedPitchShift }
      : baseVoice;

  const { env } = await import('$env/dynamic/private');
  const settings = await readSettings();
  // This setting controls synthesis only; chat/LLM routing remains untouched.
  const voiceExecutionBackend = settings.voice.ttsBackend;
  let resolvedVoiceBackend: string = voiceExecutionBackend;
  const voiceCacheBackend = voiceExecutionBackend === 'local' ? 'int8' : voiceExecutionBackend;

  // 同一キャラ・同一 voice 設定・同一テキストなら生成済み wav を再利用する
  // (CPU の clone 合成は 1 メッセージ数分かかるため、再再生は即応答が必須)。
  const deliveryOverride = body.preserveBaseVoice === true && Boolean(requestedVoiceCaption);
  const currentCacheVersion = effectiveVoice.mode === 'design'
    ? `irodori-v4-${voiceCacheBackend}-design-official-noref-cfg-v7-longform`
    : effectiveVoice.engine === 'irodori'
      ? deliveryOverride
        ? `irodori-v4-${voiceCacheBackend}-clone-delivery-v3-longform`
        : `irodori-v4-${voiceCacheBackend}-clone-v2-longform`
      : 'voice-v1';
  const cacheKeyForVersion = (version: string) => createHash('sha1')
    .update(JSON.stringify([
      version,
      character.id,
      effectiveVoice.engine,
      effectiveVoice.mode,
      effectiveVoice.model,
      effectiveVoice.caption ?? '',
      effectiveVoice.speed ?? 1,
      effectiveVoice.pitchShiftSemitones ?? 0,
      text,
      auditionNonce,
      settings.runpod.voiceModel,
    ]))
    .digest('hex');
  const cacheKey = cacheKeyForVersion(currentCacheVersion);
  const outputDir = path.join(process.cwd(), 'static', 'voice-output', character.id);
  const fileName = `${cacheKey}.wav`;
  const wavPath = path.join(outputDir, fileName);
  const metaPath = path.join(outputDir, `${cacheKey}.json`);

  if (body.lookupOnly) {
    const lookupVersions = [currentCacheVersion];
    for (const version of lookupVersions) {
      const lookupKey = cacheKeyForVersion(version);
      const lookupWavPath = path.join(outputDir, `${lookupKey}.wav`);
      if (!existsSync(lookupWavPath)) continue;
      let duration: number | null = null;
      try {
        const meta = JSON.parse(await readFile(path.join(outputDir, `${lookupKey}.json`), 'utf8')) as { duration?: number };
        if (typeof meta.duration === 'number') duration = meta.duration;
      } catch {
        // A WAV remains a valid candidate even when its optional metadata is missing.
      }
      return json(
        {
          success: true,
          audioUrl: `/voice-output/${character.id}/${lookupKey}.wav`,
          duration,
          cached: true,
          cacheVersion: version,
          backend: voiceExecutionBackend,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return json(
      { success: false, missing: true, message: 'voice candidate is not in the local cache' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (existsSync(wavPath)) {
    let duration: number | null = null;
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { duration?: number };
      if (typeof meta.duration === 'number') duration = meta.duration;
    } catch {
      // メタ欠損時は duration 不明のまま返す
    }
    return json(
      { success: true, audioUrl: `/voice-output/${character.id}/${fileName}`, duration, cached: true, backend: voiceExecutionBackend },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // 同時生成数 1: enqueueVoiceJob で直列化 (Voice Bridge 側でも lock で保護)。
    // engine "piper" は Piper Bridge (piper-plus, CPUリアルタイム)、それ以外は Voice Bridge (VDC/Irodori)。
    const result = await enqueueVoiceJob(async () => {
      // キュー待ちの間に同一テキストの先行ジョブが完了していたら合成をスキップ
      if (existsSync(wavPath)) {
        const audio = await readFile(wavPath);
        let duration = 0;
        try {
          const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { duration?: number };
          if (typeof meta.duration === 'number') duration = meta.duration;
        } catch {
          // メタ欠損は duration 0 のまま
        }
        return { audio, duration };
      }
      if (effectiveVoice.engine === 'piper') {
        return synthesizePiperSpeech(resolvePiperBridgeUrl(env), effectiveVoice, text);
      }
      if (voiceExecutionBackend === 'runpod') {
        const routed = await synthesizePreferredRunpodSpeech(
          settings.runpod,
          character.id,
          effectiveVoice,
          text,
          env,
          auditionNonce,
          deliveryOverride,
        );
        resolvedVoiceBackend = routed.backend;
        return routed;
      }
      const bridgeUrl = resolveVoiceBridgeUrl(env);
      await ensureVoiceBridge(bridgeUrl, env);
      try {
        return await synthesizeSpeech(bridgeUrl, effectiveVoice, text);
      } finally {
        scheduleManagedVoiceBridgeShutdown(env);
      }
    });

    await mkdir(outputDir, { recursive: true });
    await writeFile(wavPath, result.audio);
    await writeFile(metaPath, JSON.stringify({ duration: result.duration }), 'utf8');

    return json(
      {
        success: true,
        audioUrl: `/voice-output/${character.id}/${fileName}`,
        duration: result.duration,
        backend: resolvedVoiceBackend,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    // TTS 失敗はチャットを止めない前提: 502 + message を返し、UI 側は警告表示のみ。
    console.error('[api/voice/speak] failed:', e);
    return json(
      { success: false, message: e instanceof Error ? e.message : 'voice generation failed' },
      { status: 502 },
    );
  }
};
