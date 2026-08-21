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
  MemoryRecord,
  MemoryReviewCandidate,
  MemoryReviewMessage,
  MemoryReviewRequest,
  MemoryReviewResponse,
	MemoryReviewTechnicalEvidence,
} from '$lib/memoryReview';

const MEMORY_REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    reflectionComment: { type: 'STRING' },
    importance: { type: 'NUMBER' },
    candidates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
          reason: { type: 'STRING' },
          importance: { type: 'NUMBER' },
          tags: { type: 'ARRAY', items: { type: 'STRING' } },
		  evidenceRefs: { type: 'ARRAY', items: { type: 'STRING' } },
        },
		required: ['title', 'summary', 'reason', 'importance', 'tags', 'evidenceRefs'],
      },
    },
  },
  required: ['summary', 'reflectionComment', 'importance', 'candidates'],
};

const SYSTEM_PROMPT = [
  'You are Memory Review System v1 for Character Memory Chat.',
  'Review the completed conversation semantically and decide what is worth preserving as long-term memory.',
  'Do not use keyword matching, regex, or rule-based filtering. Use meaning, context, and future usefulness.',
  'Exclude temporary small talk, transient mood, throwaway jokes, and one-off operational chatter.',
  'Consider project progress, character settings, user preferences, durable decisions, relationships, and information likely to be referenced later.',
	'Never treat an assistant/character statement as evidence for image-generation models, video-generation models, API names, providers, system architecture, system configuration, or other technical facts.',
	'Technical facts may be candidates only when the input technicalEvidence contains an exact supporting real log or metadata value. Cite its id in evidenceRefs and copy the exact model/API/provider identifier into the candidate summary.',
	'If a character says "DALL-E 3 was used" but technicalEvidence does not contain DALL-E 3, omit that claim completely. User or character confidence is not evidence.',
	'For non-technical candidates return evidenceRefs as an empty array.',
  'reflectionComment must be a short natural Japanese first-person comment from the character reviewing the day, based on the summary and candidates. Do not use a fixed template.',
  'importance must be a number from 0.0 to 1.0.',
  'Candidate importance policy: 0.80 or higher means save-worthy, 0.50 to 0.79 means user confirmation, below 0.50 should usually be omitted.',
  'Return exactly one JSON object. No markdown and no extra text.',
	'Schema: {"summary":"","reflectionComment":"","importance":0.0,"candidates":[{"title":"","summary":"","reason":"","importance":0.0,"tags":[],"evidenceRefs":[]}]}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
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
  const content = typeof data.content === 'string'
    ? data.content.trim()
    : typeof data.summary === 'string'
      ? data.summary.trim()
      : '';
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!content && !title) return null;
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

function normalizeCandidate(value: unknown): MemoryReviewCandidate | null {
  const data = asRecord(value);
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!title || !summary || !reason) return null;
  return {
    title,
    summary,
    reason,
    importance: clamp01(data.importance),
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 8)
      : [],
	evidenceRefs: Array.isArray(data.evidenceRefs)
	  ? data.evidenceRefs.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 8)
	  : [],
  };
}

const TECHNICAL_CLAIM_PATTERN = /(?:image\s*(?:generation\s*)?model|video\s*(?:generation\s*)?model|api|provider|system\s*(?:architecture|configuration)|画像生成(?:AI|モデル)?|動画生成(?:AI|モデル)?|API名|プロバイダ|システム構成|技術情報|dall[・\s-]*e|gpt[\s-]*image|nano[\s-]*banana|seedance|gemini|openai|fal\.ai)/iu;

function normalizeEvidence(value: unknown): MemoryReviewTechnicalEvidence | null {
	const data = asRecord(value);
	const id = typeof data.id === 'string' ? data.id.trim().slice(0, 180) : '';
	const kind = data.kind === 'api' || data.kind === 'provider' || data.kind === 'system' ? data.kind : data.kind === 'model' ? 'model' : null;
	const key = typeof data.key === 'string' ? data.key.trim().slice(0, 120) : '';
	const evidenceValue = typeof data.value === 'string' ? data.value.trim().slice(0, 300) : '';
	const source = typeof data.source === 'string' ? data.source.trim().slice(0, 180) : '';
	return id && kind && key && evidenceValue && source ? { id, kind, key, value: evidenceValue, source } : null;
}

