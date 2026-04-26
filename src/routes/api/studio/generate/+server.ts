import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
type ImageSize = typeof VALID_SIZES[number];

interface GenerateRequest {
  prompt: string;
  size?: ImageSize;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { prompt, size = '1024x1024' } = body;

  if (!prompt?.trim()) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);
  if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY が未設定');

  console.log(`[studio/generate] prompt="${prompt.slice(0, 60)}..." size=${size}`);

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  let result;
  try {
    result = await client.images.generate({
      model:           'dall-e-3',
      prompt:          prompt.trim(),
      n:               1,
      size,
      response_format: 'b64_json',
      quality:         'standard',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[studio/generate] openai error:', msg);
    // surface quota / content policy errors clearly
    if (msg.includes('content_policy')) throw error(400, 'コンテンツポリシー違反: プロンプトを修正してください。');
    if (msg.includes('billing') || msg.includes('quota')) throw error(429, 'OpenAI クォータ超過。しばらく待ってから再試行してください。');
    throw error(500, `OpenAI API error: ${msg}`);
  }

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw error(500, 'No image data returned from OpenAI');

  const revisedPrompt = result.data?.[0]?.revised_prompt ?? null;
  console.log(`[studio/generate] ok (b64 ${b64.length} chars)`);

  return json({
    url:           `data:image/png;base64,${b64}`,
    revisedPrompt,
  });
};
