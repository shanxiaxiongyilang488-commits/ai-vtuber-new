import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
type ImageSize = typeof VALID_SIZES[number];

// ── Model registry ────────────────────────────────────────────────────────────
const MODEL_IDS = {
  gptimage2: {
    text: 'gpt-image-2',
    edit: 'gpt-image-1',     // OpenAI SDK model name for images.edit
  },
} as const;

interface GenerateRequest {
  prompt:     string;
  size?:      ImageSize;
  model?:     string;    // legacy API model name (kept for backward compat)
  selectedModel?: string; // UI model name, e.g. "fal-ai/nano-banana-2 edit"
  provider?:  string;    // client hint only; selectedModel prefix is authoritative
  editMode?:  boolean;   // client hint only; selectedModel text is authoritative
  refImage?:  string;    // legacy single-image (kept for backward compat)
  refImages?: string[];  // multi-image array (preferred)
}

function resolveSelectedModel(selectedModel: string | undefined, model: string | undefined): string {
  if (selectedModel?.trim()) return selectedModel.trim();
  if (model === 'nanobanana2') return 'fal-ai/nano-banana-2';
  if (model === 'gpt-image-2') return 'openai/GPT Image 2';
  return model?.trim() || 'openai/GPT Image 2';
}

function stripEditSuffix(value: string): string {
  return value.replace(/\s+edit$/i, '').trim();
}

function normalizeFalModel(value: string): string {
  const base = stripEditSuffix(value);
  const map: Record<string, string> = {
    'fal-ai/nano-banana-2': 'fal-ai/nano-banana-2',
    'fal-ai/nano-banana-pro': 'fal-ai/nano-banana-pro',
    'fal-ai/Flux 2 Max': 'fal-ai/flux-2-max',
    'fal-ai/flux-2-max': 'fal-ai/flux-2-max',
  };
  return map[base] ?? base;
}

