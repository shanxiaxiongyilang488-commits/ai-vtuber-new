import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

type Provider = 'openai' | 'gemini' | 'claude';

interface LabChatRequest {
  provider: Provider;
  model?: string;
  systemPrompt: string;
  userMessage: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: LabChatRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { provider, model, systemPrompt, userMessage } = body;

  console.log(`[lab-chat] provider=${provider} model=${model || '(default)'}`);

  // ================================================================
  // OpenAI
  // ================================================================
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY が未設定');
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    const text = completion.choices[0].message.content ?? '';
    console.log(`[lab-chat] openai ok (${text.length} chars)`);
    return json({ text });
  }

  // ================================================================
  // Gemini
  // ================================================================
  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw error(500, 'GEMINI_API_KEY が未設定');
    const geminiModel = model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => `HTTP ${res.status}`);
      console.error('[lab-chat] gemini error:', body);
      if (res.status === 429) {
        return json(
          { error: 'quota_exceeded', message: '無料枠の上限に達しました。しばらく待ってから再試行してください。' },
          { status: 429 }
        );
      }
      throw error(res.status, `Gemini API error: ${body}`);
    }
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log(`[lab-chat] gemini ok (${text.length} chars)`);
    return json({ text });
  }

  // ================================================================
  // Claude
  // ================================================================
  if (provider === 'claude') {
    if (!env.ANTHROPIC_API_KEY) throw error(500, 'ANTHROPIC_API_KEY が未設定');
    const claudeModel = model || 'claude-haiku-4-5-20251001';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      console.error('[lab-chat] claude error:', msg);
      throw error(res.status, `Claude API error: ${msg}`);
    }
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? '';
    console.log(`[lab-chat] claude ok (${text.length} chars)`);
    return json({ text });
  }

  throw error(400, `Unknown provider: ${provider}`);
};
