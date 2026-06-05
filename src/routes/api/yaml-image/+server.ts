import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AVAILABLE_MEDIA_MODELS, generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
import { buildImagePromptFromYamlPanel, getYamlScenePanel, parseYamlSceneDocument } from '$lib/server/yamlSceneParser';
import type { GeneratedImage, ImageSize } from '$lib/server/imageProviders/types';

const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/nano-banana-pro';
const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'] as const;

type YamlImageRequest = {
  yaml?: string;
  model?: string;
  size?: ImageSize;
};

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
  const panel = getYamlScenePanel(document);
  if (!panel) throw error(400, 'first scene/panel was not found in YAML');

  const prompt = buildImagePromptFromYamlPanel(document, panel);
  const mediaModel = resolveFalImageModel(panel.model || body.model);
  const chars = Array.from(new Set([...document.chars, ...panel.chars]));
  const plan = {
    panel: 'panel_1',
    chars,
    pose: panel.pose,
    line: panel.line,
    scene: panel.scene,
    model: mediaModel.id,
  };

  console.log('[YAML_IMAGE_PIPELINE]', 'YAML -> Parser -> Scene -> Character -> Prompt -> Media Provider(FAL)');
  console.log('[YAML_IMAGE_PLAN]', plan);
  console.log('[YAML_PANEL]', 'panel_1');
  console.log('[YAML_SCENE]', panel.scene || '(none)');
  console.log('[YAML_CHARS]', chars);
  console.log('[YAML_POSE]', panel.pose || '(none)');
  console.log('[YAML_LINE]', panel.line || '(none)');
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
    plan,
    panel: 'panel_1',
    scene: panel.scene,
    chars,
    pose: panel.pose,
    line: panel.line,
    provider: 'fal',
    model: mediaModel.id,
  });
};