function normalizeOpenAIModel(value: string, isEdit: boolean): string {
  const name = stripEditSuffix(value).replace(/^openai\//, '').trim();
  if (/^GPT Image 2$/i.test(name) || name === 'gpt-image-2') return isEdit ? MODEL_IDS.gptimage2.edit : MODEL_IDS.gptimage2.text;
  return name;
}

function normalizeXAIModel(value: string): string {
  return stripEditSuffix(value).replace(/^xai\//, '').trim();
}

async function imageUrlToDataUrl(imageUrl: string, sourceLabel: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw error(500, `Failed to fetch ${sourceLabel} image`);
  const imgBuf = await imgRes.arrayBuffer();
  const b64    = Buffer.from(imgBuf).toString('base64');
  const mime   = imgRes.headers.get('content-type') ?? 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { prompt, size = '1024x1024', model = 'gpt-image-2', selectedModel, refImage, refImages } = body;

  if (!prompt?.trim()) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);

  const resolvedModel = resolveSelectedModel(selectedModel, model);
  const isEditMode    = /\bedit\b/i.test(resolvedModel);
  const provider      = resolvedModel.startsWith('fal-ai/')
    ? 'fal-ai'
    : resolvedModel.startsWith('openai/')
      ? 'openai'
      : resolvedModel.startsWith('xai/')
        ? 'xai'
        : model === 'nanobanana2'
          ? 'fal-ai'
          : 'openai';

  // Resolve reference images: prefer refImages array, fall back to legacy refImage
  const refImgs: string[] = (
    refImages?.filter(r => typeof r === 'string' && r.startsWith('data:')) ??
    (refImage?.startsWith('data:') ? [refImage] : [])
  );
  const hasRefImgs     = refImgs.length > 0;
  const generationMode = hasRefImgs ? 'image-to-image' : 'text-to-image';

  console.log('[studio/generate]', {
    selectedModel:      resolvedModel,
    legacyModel:        model,
    provider,
    editMode:           isEditMode,
    hasReferenceImages: hasRefImgs,
    imageCount:         refImgs.length,
    imageSizes:         refImgs.map(r => `${Math.round(r.length / 1024)}KB`),
    generationMode,
    promptLength:       prompt.length,
    promptPreview:      prompt.slice(0, 120),
    size,
  });

  // ── OpenAI Images API ─────────────────────────────────────────────────────
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY が未設定');

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const openAIModel = normalizeOpenAIModel(resolvedModel, isEditMode);

    // images.edit が受け付けるサイズ (gpt-image-2 generate とは異なる)
    const EDIT_SIZE_MAP: Record<ImageSize, '1024x1024' | '1536x1024' | '1024x1536'> = {
      '1024x1024': '1024x1024',
      '1792x1024': '1536x1024',
      '1024x1792': '1024x1536',
    };

    if (isEditMode && !hasRefImgs) throw error(400, 'Edit モデルには参照画像が必要です。');

    let result;
    try {
      if (isEditMode) {
        // images.edit は1枚のみ対応 → 先頭の参照画像を使用
        const primaryRef = refImgs[0];
        console.log(`[studio/generate] openai edit model=${openAIModel}: using image[0] of ${refImgs.length} (${Math.round(primaryRef.length / 1024)}KB), prompt="${prompt.slice(0, 60)}..."`);
        const base64 = primaryRef.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        const file   = new File([buffer], 'reference.png', { type: 'image/png' });
        result = await openai.images.edit({
          model:  openAIModel,
          image:  file,
          prompt: prompt.trim(),
          n:      1,
          size:   EDIT_SIZE_MAP[size],
        });
      } else {
        console.log(`[studio/generate] openai generate model=${openAIModel}: prompt="${prompt.slice(0, 60)}..."`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (openai.images.generate as any)({
          model:  openAIModel,
          prompt: prompt.trim(),
          n:      1,
          size,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[studio/generate] openai error:', msg);
      if (msg.includes('content_policy')) throw error(400, 'コンテンツポリシー違反: プロンプトを修正してください。');
      if (msg.includes('billing') || msg.includes('quota')) throw error(429, 'OpenAI クォータ超過。しばらく待ってから再試行してください。');
      throw error(500, `OpenAI API error: ${msg}`);
    }

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw error(500, 'No image data returned from OpenAI');
    console.log(`[studio/generate] openai ok (b64 ${b64.length} chars)`);
    return json({ url: `data:image/png;base64,${b64}`, revisedPrompt: null });
  }

  const FAL_SIZE_MAP: Record<ImageSize, string> = {
    '1024x1024': 'square_hd',
    '1792x1024': 'landscape_16_9',
    '1024x1792': 'portrait_16_9',
  };

  // ── FAL API ───────────────────────────────────────────────────────────────
  if (provider === 'fal-ai') {
    if (!env.FAL_KEY) throw error(500, 'FAL_KEY が未設定');

    const falModel    = normalizeFalModel(resolvedModel);
    const falEndpoint = `https://fal.run/${falModel}${isEditMode ? '/edit' : ''}`;

    const falBody: Record<string, unknown> = {
      prompt:              prompt.trim(),
      image_size:          FAL_SIZE_MAP[size],
      num_inference_steps: 30,
      num_images:          1,
      guidance_scale:      7.5,
    };

    if (isEditMode) {
      if (!hasRefImgs) throw error(400, 'Edit モデルには参照画像が必要です。');
      falBody.image_urls = refImgs;
      falBody.strength   = 0.70;   // 低いほど参照画像に忠実 (0=identical, 1=full noise)
    }

    console.log(`[studio/generate] fal endpoint=${falEndpoint}`);
    console.log(`[studio/generate] fal image_urls[${refImgs.length}]:`, refImgs.map((r, i) => `[${i}] ${Math.round(r.length / 1024)}KB`));
    console.log(`[studio/generate] fal params: strength=${falBody.strength ?? 'n/a'} guidance=${falBody.guidance_scale} steps=${falBody.num_inference_steps}`);
    console.log(`[studio/generate] fal prompt (${prompt.length}chars): ${prompt.slice(0, 200)}`);

    const falRes = await fetch(falEndpoint, {
      method: 'POST',
      headers: { 'Authorization': `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(falBody),
    });
    if (!falRes.ok) {
      const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
      console.error('[studio/generate] fal error:', msg.slice(0, 300));
      throw error(falRes.status >= 500 ? 500 : 400, `FAL API error: ${msg.slice(0, 200)}`);
    }
    const falData = await falRes.json();
    const imageUrl: string = falData?.images?.[0]?.url;
    if (!imageUrl) throw error(500, 'No image URL returned from FAL');

    const dataUrl = await imageUrlToDataUrl(imageUrl, 'FAL');
    console.log(`[studio/generate] fal ok (data URL ${dataUrl.length} chars)`);
    return json({ url: dataUrl, revisedPrompt: null });
  }

  // ── xAI Images API ───────────────────────────────────────────────────────
  if (provider === 'xai') {
    if (!env.XAI_API_KEY) throw error(500, 'XAI_API_KEY が未設定');
    const xaiModel = normalizeXAIModel(resolvedModel);
    if (!xaiModel) throw error(400, `Unknown xAI model: ${resolvedModel}`);

    const xaiEndpoint = `https://api.x.ai/v1/images/${isEditMode ? 'edits' : 'generations'}`;
    const xaiBody: Record<string, unknown> = {
      model:           xaiModel,
      prompt:          prompt.trim(),
      n:               1,
      response_format: 'b64_json',
    };
    if (isEditMode) {
      if (!hasRefImgs) throw error(400, 'Edit モデルには参照画像が必要です。');
      xaiBody.image_url = refImgs[0];
    }

    console.log(`[studio/generate] xai endpoint=${xaiEndpoint} model=${xaiModel} edit=${isEditMode}`);
    const xaiRes = await fetch(xaiEndpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(xaiBody),
    });
    if (!xaiRes.ok) {
      const msg = await xaiRes.text().catch(() => `HTTP ${xaiRes.status}`);
      console.error('[studio/generate] xai error:', msg.slice(0, 300));
      throw error(xaiRes.status >= 500 ? 500 : 400, `xAI API error: ${msg.slice(0, 200)}`);
    }
    const xaiData = await xaiRes.json();
    const b64: string | undefined = xaiData?.data?.[0]?.b64_json;
    const imageUrl: string | undefined = xaiData?.data?.[0]?.url;
    if (b64) return json({ url: `data:image/jpeg;base64,${b64}`, revisedPrompt: null });
    if (imageUrl) return json({ url: await imageUrlToDataUrl(imageUrl, 'xAI'), revisedPrompt: null });
    throw error(500, 'No image data returned from xAI');
  }

  throw error(400, `Unknown model: ${resolvedModel}`);
};
