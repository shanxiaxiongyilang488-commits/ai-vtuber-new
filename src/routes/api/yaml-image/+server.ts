import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AVAILABLE_MEDIA_MODELS, generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
import { buildImagePromptFromYamlPanel, getYamlScenePanel, parseYamlSceneDocument } from '$lib/server/yamlSceneParser';
import { getCharacterReferenceDataUrl } from '$lib/server/characterRegistry';
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

function registryReferenceImagesFromText(text: string): string[] {
  const ids = Array.from(new Set([
    ...Array.from(text.matchAll(/\bcharacter:([a-z0-9_-]+)\b/gi)).map((match) => match[1].toLowerCase()),
    ...Array.from(text.matchAll(/\bN-\d{2}\b/gi)).map((match) => match[0].toLowerCase()),
  ]));

  return ids
    .map((id) => {
      try {
        const ref = getCharacterReferenceDataUrl(id);
        if (ref) console.log('[YAML_IMAGE_REF]', id);
        return ref;
      } catch (caughtError) {
        console.warn('[YAML_IMAGE_REF_ERROR]', id, caughtError);
        return null;
      }
    })
    .filter((ref): ref is string => Boolean(ref));
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
  const chars = panel.chars.length > 0 ? panel.chars : document.chars;
  const charNames = chars.map((char) => char.name).filter(Boolean);
  const plan = {
    panel: 'panel_1',
    chars,
    scene: panel.scene,
    model: mediaModel.id,
  };

  console.log('[YAML_IMAGE_PIPELINE]', 'YAML -> Parser -> Scene -> Character -> Prompt -> Media Provider(FAL)');
  console.log('[YAML_IMAGE_PLAN]', plan);
  console.log('[YAML_PANEL]', 'panel_1');
  console.log('[YAML_SCENE]', panel.scene || '(none)');
  console.log('[YAML_CHARS]', chars);
  console.log('[PANEL_CHAR_COUNT]', chars.length);
  console.log('[YAML_IMAGE_PROMPT]', prompt);
  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', mediaModel.id);
  const refImages = registryReferenceImagesFromText(`${prompt}\n${charNames.join('\n')}`);
  console.log('[YAML_IMAGE_REF_COUNT]', refImages.length);

  const result = await generateMediaImage({
    prompt,
    size,
    model: mediaModel.apiModel,
    requestedModel: mediaModel.id,
    refImages,
    editMode: refImages.length > 0,
  });
  const images: GeneratedImage[] = result.images;

  return json({
    images,
    prompt,
    plan,
    panel: 'panel_1',
    scene: panel.scene,
    chars,
    provider: 'fal',
    model: mediaModel.id,
  });
};
