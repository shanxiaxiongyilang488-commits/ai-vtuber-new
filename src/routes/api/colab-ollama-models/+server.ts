import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { listColabModels } from '$lib/providers/colab';

export const GET: RequestHandler = async () => {
  const baseUrl = env.COLAB_OLLAMA_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    return json(
      {
        error: 'COLAB_OLLAMA_URL が未設定',
        details: { envName: 'COLAB_OLLAMA_URL' }
      },
      { status: 500 }
    );
  }

  const tagsUrl = `${baseUrl}/api/tags`;

  try {
    const models = await listColabModels(baseUrl);

    return json(models);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    console.error('Failed to fetch Colab Ollama models', {
      url: tagsUrl,
      message,
      stack
    });

    return json(
      {
        error: 'Colab Ollama models fetch failed',
        details: {
          url: tagsUrl,
          message,
          stack
        }
      },
      { status: 503 }
    );
  }
};
