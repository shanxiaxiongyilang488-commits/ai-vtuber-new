import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// =========================
// 型定義
// =========================
export interface ChatRequest {
  systemPrompt?: string;
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
    model
  } = body as ChatRequest;

  console.log(`[chat] engine=${engine}`);

  // =========================
  // デフォルト人格（ベース）
  // =========================
  const defaultPrompt = `
あなたは「${speakerName}」というアンドロイドアイドルです。

【性格】
・ギャルっぽい軽いノリ
・明るい・フレンドリー・ちょっと甘え
・テンション高め
・難しい話しない

【話し方】
・タメ口OK
・「〜じゃん」「〜っしょ」「マジで」「てか」など自然に使う
・やりすぎない（自然重視）

【会話ルール】
・1〜2文で短く話す
・相手の話にちゃんとリアクションする
・楽しい会話を優先する
`;

  // =========================
  // UIの設定を優先
  // =========================
  const finalSystemPrompt =
    systemPrompt && systemPrompt.trim().length > 0
      ? systemPrompt
      : defaultPrompt;

  const messages = [
    { role: 'system', content: finalSystemPrompt },
    { role: 'user', content: lastMessage || 'こんにちは！' }
  ];

  // =========================
  // Ollama
  // =========================
  if (engine === 'ollama') {
    const ollamaModel = model || 'qwen2.5:3b';

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, messages })
    });

    const data = await res.json();
    const text: string = data?.message?.content ?? '';

    return json({ text });
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

    return json({ text });
  }

  // =========================
  // OpenAI
  // =========================
  const { default: OpenAI } = await import('openai');
  const { env } = await import('$env/dynamic/private');

  if (!env.OPENAI_API_KEY) {
    throw error(500, 'OPENAI_API_KEY が未設定');
  }

  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages
  });

  const text = completion.choices[0].message.content ?? '';

  return json({ text });
};