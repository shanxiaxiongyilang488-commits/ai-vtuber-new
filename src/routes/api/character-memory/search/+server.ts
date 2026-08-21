import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import {
  geminiFetchErrorMessage,
  geminiGenerateContentUrl,
  geminiParseJsonResponse,
  getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import type { CharacterMemorySearchHit, CharacterMemorySearchResponse } from '$lib/memoryReview';

const MEMORY_SEARCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    memories: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          relevance: { type: 'NUMBER' },
          reason: { type: 'STRING' },
        },
        required: ['id', 'relevance', 'reason'],
      },
    },
  },
  required: ['memories'],
};

const SYSTEM_PROMPT = [
  'You are Memory Search Phase 4 for Character Memory Chat.',
  'Select memories that are semantically relevant to the current user message.',
  'Do not use keyword matching, regex, string overlap, or rule-based filtering.',
  'Judge by meaning, context, continuity, likely usefulness for the next reply, and what the character would naturally remember.',
  'Return only memories that should be useful context for answering now.',
  'If no memory is meaningfully relevant, return an empty memories array.',
  'relevance must be a number from 0.0 to 1.0.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"memories":[{"id":"","relevance":0.0,"reason":""}]}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 3000) : '';
  const limit = Math.max(1, Math.min(12, Math.trunc(Number(body.limit) || 5)));
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (!query) return json({ message: 'query is required' }, { status: 400 });

  let entry;
  try {
    entry = getMemoryCharacter(characterId);
  } catch {
    return json({ message: 'character not found' }, { status: 404 });
  }

  const sourceMemories = entry.reviewMemory
    .slice(-100)
    .reverse()
    .map((memory) => ({
      id: memory.id,
      title: memory.title,
      summary: memory.summary,
      reason: memory.reason ?? '',
      importance: memory.importance,
      tags: memory.tags,
      createdAt: memory.createdAt,
    }));

  if (sourceMemories.length === 0) {
    return json({ memories: [] } satisfies CharacterMemorySearchResponse);
  }

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  const modelConfig = await getGeminiTextModelConfig();
  const prompt = JSON.stringify({
    character: { id: entry.id, name: entry.name },
    query,
    limit,
    memories: sourceMemories,
  });
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
            // gemini-3.5-flash は thinking トークンも maxOutputTokens に含まれる。
            // 900 では思考(600〜800tok)が予算を食い潰しJSONが途中で切断されるため余裕を持たせる。
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: MEMORY_SEARCH_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Memory Search HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }

    const data = await response.json();
    const { parsed: parsedJson } = geminiParseJsonResponse(data, {
      label: 'Memory Search',
      logTag: '[MEMORY_SEARCH_RAW]',
      context: { characterId: entry.id, model: modelConfig.model },
    });
    const parsed = asRecord(parsedJson);
    const byId = new Map(sourceMemories.map((memory) => [memory.id, memory]));
    const seen = new Set<string>();
    const memories = (Array.isArray(parsed.memories) ? parsed.memories : [])
      .flatMap((value): CharacterMemorySearchHit[] => {
        const candidate = asRecord(value);
        const id = typeof candidate.id === 'string' ? candidate.id : '';
        const source = byId.get(id);
        if (!source || seen.has(id)) return [];
        seen.add(id);
        return [{
          id: source.id,
          title: source.title,
          summary: source.summary,
          relevance: clamp01(candidate.relevance),
          createdAt: source.createdAt,
          tags: source.tags,
        }];
      })
      .filter((memory) => memory.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    console.log('[MEMORY_SEARCH_JSON]', {
      characterId: entry.id,
      query,
      hitCount: memories.length,
      topRelevance: memories[0]?.relevance ?? 0,
      memoryIds: memories.map((memory) => memory.id),
      model: modelConfig.model,
      latencyMs: Date.now() - startedAt,
    });
    return json({ memories } satisfies CharacterMemorySearchResponse);
  } catch (error) {
    const message = geminiFetchErrorMessage(error);
    console.warn('[MEMORY_SEARCH_ERROR]', {
      message,
      characterId: entry.id,
      model: modelConfig.model,
      latencyMs: Date.now() - startedAt,
    });
    return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
  }
};
