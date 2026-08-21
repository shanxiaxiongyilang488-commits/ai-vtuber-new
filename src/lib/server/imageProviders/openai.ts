import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { dataUrlToFile, firstDataUrl, normalizeImages, type GeneratedImage, type ImageGenerationInput, type ImageSize } from './types';

const OPENAI_IMAGE_MODEL = 'gpt-image-2';

const OPENAI_MODEL_MAP: Record<string, string> = {
  'gpt-image-2': 'gpt-image-2',
  'GPT Image 2': 'gpt-image-2',
  'openai/GPT Image 2': 'gpt-image-2',
  'openai/gpt-image-2': 'gpt-image-2',
  'openai/gpt-image-2/edit': 'gpt-image-2',
  'GPT Image': OPENAI_IMAGE_MODEL,
  OpenAI: OPENAI_IMAGE_MODEL,
  openai: OPENAI_IMAGE_MODEL,
};

function resolveOpenAIModel(selectedModel?: string): string {
  const model = selectedModel || OPENAI_IMAGE_MODEL;
  return OPENAI_MODEL_MAP[model] ?? model.replace(/^openai\//, '').trim();
}

function resolveOpenAISize(value: string): ImageSize {
  if (value !== '1024x1024' && value !== '1024x1536' && value !== '1536x1024') return '1024x1024';
  return value;
}

function imageRefDigest(value: string): string {
  let hash = 0;
  const step = Math.max(1, Math.floor(value.length / 64));
  for (let i = 0; i < value.length; i += step) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0;
  }
  return `${value.length}:${hash.toString(16)}`;
}

function imageRefMeta(value: string, index: number, source = 'unknown') {
  return {
    index,
    source,
    kind: value.startsWith('data:') ? 'data-url' : (value.startsWith('http') ? 'url' : 'unknown'),
    mime: value.match(/^data:([^;]+);/)?.[1] ?? null,
    length: value.length,
    approxKB: Math.round(value.length / 1024),
    digest: imageRefDigest(value),
  };
}

export async function generateOpenAIImage(input: ImageGenerationInput): Promise<GeneratedImage[]> {
  const apiKey = await getProviderKey('openai');
  if (!apiKey) throw error(500, 'OpenAI API key is not configured');

  const model = resolveOpenAIModel(input.model);
  const size = resolveOpenAISize(input.size);
  console.log('[OPENAI IMAGE SETTINGS]', { model, size });

  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });
  const primaryRef = firstDataUrl(input.refImages);
  const requestUrl = input.editMode || primaryRef
    ? 'https://api.openai.com/v1/images/edits'
    : 'https://api.openai.com/v1/images/generations';
  const requestModel = model;
  console.log('[OPENAI REQUEST]');
  console.log('url:', requestUrl);
  console.log('model:', requestModel);
  console.log('[OPENAI_IMAGE_REFS_INPUT]', {
    editMode: input.editMode,
    refCount: input.refImages.length,
    primaryRef: primaryRef ? imageRefMeta(primaryRef, 0, 'openai.primaryRef') : null,
    refs: input.refImages.map((ref, index) => imageRefMeta(ref, index, 'openai.input.refImages')),
  });

  const editSizeMap: Record<ImageSize, string> = {
    '1024x1024': '1024x1024',
    '1024x1536': '1024x1536',
    '1536x1024': '1536x1024',
    '1792x1024': '1536x1024',
    '1024x1792': '1024x1536',
  };

  try {
    let result;
    if (input.editMode || primaryRef) {
      if (!primaryRef) throw error(400, 'Reference image is required for OpenAI image edit');
      console.log('[GPT-IMAGE-2 EDIT INPUT]', {
        model,
        prompt: input.prompt,
        n: 1,
        size: editSizeMap[size] ?? size,
        image: {
          present: true,
          ...imageRefMeta(primaryRef, 0, 'openai.images.edit.image'),
        },
        refImages: input.refImages.map((ref, index) => imageRefMeta(ref, index, 'openai.images.edit.refImages')),
      });
      result = await (openai.images.edit as any)({
          model,
          image: dataUrlToFile(primaryRef),
          prompt: input.prompt,
          n: 1,
          size: editSizeMap[size] ?? size,
        });
    } else {
      result = await (openai.images.generate as any)({
          model,
          prompt: input.prompt,
          n: 1,
          size,
        });
    }

    const images = (result.data ?? []).map((item: { b64_json?: string; url?: string }) => {
      if (item.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
      if (item.url) return { url: item.url };
      return { url: '' };
    });
    const normalized = normalizeImages(images);
    if (normalized.length === 0) throw error(500, 'No image data returned from OpenAI');
    return normalized;
  } catch (caughtError: unknown) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error('[api/generate] openai error:', message);
    if (message.includes('content_policy')) throw error(400, 'OpenAI content policy rejected the prompt');
    if (message.includes('billing') || message.includes('quota')) throw error(429, 'OpenAI quota or billing limit reached');
    throw error(500, `OpenAI API error: ${message}`);
  }
}
