import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';

// =========================
// 型
// =========================
export interface ChatRequest {
  systemPrompt: string;
  lastMessage: string;
  speakerName: string;
  listenerName: string;
  topic: string;
  engine?: string;
  model?: string;
}

export interface ChatResponse {
  message: string;
}

// =========================
// OpenAIクライアント（遅延初期化）
// =========================
let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openai) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.startsWith('sk-xxx')) {
      throw error(500, 'OPENAI_API_KEY が設定されていません。.env を確認してください。');
    }

    openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
  }

  return openai;
}

// =========================
// POST
// =========================
export const POST = async ({ request }) => {
  let body: ChatRequest;

  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const {
    systemPrompt,
    lastMessage,
    speakerName,
    listenerName,
    topic,
    engine,
    model
  } = body;

  if (!speakerName || !listenerName || !topic) {
    throw error(400, 'speakerName / listenerName / topic は必須です');
  }

  // =========================
  // システムプロンプト
  // =========================
  const system = [
    systemPrompt,
    '',
    `あなたの名前は「${speakerName}」です。`,
    `会話相手は「${listenerName}」です。`,
    `トピックは「${topic}」です。`,
    '',
    '【ルール】',
    '・日本語で話してください。',
    '・1〜2文で短く返答してください。',
    '・自然な会話をしてください。',
    '・質問で終わりすぎないようにしてください。'
  ].join('\n');

  // =========================
  // メッセージ構築
  // =========================
  const messages: any[] = [];

  if (lastMessage) {
    messages.push({
      role: 'user',
      content: `${listenerName}: ${lastMessage}`
    });
  } else {
    messages.push({
      role: 'user',
      content: `会話を開始してください。トピック: ${topic}`
    });
  }

  // =========================
  // LM Studio
  // =========================
  if (engine === 'lmstudio') {
    const res = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'qwen2.5-0.5b-instruct',
        messages: [
          { role: 'system', content: system },
          ...messages
        ]
      })
    });

    const data = await res.json();

    const text =
      data.choices?.[0]?.message?.content?.trim() ?? '';

    return json({ message: text });
  }

  // =========================
  // Ollama
  // =========================
  if (engine === 'ollama') {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'qwen:0.5b',
      messages: [
        { role: 'system', content: system },
        ...messages
      ]
    })
  });

  const raw = await res.text();
  console.log('🧪 Ollama raw:', raw);

  let text = '';
  const lines = raw.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const data = JSON.parse(line);

      if (data.done === false) {
        text += data.message?.content ?? '';
      }
    } catch (e) {
      console.warn('JSON parse失敗:', line);
    }
  }

  text = text.trim();

  if (!text) {
    throw error(500, 'Ollamaから空レスポンス');
  }

  return json({ message: text });

} else if (engine === 'openai') {
  const client = getClient();

  const openaiModel =
    model && model.startsWith('gpt')
      ? model
      : 'gpt-4o-mini';

  console.log('🔥 OpenAI実行', {
    model,
    openaiModel
  });

  const completion = await client.chat.completions.create({
    model: openaiModel,
    messages: [
      { role: 'system', content: system },
      ...messages
    ],
    temperature: 0.8,
    max_tokens: 200,
  });

  const text =
    completion.choices[0]?.message?.content?.trim() ?? '';

  if (!text) {
    throw error(500, 'OpenAI から空のレスポンス');
  }

  return json({ message: text });

} else {
  throw error(400, `未対応のengine: ${engine}`);
}}