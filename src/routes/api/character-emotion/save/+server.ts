import { json, type RequestHandler } from '@sveltejs/kit';
import { saveEmotionState, type EmotionSaveInput } from '$lib/server/characterMemory';

function saveComment(input: { emotion: string; intensity: number; reason: string }): string {
  const seed = `${input.emotion}:${input.reason}:${Math.round(input.intensity * 100)}`.length % 4;
  const label = {
    happy: 'うれしい気持ち',
    thinking: '考えている気持ち',
    excited: 'わくわくした気持ち',
    curious: '知りたい気持ち',
    sleepy: '少し眠い気持ち',
    calm: '落ち着いた気持ち',
    worried: '少し心配な気持ち',
    sad: 'さみしい気持ち',
  }[input.emotion] ?? '今の気持ち';
  return [
    `${label}として、今のわたしの状態を残しました。`,
    `今日のわたしは${label}です。ちゃんと覚えておきます。`,
    `この会話のあとに残った${label}を、Emotionに保存しました。`,
    `次に話すとき、この${label}から自然につなげられそうです。`,
  ][seed];
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const source = body.source;
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (source !== 'emotion-review') return json({ message: 'source must be emotion-review' }, { status: 400 });

  try {
    const input: EmotionSaveInput = {
      emotion: body.emotion,
      reason: body.reason,
      intensity: body.intensity,
      confidence: body.confidence,
    };
    const { entry, saved } = saveEmotionState(characterId, input);
    const timestamp = new Date().toISOString();
    return json({
      ok: true,
      saved,
      emotion: entry.emotion,
      comment: saveComment(saved),
      timestamp,
      updatedAt: entry.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};
