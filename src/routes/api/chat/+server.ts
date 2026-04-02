import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';

// ── Types exported for use in aiEngine.ts ──────────────────────────────────
export interface ChatRequest {
  systemPrompt: string;
  lastMessage: string;
  speakerName: string;
  listenerName: string;
  topic: string;
  engine?: 'openai' | 'ollama' | 'lmstudio';
  model?: string;
}

export interface ChatResponse {
  text: string;
}

// ── OpenAI client (key lives only on the server) ───────────────────────────
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  if (!body || typeof body !== 'object') {
    throw error(400, 'Request body must be an object');
  }

  const {
    systemPrompt = '',
    lastMessage = '',
    speakerName = '',
    listenerName = '',
    topic = '',
    engine = 'openai',
    model,
  } = body as ChatRequest;

  // ── Ollama (local) ─────────────────────────────────────────────────────
  if (engine === 'ollama') {
    const ollamaModel = model ?? 'qwen:0.5b';
    const fullSystemPrompt = [
      systemPrompt,
      `あなたの名前は「${speakerName}」です。`,
      `会話相手は「${listenerName}」です。`,
      `話題: ${topic}`,
      '「名前:」のようなプレフィックスを付けず、セリフだけを短く返してください。',
    ].join('\n');

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages: [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: lastMessage || 'こんにちは！' },
        ],
      }),
    }).catch(() => null);

    if (!res || !res.ok) {
      throw error(502, 'Ollama が起動していないか、応答しませんでした');
    }

    const data = await res.json();
    const text: string = data?.message?.content ?? '';
    return json({ text } satisfies ChatResponse);
  }

  // ── LM Studio (local) ─────────────────────────────────────────────────
  if (engine === 'lmstudio') {
    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n必ず会話形式で返答してください。必ず日本語で会話してください。説明は禁止です。短くテンポよく話してください。`,
      },
      { role: 'user', content: lastMessage || 'こんにちは！' },
    ];

    const res = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer lm-studio',
      },
      body: JSON.stringify({ model: model ?? '', messages }),
    }).catch(() => null);

    if (!res || !res.ok) {
      throw error(502, 'LM Studio が起動していないか、応答しませんでした');
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    return json({ text } satisfies ChatResponse);
  }

  // ── OpenAI (default) ──────────────────────────────────────────────────
  const fullSystemPrompt = [
    systemPrompt,
    `あなたの名前は「${speakerName}」です。`,
    `会話相手は「${listenerName}」です。`,
    `話題: ${topic}`,
    '「名前:」のようなプレフィックスを付けず、セリフだけを短く返してください。',
  ].join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: lastMessage || 'こんにちは！' },
    ],
  });

  const text = completion.choices[0].message.content ?? '';
  return json({ text } satisfies ChatResponse);
};
