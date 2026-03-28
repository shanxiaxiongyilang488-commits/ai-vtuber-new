import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';


export interface ChatRequest {
  systemPrompt: string;
  lastMessage: string;
  speakerName: string;
  listenerName: string;
  topic: string;

  engine?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Request / Response shapes
// ---------------------------------------------------------------------------



export interface ChatResponse {
  text: string;
}

// ---------------------------------------------------------------------------
// OpenAI クライアント（モジュールスコープで1回だけ初期化）
// ---------------------------------------------------------------------------

let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openai) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.startsWith('sk-xxx')) {
      throw error(500, 'OPENAI_API_KEY が設定されていません。.env を確認してください。');
    }
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openai;
}




// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ request }) => {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }
  




  const { systemPrompt, lastMessage, speakerName, listenerName, topic, engine, model } = body;

  if (!speakerName || !listenerName || !topic) {
    throw error(400, 'speakerName / listenerName / topic は必須です');
  }

  // ----- システムプロンプト組み立て -----
  const system = [
    systemPrompt,
    '',
    `あなたの名前は「${speakerName}」です。`,
    `会話相手は「${listenerName}」です。`,
    `会話のトピックは「${topic}」です。`,
    '',
    '【ルール】',
    '- 日本語で話してください。',
    '- 1〜3文程度の短い発言にしてください。',
    '- 自分の名前（${speakerName}）や相手の名前をセリフの冒頭につけないでください。',
    '- 自然な会話の流れを意識してください。',
  ].join('\n');

  // ----- メッセージ配列組み立て -----
  // 相手の直前の発言を user ロールとして渡し、自分の返答を生成させる
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (lastMessage) {
    messages.push({
      role: 'user',
      content: `${listenerName}: ${lastMessage}`,
    });
  } else {
    // 最初の発言 — トピックについて話し始めるよう促す
    messages.push({
      role: 'user',
      content: `（会話を始めてください。トピック:「${topic}」）`,
    });
  }


  // ===== LM Studio分岐 =====
if (engine === 'lmstudio') {
  const res = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: system },
        ...messages
      ]
    })
  });

  const data = await res.json();

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';

  return json({ text });
}

// ===== OpenAI =====
const client = getClient();

const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: system },
    ...messages
  ],
  temperature: 0.85,
  max_tokens: 200,
});

const text = completion.choices[0]?.message?.content?.trim() ?? '';

return json({ text });
  if (!text) {
    throw error(500, 'OpenAI から空のレスポンスが返りました');
  }

  return json({ text } satisfies ChatResponse);
};
