import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { muryiPersona } from '$lib/ai/personas'
import { buildCharacterPrompt } from '$lib/ai/prompts/buildCharacterPrompt'
import { buildMemoryContext, type BuiltMemoryPrompt, type MemoryCoreRequest } from '$lib/ai/memory-core/memoryCore';

// =========================
// 型定義
// =========================
export interface ChatRequest {
  systemPrompt?: string;
  lastMessage: string;
  speakerName: string;
  listenerName: string;
  topic: string;
  engine?: 'openai' | 'gemini' | 'claude' | 'ollama' | 'lmstudio';
  model?: string;
  memory?: MemoryCoreRequest;
}

export interface ChatResponse {
  text: string;
  memory?: BuiltMemoryPrompt['debug'];
}

// =========================
// メイン処理
// =========================
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
    systemPrompt,
    lastMessage = '',
    speakerName = 'AI',
    listenerName = 'ユーザー',
    topic = '',
    engine = 'openai',
    model,
    memory
  } = body as ChatRequest;

  console.log(`[chat] engine=${engine}`);

  // =========================
  // デフォルト人格（ベース）
  // =========================
  let trust = 80;

  const defaultPrompt = buildCharacterPrompt(
  muryiPersona,
  {
    battery: 82,
    trust: trust,
    affection: 58,
    cpuLoad: 12,
    emotion: 'neutral'
  }
);

  // =========================
  // UIの設定を優先
  // =========================
  const finalSystemPrompt =
    systemPrompt && systemPrompt.trim().length > 0
      ? systemPrompt
      : defaultPrompt;

  const memoryContext = buildMemoryContext({
    baseSystemPrompt: finalSystemPrompt,
    userInput: lastMessage || topic || '',
    memory
  });

  const messages = [
    { role: 'system', content: memoryContext.systemPrompt },
    { role: 'user', content: lastMessage || 'こんにちは！' }
  ];

  const memoryDebug = memory?.enabled ? memoryContext.debug : undefined;

  // =========================
  // Ollama
  // =========================
  if (engine === 'ollama') {
    const ollamaModel = model || 'qwen2.5:3b';

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, messages, stream: false })
    });

    const data = await res.json();
    const text: string = data?.message?.content ?? '';

    return json({ text, memory: memoryDebug });
  }

  // =========================
  // LM Studio
  // =========================
  if (engine === 'lmstudio') {
    const lmModel = model || 'local-model';

    const res = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer lm-studio'
      },
      body: JSON.stringify({ model: lmModel, messages })
    });

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';

    return json({ text, memory: memoryDebug });
  }

  const { env } = await import('$env/dynamic/private');

  // =========================
  // Gemini
  // =========================
  if (engine === 'gemini') {
    if (!env.GEMINI_API_KEY) {
      throw error(500, 'GEMINI_API_KEY が未設定');
    }

    const geminiModel = model || 'gemini-2.5-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: memoryContext.systemPrompt }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: lastMessage || 'こんにちは！' }]
            }
          ]
        })
      }
    );

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';

    return json({ text, memory: memoryDebug });
  }

  // =========================
  // Claude
  // =========================
  if (engine === 'claude') {
    if (!env.ANTHROPIC_API_KEY) {
      throw error(500, 'ANTHROPIC_API_KEY が未設定');
    }

    const claudeModel = model || 'claude-haiku-4-5-20251001';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: 500,
        system: memoryContext.systemPrompt,
        messages: [{ role: 'user', content: lastMessage || 'こんにちは！' }]
      })
    });

    const data = await res.json();
    const text: string = data?.content?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';

    return json({ text, memory: memoryDebug });
  }

  // =========================
  // OpenAI
  // =========================
  const { default: OpenAI } = await import('openai');

  if (!env.OPENAI_API_KEY) {
    throw error(500, 'OPENAI_API_KEY が未設定');
  }

  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });

  const completion = await openai.chat.completions.create({
  model: model || 'gpt-4o-mini',
  messages: messages as any
});

  const text = completion.choices[0].message.content ?? '';

  return json({ text, memory: memoryDebug });
};
