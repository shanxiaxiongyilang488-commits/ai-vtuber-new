import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import {
  geminiFetchErrorMessage,
  geminiGenerateContentUrl,
  geminiParseJsonResponse,
  geminiUsageFromResponse,
  getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { getMemoryCharacter, saveExperienceNode, saveRoutineState } from '$lib/server/characterMemory';

const NIGHT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sleepComment: { type: 'STRING' },
    todaySummary: { type: 'STRING' },
    currentGoal: { type: 'STRING' },
  },
  required: ['sleepComment', 'todaySummary', 'currentGoal'],
};

const SYSTEM_PROMPT = [
  'You are Daily Routine System v1 Night Routine for Character Memory Chat.',
  'Generate Shiro\'s natural end-of-day sleep comment and a concise daily summary.',
  'Use the supplied conversation reviews, memory, relationship, emotion, and routine context.',
  'Goal Review is lightweight in v1: infer one currentGoal from today\'s continuity without inventing detailed plans.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"sleepComment":"","todaySummary":"","currentGoal":""}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });

  let entry;
  try {
    entry = getMemoryCharacter(characterId);
  } catch {
    return json({ message: 'character not found' }, { status: 404 });
  }

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  const now = new Date();
  const prompt = JSON.stringify({
    character: { id: entry.id, name: entry.name },
    currentTime: {
      iso: now.toISOString(),
      locale: Intl.DateTimeFormat('ja-JP', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(now),
      timezone: 'Asia/Tokyo',
    },
    review: {
      memoryReview: body.memoryReview ?? null,
      relationshipReview: body.relationshipReview ?? null,
      emotionReview: body.emotionReview ?? null,
    },
    recentMemories: entry.reviewMemory.slice(-10),
    relationships: entry.relationships.slice(-12),
    emotion: entry.emotion.current,
    routine: entry.routine,
  });
  const modelConfig = await getGeminiTextModelConfig();
  const startedAt = Date.now();

  try {
    const response = await fetch(
      geminiGenerateContentUrl(modelConfig.model, apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            // gemini-3.5-flash は thinking トークンも maxOutputTokens に含まれるため余裕を持たせる。
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: NIGHT_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Night Routine HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }
    const data = await response.json();
    const { parsed: parsedJson, raw } = geminiParseJsonResponse(data, {
      label: 'Night Routine',
      logTag: '[NIGHT_ROUTINE_RAW]',
      context: { characterId, model: modelConfig.model },
    });
    const parsed = asRecord(parsedJson);
    const sleepComment = typeof parsed.sleepComment === 'string' && parsed.sleepComment.trim()
      ? parsed.sleepComment.trim()
      : '今日のことを整理しました。少し休みますね。';
    const todaySummary = typeof parsed.todaySummary === 'string' ? parsed.todaySummary.trim() : '';
    const currentGoal = typeof parsed.currentGoal === 'string' ? parsed.currentGoal.trim() : entry.routine.todayGoal;
    const { routine } = saveRoutineState(characterId, {
      state: 'Sleeping',
      type: 'night',
      summary: sleepComment,
      todaySummary,
      todayGoal: currentGoal,
      lastSleepTime: new Date().toISOString(),
    });
    const latestEntry = getMemoryCharacter(characterId);
    const memoryIds = latestEntry.reviewMemory.slice(-8).map((memory) => memory.id);
    const relationshipIds = latestEntry.relationships.slice(-8).map((relationship) => relationship.id);
    const emotionIds = latestEntry.emotion.history.slice(-3).map((emotion) => emotion.id);
    const routineId = routine.log.at(-1)?.id;
    const memoryImportance = latestEntry.reviewMemory.slice(-8).reduce((max, memory) => Math.max(max, memory.importance), 0);
    const emotionImportance = latestEntry.emotion.current?.intensity ?? 0;
    const { experience } = saveExperienceNode(characterId, {
      memoryIds,
      relationshipIds,
      emotionIds,
      routineId,
      importance: Math.max(memoryImportance, emotionImportance, 0.5),
      summary: todaySummary || sleepComment,
    });
    const usage = geminiUsageFromResponse(data);
    return json({
      ok: true,
      sleepComment,
      todaySummary,
      currentGoal,
      routine,
      experience,
      cost: {
        provider: 'gemini',
        model: modelConfig.model,
        inputChars: SYSTEM_PROMPT.length + prompt.length,
        outputChars: raw.length,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimated: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = geminiFetchErrorMessage(error);
    return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
  }
};
