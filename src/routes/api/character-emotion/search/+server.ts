import { json, type RequestHandler } from '@sveltejs/kit';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import type { EmotionSearchResponse } from '$lib/memoryReview';

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });

  try {
    const startedAt = Date.now();
    const entry = getMemoryCharacter(characterId);
    console.log('[EMOTION_SEARCH_JSON]', {
      characterId: entry.id,
      emotion: entry.emotion.current?.emotion ?? null,
      intensity: entry.emotion.current?.intensity ?? 0,
      confidence: entry.emotion.current?.confidence ?? 0,
      historyCount: entry.emotion.history.length,
      latencyMs: Date.now() - startedAt,
    });
    return json({ emotion: entry.emotion } satisfies EmotionSearchResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};
