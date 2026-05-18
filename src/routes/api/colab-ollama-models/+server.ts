import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

type OllamaTagsResponse = {
  models?: Array<{
    name?: unknown;
  }>;
};

export const GET: RequestHandler = async () => {
  const baseUrl = env.COLAB_OLLAMA_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    throw error(500, 'COLAB_OLLAMA_URL が未設定');
  }

  const res = await fetch(`${baseUrl}/api/tags`);

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw error(503, `Colab Ollama tags API error: ${msg}`);
  }

  const data = await res.json() as OllamaTagsResponse;
  const models = (data.models ?? [])
    .map((model) => model.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

  return json(models);
};
