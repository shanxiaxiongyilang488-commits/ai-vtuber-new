import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LM_STUDIO_BASE_URL, listLMStudioModels } from '$lib/providers/lmstudio';

export const GET: RequestHandler = async () => {
  const url = `${LM_STUDIO_BASE_URL}/models`;

  try {
    const models = await listLMStudioModels();

    return json(models);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[lmstudio-models] fetch failed', { url, message, stack });

    return json(
      {
        error: 'LM Studio Offline',
        details: { url, message, stack },
      },
      { status: 503 }
    );
  }
};
