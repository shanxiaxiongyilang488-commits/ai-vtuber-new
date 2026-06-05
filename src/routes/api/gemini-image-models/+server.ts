import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { getAvailableGeminiImageModels } from '$lib/server/imageProviders/gemini';

export const GET: RequestHandler = async () => {
  const apiKey = await getProviderKey('gemini');
  const models = await getAvailableGeminiImageModels(apiKey);
  return json({ models });
};
