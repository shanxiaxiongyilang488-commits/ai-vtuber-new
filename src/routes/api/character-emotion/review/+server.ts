import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import {
  geminiFetchErrorMessage,
  geminiGenerateContentUrl,
  geminiParseJsonResponse,
  geminiUsageFromResponse,
  getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import type {
  BrainEmotionState,
  EmotionReviewResponse,
  EmotionType,
  MemoryRecord,
  MemoryReviewMessage,
} from '$lib/memoryReview';

const EMOTION_VALUES = ['happy', 'thinking', 'excited', 'curious', 'sleepy', 'calm', 'worried', 'sad'] as const;

const EMOTION_REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    emotion: { type: 'STRING', enum: EMOTION_VALUES },
    reason: { type: 'STRING' },
    intensity: { type: 'NUMBER' },
    confidence: { type: 'NUMBER' },
  },
  required: ['emotion', 'reason', 'intensity', 'confidence'],
};

const SYSTEM_PROMPT = [
  'You are Emotion Brain System v1 for Character Memory Chat.',
  'Review the whole conversation semantically and judge how Shiro currently feels.',
  'Emotion is Shiro\'s own emotional state, separate from event memory and relationship understanding.',
  'Do not use keyword matching, regex, or rule-based filtering. Use meaning, context, progress, uncertainty, and tone.',
  'Choose exactly one emotion from: happy, thinking, excited, curious, sleepy, calm, worried, sad.',
  'reason must explain why Shiro feels that way in natural Japanese.',
  'intensity and confidence must be numbers from 0.0 to 1.0.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"emotion":"calm","reason":"","intensity":0.0,"confidence":0.0}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function isEmotion(value: unknown): value is EmotionType {
  return typeof value === 'string' && (EMOTION_VALUES as readonly string[]).includes(value);
}

function normalizeMessage(value: unknown): MemoryReviewMessage | null {
  const data = asRecord(value);
  const role = data.role === 'assistant' || data.role === 'system' ? data.role : data.role === 'user' ? 'user' : null;
  const text = typeof data.text === 'string'
    ? data.text.trim()
    : typeof data.content === 'string'
      ? data.content.trim()
      : '';
  if (!role || !text) return null;
  return {
    role,
    text: text.slice(0, 3000),
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
  };
}

function normalizeMemory(value: unknown): MemoryRecord | null {
  const data = asRecord(value);
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const content = typeof data.content === 'string'
    ? data.content.trim()
    : typeof data.summary === 'string'
      ? data.summary.trim()
      : '';
  if (!title && !content) return null;
  return {
    id: typeof data.id === 'string' ? data.id : undefined,
    title,
    content,
    summary: typeof data.summary === 'string' ? data.summary.trim() : undefined,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    importance: typeof data.importance === 'number' ? data.importance : undefined,
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
  };
}

function normalizeCurrentEmotion(value: unknown): BrainEmotionState | null {
  const data = asRecord(value);
  if (!isEmotion(data.emotion)) return null;
  return {
    id: typeof data.id === 'string' ? data.id : '',
    emotion: data.emotion,
    reason: typeof data.reason === 'string' ? data.reason : '',
    intensity: clamp01(data.intensity),
    confidence: clamp01(data.confidence),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
  };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const conversation = Array.isArray(body.conversation)
    ? body.conversation.map(normalizeMessage).filter((message): message is MemoryReviewMessage => Boolean(message)).slice(-40)
    : [];
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (conversation.length === 0) return json({ message: 'conversation is required' }, { status: 400 });

  const input = {
    characterId,
    conversation,
    currentEmotion: normalizeCurrentEmotion(body.currentEmotion),
    recentMemories: Array.isArray(body.recentMemories)
      ? body.recentMemories.map(normalizeMemory).filter((memory): memory is MemoryRecord => Boolean(memory)).slice(-20)
      : [],
  };

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  const prompt = JSON.stringify(input);
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
            temperature: 0,
            // gemini-3.5-flash は thinking トークンも maxOutputTokens に含まれるため余裕を持たせる。
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: EMOTION_REVIEW_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Emotion Review HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }
    const data = await response.json();
    const { parsed: parsedJson, raw } = geminiParseJsonResponse(data, {
      label: 'Emotion Review',
      logTag: '[EMOTION_REVIEW_RAW]',
      context: { characterId, model: modelConfig.model },
    });
    const parsed = asRecord(parsedJson);
    const usage = geminiUsageFromResponse(data);
    const result: EmotionReviewResponse = {
      emotion: isEmotion(parsed.emotion) ? parsed.emotion : 'calm',
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : '会話全体から落ち着いた状態だと判断しました。',
      intensity: clamp01(parsed.intensity),
      confidence: clamp01(parsed.confidence),
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
    };
    console.log('[EMOTION_REVIEW_JSON]', result);
    return json(result);
  } catch (error) {
    const message = geminiFetchErrorMessage(error);
    console.warn('[EMOTION_REVIEW_ERROR]', {
      message,
      model: modelConfig.model,
      latencyMs: Date.now() - startedAt,
    });
    return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
  }
};
