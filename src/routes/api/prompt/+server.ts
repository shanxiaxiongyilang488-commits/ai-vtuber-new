import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  const { basePrompt, refDescription } = await request.json();

  if (!env.OPENAI_API_KEY) {
    throw error(500, 'OPENAI_API_KEY 未設定');
  }

  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });

  const systemPrompt = `
You are an expert prompt engineer for image generation.

Your job:
- Take a base prompt and character description
- Generate a FINAL prompt that ensures:
  - same character identity
  - consistent face, hair, outfit
  - no redesign
  - no variation

Return ONLY the final prompt.
`;

  const userPrompt = `
Character description:
${refDescription}

Base prompt:
${basePrompt}

Generate a strict, stable image prompt.
`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const finalPrompt = res.choices[0]?.message?.content;

  if (!finalPrompt) {
    throw error(500, 'プロンプト生成失敗');
  }

  return json({ prompt: finalPrompt });
};