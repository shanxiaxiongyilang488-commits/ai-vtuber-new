import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';

type IntentType = 'chat' | 'image' | 'manga' | 'yaml' | 'memory' | 'voice';

interface GeminiRouterResult {
  intent: IntentType;
  action: string;
  generate_image: boolean;
  generate_yaml: boolean;
  generate_manga: boolean;
  confidence: number;
  reason: string;
  matched_rule: string;
  matched_keywords: string[];
  negative_keywords: string[];
  score_breakdown: Record<string, number | boolean | string>;
}

const GEMINI_ROUTER_MODEL = 'gemini-2.5-flash';
const VALID_INTENTS = new Set<IntentType>(['chat', 'image', 'manga', 'yaml', 'memory', 'voice']);
const GENERATION_NEGATIVE_KEYWORDS = [
  '生成しない',
  '画像生成しない',
  '作成しない',
  '描かない',
  '出力しない',
  '漫画化しない',
  'YAML化しない',
  '資料集化しない',
] as const;

const SYSTEM_PROMPT = [
  'You are the final intent router for a Japanese AI assistant.',
  'Analyze intent only. Never execute any action.',
  'Allowed intents: chat, image, manga, yaml, memory, voice.',
  'action must be a concise identifier describing the intended next action.',
  'Set generate_image true only when image generation is requested.',
  'Set generate_yaml true only when YAML generation is requested.',
  'Set generate_manga true only when manga generation is requested.',
  'Requests ending in 漫画化 or マンガ化, including 1ページ漫画化 and このStoryを漫画化, must use intent "manga", action "generate_manga_page", generate_image true, and generate_manga true.',
  'If any generation-negation phrase is present, set generate_image, generate_yaml, and generate_manga all to false.',
  `Generation-negation phrases: ${GENERATION_NEGATIVE_KEYWORDS.join(', ')}.`,
  'confidence must be a number from 0.0 to 1.0.',
  'reason must be a short Japanese explanation based only on the user input.',
  'matched_rule must name the decisive classification rule in concise English.',
  'matched_keywords must contain every user-input phrase that positively contributed to the decision.',
  'negative_keywords must contain every phrase or condition that opposed or could suppress the selected intent. Use [] when none.',
  'score_breakdown must explain all confidence contributions as a flat JSON object of numbers, booleans, or short strings.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"intent":"","action":"","generate_image":false,"generate_yaml":false,"generate_manga":false,"confidence":0.0,"reason":"","matched_rule":"","matched_keywords":[],"negative_keywords":[],"score_breakdown":{}}',
].join('\n');

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Gemini Router response was not JSON');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function findGenerationNegativeKeywords(text: string): string[] {
  const normalized = text.replace(/\s+/g, '').toLocaleLowerCase('ja-JP');
  const matches = GENERATION_NEGATIVE_KEYWORDS
    .filter((keyword) => normalized.includes(keyword.toLocaleLowerCase('ja-JP')))
    .sort((left, right) => right.length - left.length);
  return matches.filter((keyword, index) =>
    !matches.slice(0, index).some((specific) =>
      specific.toLocaleLowerCase('ja-JP').includes(keyword.toLocaleLowerCase('ja-JP')),
    ),
  );
}

function applyGenerationNegationGuard(text: string, result: GeminiRouterResult): GeminiRouterResult {
  const negativeKeywords = findGenerationNegativeKeywords(text);
  if (negativeKeywords.length === 0) return result;
  return {
    ...result,
    generate_image: false,
    generate_yaml: false,
    generate_manga: false,
    negative_keywords: Array.from(new Set([...result.negative_keywords, ...negativeKeywords])),
    score_breakdown: {
      ...result.score_breakdown,
      generation_negation_guard: true,
      forced_generate_image: false,
      forced_generate_yaml: false,
      forced_generate_manga: false,
    },
    reason: `${result.reason} 生成否定表現（${negativeKeywords.join('、')}）を検出したため生成フラグを無効化`,
  };
}

function normalizeResult(value: unknown): GeminiRouterResult {
  const data = value as Partial<GeminiRouterResult> | null;
  if (!data || typeof data.intent !== 'string' || !VALID_INTENTS.has(data.intent as IntentType)) {
    throw new Error('Gemini Router returned an invalid intent');
  }
  if (typeof data.action !== 'string' || !data.action.trim()) {
    throw new Error('Gemini Router returned an invalid action');
  }
  if (
    typeof data.generate_image !== 'boolean'
    || typeof data.generate_yaml !== 'boolean'
    || typeof data.generate_manga !== 'boolean'
  ) {
    throw new Error('Gemini Router returned invalid generation flags');
  }
  if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence)) {
    throw new Error('Gemini Router returned an invalid confidence');
  }
  if (typeof data.reason !== 'string' || !data.reason.trim()) {
    throw new Error('Gemini Router returned an invalid reason');
  }
  return {
    intent: data.intent as IntentType,
    action: data.action.trim(),
    generate_image: data.generate_image,
    generate_yaml: data.generate_yaml,
    generate_manga: data.generate_manga,
    confidence: Math.min(1, Math.max(0, data.confidence)),
    reason: data.reason.trim(),
    matched_rule: typeof data.matched_rule === 'string' ? data.matched_rule.trim() : '',
    matched_keywords: Array.isArray(data.matched_keywords)
      ? data.matched_keywords.filter((value): value is string => typeof value === 'string')
      : [],
    negative_keywords: Array.isArray(data.negative_keywords)
      ? data.negative_keywords.filter((value): value is string => typeof value === 'string')
      : [],
    score_breakdown: data.score_breakdown && typeof data.score_breakdown === 'object'
      ? data.score_breakdown as Record<string, number | boolean | string>
      : {},
  };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ message: 'text is required' }, { status: 400 });

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ROUTER_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 400,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Gemini Router HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }
    const data = await response.json();
    const raw = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    if (!raw.trim()) throw new Error('Gemini Router returned an empty response');
    const result = applyGenerationNegationGuard(text, normalizeResult(extractJson(raw)));
    console.log('[GEMINI_ROUTER_RESULT]', result);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[GEMINI_ROUTER_ERROR]', message);
    return json({ message }, { status: 502 });
  }
};
