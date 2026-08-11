import { json, type RequestHandler } from '@sveltejs/kit';
import { readSettings, writeSettings } from '$lib/server/settings';
import { AVAILABLE_MEDIA_MODELS, logAvailableMediaModels } from '$lib/server/mediaProviders/registry';

export const GET: RequestHandler = async () => {
  const settings = await readSettings();
  const availableProviders = [
    ...(settings.openai.key ? ['openai'] : []),
    ...(settings.grok.enabled || settings.grok.apiKey ? ['grok'] : []),
    ...(settings.gemini.key ? ['gemini'] : []),
    ...(settings.anthropic.key ? ['claude'] : []),
    ...(settings.local.baseUrl ? ['local'] : []),
  ];
  logAvailableMediaModels();
  console.log('[IMAGE_GENERATION_PROVIDER]', settings.mediaConfig.provider);
  console.log('[IMAGE_GENERATION_MODEL]', settings.mediaConfig.model);
  console.log('[VIDEO_GENERATION_PROVIDER]', settings.video.backend);
  return json({
    ...settings,
    imageGenerationProvider: settings.mediaConfig.provider,
    imageGenerationConfig: settings.mediaConfig,
    videoGenerationProvider: settings.video.backend,
    videoGenerationConfig: settings.video,
    availableProviders,
    availableMediaModels: AVAILABLE_MEDIA_MODELS,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  console.log('[SAVE SETTINGS]');
  const saved = await writeSettings(body);
  console.log('[CHAT_PROVIDER]', saved.chatConfig.provider);
  console.log('[CHAT_MODEL]', saved.chatConfig.model);
  console.log('[IMAGE_PROVIDER]', saved.imageConfig.provider);
  console.log('[IMAGE_MODEL]', saved.imageConfig.model);
  console.log('[IMAGE_GENERATION_PROVIDER]', saved.mediaConfig.provider);
  console.log('[IMAGE_GENERATION_MODEL]', saved.mediaConfig.model);
  console.log('[VIDEO_GENERATION_PROVIDER]', saved.video.backend);
  console.log('[OPENAI KEY SAVED]', Boolean(saved.openai.key));
  console.log('[GROK KEY SAVED]', Boolean(saved.grok.apiKey));
  console.log('[GEMINI KEY SAVED]', Boolean(saved.gemini.key));
  console.log('[FAL KEY SAVED]', Boolean(saved.fal.key));
  console.log('[RUNPOD KEY SAVED]', Boolean(saved.runpod.apiKey));
  console.log('[IDEOGRAM KEY SAVED]', Boolean(saved.ideogram.key));
  console.log('[ANTHROPIC KEY SAVED]', Boolean(saved.anthropic.key));
  console.log('[ELEVENLABS KEY SAVED]', Boolean(saved.elevenlabs.key));
  console.log('[IRODORI URL SAVED]', Boolean(saved.irodori.url));
  return json({
    ...saved,
    imageGenerationProvider: saved.mediaConfig.provider,
    imageGenerationConfig: saved.mediaConfig,
    videoGenerationProvider: saved.video.backend,
    videoGenerationConfig: saved.video,
  });
};
