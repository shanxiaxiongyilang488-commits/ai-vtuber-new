import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readSettings } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
  const settings = await readSettings();
  if (!settings.openai.key) {
    return json({ message: 'OpenAI API key is not configured' }, { status: 503 });
  }

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: settings.openai.key });
    const models = [];
    for await (const model of client.models.list()) {
      models.push({ id: model.id, created: model.created, ownedBy: model.owned_by });
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    return json({ models, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const candidate = error as { status?: number; message?: string };
    return json({ message: candidate.message ?? String(error) }, { status: candidate.status ?? 502 });
  }
};
