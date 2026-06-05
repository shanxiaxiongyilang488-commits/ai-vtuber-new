import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';

type IntentType = 'chat' | 'image' | 'manga' | 'yaml' | 'memory' | 'voice';

interface IntentResult {
  intent: IntentType;
  subtype?: string;
  confidence: number;
  reason?: string;
  source?: 'rules' | 'gemini';
}

const GEMINI_INTENT_MODEL = 'gemini-3-flash-preview';
const VALID_INTENTS = new Set<IntentType>(['chat', 'image', 'manga', 'yaml', 'memory', 'voice']);

const SYSTEM_PROMPT = [
  'You are an intent router for a Japanese AI assistant UI.',
  'Classify the user message into exactly one intent.',
  'Allowed intents: chat, image, manga, yaml, memory, voice.',
  'For image intent, choose subtype when possible: illustration, character_sheet, setting_sheet, manga_page, poster, cover.',
  'Include a short Japanese reason explaining the detected phrase or clue.',
  'Return JSON only. No markdown, no explanation, no extra text.',
  'Schema: {"intent":"chat|image|manga|yaml|memory|voice","subtype":"...","confidence":0.0,"reason":"..."}',
].join('\n');

function fallbackIntent(confidence = 0.55): IntentResult {
  const result: IntentResult = { intent: 'chat', confidence, reason: 'Gemini Routerで分類できませんでした', source: 'gemini' };
  logIntentResult(result);
  return result;
}

function routedTo(intent: IntentType): 'chat' | 'image' | 'manga' | 'yaml' {
  if (intent === 'image' || intent === 'manga' || intent === 'yaml') return intent;
  return 'chat';
}

function logIntentResult(result: IntentResult): void {
  console.log('[INTENT RESULT]', result.intent);
  console.log('[INTENT SUBTYPE]', result.subtype);
  console.log('[ROUTED TO]', routedTo(result.intent));
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  console.log('[intent-router] JSON.parse input:', trimmed);
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Gemini intent response was not JSON');
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeIntentResult(value: unknown): IntentResult {
  const data = value as Partial<IntentResult> | null;
  const intent = typeof data?.intent === 'string' && VALID_INTENTS.has(data.intent as IntentType)
    ? data.intent as IntentType
    : 'chat';
  const confidence = typeof data?.confidence === 'number' && Number.isFinite(data.confidence)
    ? Math.min(1, Math.max(0, data.confidence))
    : 0.55;
  const subtype = typeof data?.subtype === 'string' && data.subtype.trim()
    ? data.subtype.trim()
    : undefined;
  const reason = typeof data?.reason === 'string' && data.reason.trim()
    ? data.reason.trim()
    : 'Gemini Routerで分類';
  return { intent, subtype, confidence, reason, source: 'gemini' };
}

export const POST: RequestHandler = async ({ request }) => {
  let text = '';
  try {
    const body = await request.json();
    text = typeof body?.text === 'string' ? body.text : '';
  } catch {
    return json(fallbackIntent(0.5), { status: 400 });
  }

  if (!text.trim()) return json(fallbackIntent(0.5));
  const geminiApiKey = await getProviderKey('gemini');
  if (!geminiApiKey) {
    console.warn('[intent-router] Gemini API key is not set');
    return json(fallbackIntent(0.55));
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_INTENT_MODEL}:generateContent?key=${geminiApiKey}`;
  try {
    console.log('[intent-router] Gemini system prompt:', SYSTEM_PROMPT);
    console.log('[intent-router] Gemini user prompt:', text);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text }],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 120,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => `HTTP ${res.status}`);
      console.warn('[intent-router] Gemini HTTP error:', res.status, errorText.slice(0, 240));
      return json(fallbackIntent(0.55));
    }

    const data = await res.json();
    console.log('[intent-router] Gemini raw response:', JSON.stringify(data));
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log('[intent-router] Gemini raw text:', rawText);
    if (!rawText.trim()) return json(fallbackIntent(0.55));

    const result = normalizeIntentResult(extractJson(rawText));
    logIntentResult(result);
    return json(result);
  } catch (error) {
    console.warn('[intent-router] Gemini classify failed:', error);
    return json(fallbackIntent(0.55));
  }
};
