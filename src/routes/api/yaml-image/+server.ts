import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AVAILABLE_MEDIA_MODELS, generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
import { buildImagePromptFromYamlPanel, getYamlScenePanel, parseYamlSceneDocument } from '$lib/server/yamlSceneParser';
import type { GeneratedImage, ImageSize } from '$lib/server/imageProviders/types';

const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/nano-banana-pro';
const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'] as const;

type YamlImageRequest = {
  yaml?: string;
  panel?: string | number;
  model?: string;
  size?: ImageSize;
};

function panelNumber(raw: string | number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  const match = String(raw ?? 'panel_1').match(/([0-9]+)/);
  return Math.max(1, Number(match?.[1] ?? 1) || 1);
}

function resolveFalImageModel(raw?: string) {
  const requested = resolveMediaModel(raw || DEFAULT_FAL_IMAGE_MODEL);
  if (requested.provider === 'fal') return requested;
  return AVAILABLE_MEDIA_MODELS.find((model) => model.apiModel === DEFAULT_FAL_IMAGE_MODEL) ?? resolveMediaModel(DEFAULT_FAL_IMAGE_MODEL);
}

export const POST: RequestHandler = async ({ request }) => {
  let body: YamlImageRequest;
  try {
    body = await request.json();
  } catch (caughtError) {
    console.error('[YAML_IMAGE_ERROR]', caughtError);
    throw error(400, 'Invalid JSON');
  }

  const yaml = body.yaml?.trim();
  if (!yaml) throw error(400, 'yaml is required');

  const size = body.size ?? '1024x1024';
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);

  logAvailableMediaModels();

  const document = parseYamlSceneDocument(yaml);
  const requestedPanel = panelNumber(body.panel);
  const panel = getYamlScenePanel(document, requestedPanel);
  if (!panel) throw error(400, `panel_${requestedPanel} was not found in YAML`);

  const prompt = buildImagePromptFromYamlPanel(document, panel);
  const mediaModel = resolveFalImageModel(panel.model || body.model);

  console.log('[YAML_IMAGE_PIPELINE]', 'YAML -> Parser -> Scene -> Character -> Prompt -> FAL');
  console.log('[YAML_PANEL]', `panel_${requestedPanel}`);
  console.log('[YAML_SCENE]', panel.scene || '(none)');
  console.log('[YAML_CHARACTERS]', Array.from(new Set([...document.characters, ...panel.characters])));
  console.log('[YAML_IMAGE_PROMPT]', prompt);
  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', mediaModel.id);

  const result = await generateMediaImage({
    prompt,
    size,
    model: mediaModel.apiModel,
    requestedModel: mediaModel.id,
    refImages: [],
    editMode: false,
  });
  const images: GeneratedImage[] = result.images;

  return json({
    images,
    prompt,
    panel: `panel_${requestedPanel}`,
    scene: panel.scene,
    characters: Array.from(new Set([...document.characters, ...panel.characters])),
    provider: 'fal',
    model: mediaModel.id,
    futurePanels: document.panels.map((item) => `panel_${item.panel}`),
  });
};
