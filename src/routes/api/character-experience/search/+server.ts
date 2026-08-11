import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import {
  geminiFetchErrorMessage,
  geminiGenerateContentUrl,
  geminiParseJsonResponse,
  getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import type { ExperienceSearchHit, ExperienceSearchResponse } from '$lib/memoryReview';

const EXPERIENCE_SEARCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    experiences: {
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
  required: ['experiences'],
};

const SYSTEM_PROMPT = [
  'You are Brain Graph Experience Search for Character Memory Chat.',
  'Experience nodes bind Memory, Relationship, Emotion, Routine, and future Goals.',
  'Select experiences semantically relevant to the current user message.',
  'Do not use keyword matching, regex, string overlap, or rule-based filtering.',
  'Judge by meaning, continuity, emotional context, and usefulness for the next character reply.',
  'If relevant experiences exist, the character should answer from the experience as a whole, not by quoting isolated memories.',
  'If no experience is meaningfully relevant, return an empty experiences array.',
  'relevance must be 0.0 to 1.0.',
  'Return exactly one JSON object. No markdown and no extra text.',
  'Schema: {"experiences":[{"id":"","relevance":0.0,"reason":""}]}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
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
  const limit = Math.max(1, Math.min(8, Math.trunc(Number(body.limit) || 4)));
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
  if (!query) return json({ message: 'query is required' }, { status: 400 });

  let entry;
  try {
    entry = getMemoryCharacter(characterId);
  } catch {
    return json({ message: 'character not found' }, { status: 404 });
  }

  const graph = {
    memory: entry.reviewMemory.map((item) => item.id),
    relationship: entry.relationships.map((item) => item.id),
    emotion: entry.emotion.history.map((item) => item.id),
    routine: entry.routine.log.map((item) => item.id),
    experience: entry.experiences.map((item) => item.id),
  };

  const sourceExperiences = entry.experiences
    .slice(-80)
    .reverse()
    .map((experience) => ({
      ...experience,
      linked: {
        memories: experience.memoryIds
          .map((id) => entry.reviewMemory.find((item) => item.id === id))
          .filter(Boolean)
          .map((item) => ({ id: item!.id, title: item!.title, summary: item!.summary, importance: item!.importance })),
        relationships: experience.relationshipIds
          .map((id) => entry.relationships.find((item) => item.id === id))
          .filter(Boolean)
          .map((item) => ({ id: item!.id, key: item!.key, value: item!.value, confidence: item!.confidence })),
        emotions: experience.emotionIds
          .map((id) => entry.emotion.history.find((item) => item.id === id))
          .filter(Boolean)
          .map((item) => ({ id: item!.id, emotion: item!.emotion, intensity: item!.intensity, reason: item!.reason })),
        routine: experience.routineId ? entry.routine.log.find((item) => item.id === experience.routineId) ?? null : null,
      },
    }));

  if (sourceExperiences.length === 0) {
    return json({ experiences: [], graph } satisfies ExperienceSearchResponse);
  }

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

  const modelConfig = await getGeminiTextModelConfig();
  const prompt = JSON.stringify({
    character: { id: entry.id, name: entry.name },
    query,
    limit,
    experiences: sourceExperiences,
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
            // gemini-3.5-flash は thinking トークンも maxOutputTokens に含まれるため余裕を持たせる。
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: EXPERIENCE_SEARCH_SCHEMA,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Experience Search HTTP ${response.status}: ${errorText.slice(0, 240)}`);
    }

    const data = await response.json();
    const { parsed: parsedJson } = geminiParseJsonResponse(data, {
      label: 'Experience Search',
      logTag: '[EXPERIENCE_SEARCH_RAW]',
      context: { characterId: entry.id, model: modelConfig.model },
    });
    const parsed = asRecord(parsedJson);
    const byId = new Map(entry.experiences.map((experience) => [experience.id, experience]));
    const seen = new Set<string>();
    const experiences = (Array.isArray(parsed.experiences) ? parsed.experiences : [])
      .flatMap((value): ExperienceSearchHit[] => {
        const candidate = asRecord(value);
        const id = typeof candidate.id === 'string' ? candidate.id : '';
        const source = byId.get(id);
        if (!source || seen.has(id)) return [];
        seen.add(id);
        return [{ ...source, relevance: clamp01(candidate.relevance) }];
      })
      .filter((experience) => experience.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    console.log('[EXPERIENCE_SEARCH_JSON]', {
      characterId: entry.id,
      query,
      hitCount: experiences.length,
      topRelevance: experiences[0]?.relevance ?? 0,
      experienceIds: experiences.map((experience) => experience.id),
      model: modelConfig.model,
      latencyMs: Date.now() - startedAt,
    });
    return json({ experiences, graph } satisfies ExperienceSearchResponse);
  } catch (error) {
    const message = geminiFetchErrorMessage(error);
    console.warn('[EXPERIENCE_SEARCH_ERROR]', {
      message,
      characterId: entry.id,
      model: modelConfig.model,
      latencyMs: Date.now() - startedAt,
    });
    return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
  }
};
