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
  MemoryReviewMessage,
  RelationshipItem,
  RelationshipReviewResponse,
  RelationshipUpdate,
} from '$lib/memoryReview';

const RELATIONSHIP_REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    updates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          key: { type: 'STRING' },
          value: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          reason: { type: 'STRING' },
        },
        required: ['category', 'key', 'value', 'confidence', 'reason'],
      },
    },
  },
  required: ['summary', 'updates'],
};

const SYSTEM_PROMPT = [
  'You are Relationship Memory System v1 for Character Memory Chat.',
  '重要: 入力言語にかかわらず、出力する全ての文字列は自然な日本語にする。固有名詞や製品名を除き、英語の文や英語の項目名を出力しない。',
  'summary、category、key、value、reasonはすべて日本語で書く。categoryは「好み」「価値観」「会話スタイル」「関心」「協力方法」「避けたいこと」などの短い日本語にする。',
  'keyはsnake_caseや英語識別子ではなく、画面にそのまま表示できる短い日本語の見出しにする。',
  'Review the completed conversation semantically and extract only durable understanding about the user.',
  'Memory is events. Relationship is understanding of the person: preferences, values, priorities, disliked things, conversation style, recurring interests, and how they like to collaborate.',
  'Do not use keyword matching, regex, or rule-based filtering. Use meaning, context, and long-term usefulness.',
  'Exclude project events that are only progress notes unless they reveal the user preference, value, priority, or style behind the event.',
  'Only include updates that the character could naturally use in future replies to understand the user better.',
  'confidence must be a number from 0.0 to 1.0.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"summary":"","updates":[{"category":"","key":"","value":"","confidence":0.0,"reason":""}]}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function containsJapanese(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
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

function normalizeRelationshipItem(value: unknown): RelationshipItem | null {
  const data = asRecord(value);
  const category = typeof data.category === 'string' ? data.category.trim() : '';
  const key = typeof data.key === 'string' ? data.key.trim() : '';
  const valueText = typeof data.value === 'string' ? data.value.trim() : '';
  if (!category || !key || !valueText) return null;
  return {
    id: typeof data.id === 'string' ? data.id : '',
    category,
    key,
    value: valueText,
    confidence: clamp01(data.confidence),
    reason: typeof data.reason === 'string' ? data.reason.trim() : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
  };
}

function normalizeUpdate(value: unknown): RelationshipUpdate | null {
  const data = asRecord(value);
  const category = typeof data.category === 'string' ? data.category.trim() : '';
  const key = typeof data.key === 'string' ? data.key.trim() : '';
  const valueText = typeof data.value === 'string' ? data.value.trim() : '';
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!category || !key || !valueText || !reason) return null;
  // Never allow an English-only review to become user-facing long-term memory.
  if (![category, key, valueText, reason].every(containsJapanese)) return null;
  return {
    category,
    key,
    value: valueText,
    confidence: clamp01(data.confidence),
    reason,
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

  const currentRelationship = asRecord(body.currentRelationship);
  const currentItems = Array.isArray(currentRelationship.items)
    ? currentRelationship.items.map(normalizeRelationshipItem).filter((item): item is RelationshipItem => Boolean(item)).slice(-80)
    : [];

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  const prompt = JSON.stringify({ characterId, conversation, currentRelationship: { items: currentItems } });
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
            responseSchema: RELATIONSHIP_REVIEW_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Relationship Review HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }
    const data = await response.json();
    const { parsed: parsedJson, raw } = geminiParseJsonResponse(data, {
      label: 'Relationship Review',
      logTag: '[RELATIONSHIP_REVIEW_RAW]',
      context: { characterId, model: modelConfig.model },
    });
    const parsed = asRecord(parsedJson);
    const updates = Array.isArray(parsed.updates)
      ? parsed.updates.map(normalizeUpdate).filter((update): update is RelationshipUpdate => Boolean(update)).slice(0, 8)
      : [];
    const usage = geminiUsageFromResponse(data);
    const result: RelationshipReviewResponse = {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() && containsJapanese(parsed.summary)
        ? parsed.summary.trim()
        : 'ユーザーについて長期的に覚える価値のある理解を整理しました。',
      updates,
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
    console.log('[RELATIONSHIP_REVIEW_JSON]', result);
    return json(result);
  } catch (error) {
    const message = geminiFetchErrorMessage(error);
    console.warn('[RELATIONSHIP_REVIEW_ERROR]', {
      message,
      model: modelConfig.model,
      latencyMs: Date.now() - startedAt,
    });
    return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
  }
};
