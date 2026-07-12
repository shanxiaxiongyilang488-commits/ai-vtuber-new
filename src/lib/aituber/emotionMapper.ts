import type { AvatarEmotion } from './types.ts';

const EMOTION_PATTERNS: Array<[AvatarEmotion, RegExp]> = [
  ['happy', /happy|happiness|joy|joyful|excited|smile|嬉|楽し|喜|幸せ|笑/u],
  ['sad', /sad|sadness|sorrow|worried|worry|lonely|sleepy|悲|寂|心配|不安|落ち込/u],
  ['angry', /angry|anger|mad|irritated|annoyed|怒|苛立|不機嫌/u],
  ['surprised', /surprised|surprise|shocked|astonished|驚|びっくり|意外/u],
  ['neutral', /neutral|calm|normal|穏やか|平静|通常/u],
];

function emotionText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return ['emotion', 'label', 'tone', 'name', 'state']
    .map((key) => typeof record[key] === 'string' ? String(record[key]) : '')
    .filter(Boolean)
    .join(' ');
}

/** 既存レスポンス／Character Memoryの感情だけを5種類へ縮約する。推論APIは呼ばない。 */
export function mapExistingEmotion(value: unknown): AvatarEmotion {
  const text = emotionText(value).toLowerCase();
  if (!text) return 'neutral';
  return EMOTION_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'neutral';
}

