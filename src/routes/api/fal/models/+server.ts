import { json, type RequestHandler } from '@sveltejs/kit';
import type {
  FalDiscoveredModel,
  FalDiscoveryResponse,
  FalModelCatalog,
  FalModelCategory,
} from '$lib/types/falDiscovery';

const FAL_MODELS_URL = 'https://api.fal.ai/v1/models';
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { expiresAt: number; response: FalDiscoveryResponse } | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function falCategoryForTask(task: string): FalModelCategory | null {
  const value = task.toLowerCase();
  if (/(?:^|-)3d(?:-|$)|text-to-3d|image-to-3d|mesh|object-to-3d/.test(value)) return '3d';
  if (/audio|speech|voice|music|sound|tts|text-to-speech|speech-to-text/.test(value)) return 'audio';
  if (/video|lipsync/.test(value)) return 'video';
  if (/image|upscale|background|segmentation|inpaint|outpaint/.test(value)) return 'image';
  return null;
}

function normalizeModel(value: unknown): FalDiscoveredModel | null {
  const raw = asRecord(value);
  const metadata = asRecord(raw.metadata);
  const id = text(raw.endpoint_id);
  const task = text(metadata.category);
  const category = falCategoryForTask(task);
  if (!id || !category || text(metadata.status).toLowerCase() === 'deprecated') return null;

  return {
    id,
    name: text(metadata.display_name) || id,
    category,
    task,
    description: text(metadata.description),
    tags: stringList(metadata.tags),
    thumbnailUrl: text(metadata.thumbnail_url),
    updatedAt: text(metadata.updated_at),
    edit: /(?:image-to-image|edit|inpaint|outpaint)/.test(task.toLowerCase()) || /\/edit(?:\/|$)/.test(id),
  };
}

function categorize(models: FalDiscoveredModel[]): FalModelCatalog {
  const categories: FalModelCatalog = { image: [], video: [], audio: [], '3d': [] };
  for (const model of models) categories[model.category].push(model);
  return categories;
}

async function fetchCatalog(): Promise<FalDiscoveryResponse> {
  const rawModels: unknown[] = [];
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const requestUrl = new URL(FAL_MODELS_URL);
    requestUrl.searchParams.set('limit', '500');
    if (cursor) requestUrl.searchParams.set('cursor', cursor);
    const response = await fetch(requestUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`FAL catalog HTTP ${response.status}`);

    const data = asRecord(await response.json());
    rawModels.push(...(Array.isArray(data.models) ? data.models : []));
    const pagination = asRecord(data.pagination);
    const nextCursor = text(data.next_cursor) || text(data.nextCursor) || text(pagination.next_cursor);
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  const models = rawModels
    .map(normalizeModel)
    .filter((model): model is FalDiscoveredModel => Boolean(model))
    .filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (models.length === 0) throw new Error('FAL catalog returned no supported media models');

  return {
    models,
    categories: categorize(models),
    fetchedAt: new Date().toISOString(),
    source: 'live',
  };
}

export const GET: RequestHandler = async ({ url }) => {
  const force = url.searchParams.get('refresh') === '1';
  if (!force && cache && cache.expiresAt > Date.now()) {
    return json({ ...cache.response, source: 'cache' });
  }

  try {
    const response = await fetchCatalog();
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, response };
    return json(response);
  } catch (error) {
    if (cache) return json({ ...cache.response, source: 'cache' });
    return json({
      message: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  }
};
