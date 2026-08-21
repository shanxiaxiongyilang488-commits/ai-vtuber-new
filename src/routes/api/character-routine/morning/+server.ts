import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import {
  geminiFetchErrorMessage,
  geminiGenerateContentUrl,
  geminiParseJsonResponse,
  geminiUsageFromResponse,
  getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { getMemoryCharacter, saveRoutineState } from '$lib/server/characterMemory';

const MORNING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    greeting: { type: 'STRING' },
    todaySummary: { type: 'STRING' },
    todayGoal: { type: 'STRING' },
  },
  required: ['greeting', 'todaySummary', 'todayGoal'],
};

const SYSTEM_PROMPT = [
  'You are Daily Routine System v1 for Character Memory Chat.',
  'Generate Shiro\'s natural greeting for the current time of day using semantic understanding.',
  'Do not use hard-coded greeting rules. Use the supplied current time, memory, relationship, emotion, and routine context.',
  'Summarize what matters from previous memories and relationships as Shiro\'s morning orientation.',
  'Suggest one useful todayGoal based on continuity, not as a command.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"greeting":"","todaySummary":"","todayGoal":""}',
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
    character: { id: entry.id, name: entry.name, role: entry.role, description: entry.description },
    currentTime: {
      iso: now.toISOString(),
      locale: Intl.DateTimeFormat('ja-JP', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(now),
      timezone: 'Asia/Tokyo',
    },
    recentMemories: entry.reviewMemory.slice(-8),
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
            responseSchema: MORNING_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Morning Routine HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }
    const data = await response.json();
    const { parsed: parsedJson, raw } = geminiParseJsonResponse(data, {
      label: 'Morning Routine',
      logTag: '[MORNING_ROUTINE_RAW]',
      context: { characterId, model: modelConfig.model },
    });
    const parsed = asRecord(parsedJson);
    const greeting = typeof parsed.greeting === 'string' && parsed.greeting.trim()
      ? parsed.greeting.trim()
      : 'おはようございます。今日も一緒に少しずつ進めていきましょう。';
    const todaySummary = typeof parsed.todaySummary === 'string' ? parsed.todaySummary.trim() : '';
    const todayGoal = typeof parsed.todayGoal === 'string' ? parsed.todayGoal.trim() : '';
    const { routine } = saveRoutineState(characterId, {
      state: 'Morning',
      type: 'morning',
      summary: greeting,
      todaySummary,
      todayGoal,
      morningGreeting: greeting,
    });
    const usage = geminiUsageFromResponse(data);
    return json({
      ok: true,
      greeting,
      todaySummary,
      todayGoal,
      routine,
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