function canonicalTechnicalValue(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9一-龠ぁ-んァ-ヶ]+/gu, '');
}

function candidateHasTechnicalEvidence(candidate: MemoryReviewCandidate, evidence: MemoryReviewTechnicalEvidence[]): boolean {
	const candidateText = `${candidate.title} ${candidate.summary} ${candidate.reason} ${candidate.tags.join(' ')}`;
	if (!TECHNICAL_CLAIM_PATTERN.test(candidateText)) return true;
	const refs = new Set(candidate.evidenceRefs ?? []);
	const canonicalCandidate = canonicalTechnicalValue(candidateText);
	return evidence.some((item) => {
		const canonicalValue = canonicalTechnicalValue(item.value);
		return refs.has(item.id) && canonicalValue.length >= 3 && canonicalCandidate.includes(canonicalValue);
	});
}

function normalizeReview(
  value: unknown,
  inputChars: number,
  outputChars: number,
  model: string,
  latencyMs: number,
  usage: ReturnType<typeof geminiUsageFromResponse>,
	technicalEvidence: MemoryReviewTechnicalEvidence[],
): MemoryReviewResponse {
  const data = asRecord(value);
  const candidates = Array.isArray(data.candidates)
	? data.candidates.map(normalizeCandidate).filter((candidate): candidate is MemoryReviewCandidate => Boolean(candidate)).filter((candidate) => {
		const accepted = candidateHasTechnicalEvidence(candidate, technicalEvidence);
		if (!accepted) console.warn('[MEMORY_REVIEW_TECHNICAL_CANDIDATE_REJECTED]', { title: candidate.title, summary: candidate.summary, evidenceRefs: candidate.evidenceRefs });
		return accepted;
	  })
    : [];
  return {
    summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : '会話から長期記憶候補を抽出しました。',
    reflectionComment: typeof data.reflectionComment === 'string' ? data.reflectionComment.trim() : '',
    importance: clamp01(data.importance),
    candidates: candidates.slice(0, 6),
	technicalEvidence,
    cost: {
      provider: 'gemini',
      model,
      inputChars,
      outputChars,
      latencyMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimated: true,
    },
    timestamp: new Date().toISOString(),
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

  const input: MemoryReviewRequest = {
    characterId,
    conversation,
    currentMemory: Array.isArray(body.currentMemory)
      ? body.currentMemory.map(normalizeMemory).filter((memory): memory is MemoryRecord => Boolean(memory)).slice(-40)
      : [],
    battery: typeof body.battery === 'number' && Number.isFinite(body.battery) ? body.battery : undefined,
    emotion: typeof body.emotion === 'string' ? body.emotion : undefined,
    mindState: typeof body.mindState === 'string' ? body.mindState : undefined,
	technicalEvidence: Array.isArray(body.technicalEvidence)
	  ? body.technicalEvidence.map(normalizeEvidence).filter((item): item is MemoryReviewTechnicalEvidence => Boolean(item)).slice(-80)
	  : [],
  };

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  const prompt = JSON.stringify(input);
  const modelConfig = await getGeminiTextModelConfig();
  if (modelConfig.normalizedFrom) {
    console.log('[GEMINI_MODEL_NORMALIZED]', {
      from: modelConfig.normalizedFrom,
      to: modelConfig.model,
      source: modelConfig.source,
      surface: 'memory-review',
    });
  }
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
            responseSchema: MEMORY_REVIEW_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Memory Review HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }
    const data = await response.json();
    const latencyMs = Date.now() - startedAt;
    const { parsed, raw } = geminiParseJsonResponse(data, {
      label: 'Memory Review',
      logTag: '[MEMORY_REVIEW_RAW]',
      context: { model: modelConfig.model },
    });
    const usage = geminiUsageFromResponse(data);
	const result = normalizeReview(parsed, SYSTEM_PROMPT.length + prompt.length, raw.length, modelConfig.model, latencyMs, usage, input.technicalEvidence ?? []);
    console.log('[MEMORY_REVIEW_JSON]', result);
    return json(result);
  } catch (error) {
    const message = geminiFetchErrorMessage(error);
    console.warn('[MEMORY_REVIEW_ERROR]', {
      message,
      model: modelConfig.model,
      modelSource: modelConfig.source,
      normalizedFrom: modelConfig.normalizedFrom,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.model}:generateContent`,
      latencyMs: Date.now() - startedAt,
    });
    return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
  }
};
