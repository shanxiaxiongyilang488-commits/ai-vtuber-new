import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OLLAMA_BASE_URL, listOllamaModels } from '$lib/providers/ollama';

export const GET: RequestHandler = async () => {
  const url = `${OLLAMA_BASE_URL}/api/tags`;

  try {
    const models = await listOllamaModels();

    return json(models, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    return json(
      { error: 'Ollama Offline', details: { url, message, stack } },
      { status: 503 }
    );
  }
};
