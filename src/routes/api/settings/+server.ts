import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey, readSettings, writeSettings } from '$lib/server/settings';
import { getAvailableGeminiImageModels } from '$lib/server/imageProviders/gemini';

export const GET: RequestHandler = async () => {
  const settings = await readSettings();
  const apiKey = await getProviderKey('gemini');
  const availableGeminiImageModels = await getAvailableGeminiImageModels(apiKey);
  return json({ ...settings, availableGeminiImageModels });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  console.log('[SAVE SETTINGS]');
  const saved = await writeSettings(body);
  console.log('[CHAT_PROVIDER]', saved.chatConfig.provider);
  console.log('[CHAT_MODEL]', saved.chatConfig.model);
  console.log('[IMAGE_PROVIDER]', saved.imageConfig.provider);
  console.log('[IMAGE_MODEL]', saved.imageConfig.model);
  console.log('[OPENAI KEY SAVED]', Boolean(saved.openai.key), saved.openai.key.slice(0, 12));
  console.log('[GEMINI KEY SAVED]', Boolean(saved.gemini.key), saved.gemini.key.slice(0, 12));
  console.log('[FAL KEY SAVED]', Boolean(saved.fal.key), saved.fal.key.slice(0, 12));
  console.log('[IDEOGRAM KEY SAVED]', Boolean(saved.ideogram.key), saved.ideogram.key.slice(0, 12));
  console.log('[ANTHROPIC KEY SAVED]', Boolean(saved.anthropic.key), saved.anthropic.key.slice(0, 12));
  console.log('[ELEVENLABS KEY SAVED]', Boolean(saved.elevenlabs.key), saved.elevenlabs.key.slice(0, 12));
  console.log('[IRODORI URL SAVED]', Boolean(saved.irodori.url));
  return json(saved);
};
