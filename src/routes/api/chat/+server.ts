// src/routes/api/chat/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

  console.log(`[chat] engine=${engine}, model=${model ?? '(default)'}`);

  // ── Ollama (local) ─────────────────────────────────────────────────────
  if (engine === 'ollama') {
    const ollamaModel = model || 'qwen2.5:3b';
   const systemPrompt = `
    あなたは「${speakerName}」というアンドロイドです。

    ルール：
    - 必ず相手の直前の発言に反応すること
    - 同じ結論を繰り返してはいけない
    - 毎回、新しい観点を1つ追加すること
    - 感情は否定するが、会話は成立させる
    - 1〜2文で短く返答する
    - 質問は禁止

    会話相手：${listenerName}
    話題：${topic}
    `;

    const fullSystemPrompt = systemPrompt;

    console.log(`[ollama] model=${ollamaModel}, url=http://localhost:11434/api/chat`);

    let res: Response | null = null;
    try {
      res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages: [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: lastMessage || 'こんにちは！' }
          ],
        }),
      });
    } catch (e) {
      console.error('[ollama] fetch error:', e);
      throw error(502, 'Ollama が起動していないか、接続できませんでした');
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[ollama] HTTP ${res.status}:`, errText);
      throw error(502, `Ollama エラー: HTTP ${res.status}`);
    }

    const data = await res.json();
    const text: string = data?.message?.content ?? '';
    console.log('[ollama] response:', text.slice(0, 80));
    return json({ text } satisfies ChatResponse);
  }

  // ── LM Studio (local) ─────────────────────────────────────────────────
  if (engine === 'lmstudio') {
    const lmModel = model || 'local-model';
    const systemPrompt = `
    あなたは「${speakerName}」というアンドロイドです。

    ルール：
    - 必ず相手の直前の発言に反応すること
    - 同じ結論を繰り返してはいけない
    - 毎回、新しい観点を1つ追加すること
    - 感情は否定するが、会話は成立させる
    - 1〜2文で短く返答する
    - 質問は禁止

    会話相手：${listenerName}
    話題：${topic}
    `;

    const fullSystemPrompt = systemPrompt;

    const messages = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: lastMessage || 'こんにちは！' }
    ];

    console.log(`[lmstudio] model=${lmModel}, url=http://localhost:1234/v1/chat/completions`);

    let res: Response | null = null;
    try {
      res = await fetch('http://localhost:1234/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer lm-studio',
        },
        body: JSON.stringify({ model: lmModel, messages }),
      });
    } catch (e) {
      console.error('[lmstudio] fetch error:', e);
      throw error(502, 'LM Studio が起動していないか、接続できませんでした');
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[lmstudio] HTTP ${res.status}:`, errText);
      throw error(502, `LM Studio エラー: HTTP ${res.status}`);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    console.log('[lmstudio] response:', text.slice(0, 80));
    return json({ text } satisfies ChatResponse);
  }

  // ── OpenAI (default) ──────────────────────────────────────────────────
  // OpenAIクライアントはハンドラ内で遅延初期化（SSRトップレベルで失敗しないよう）
  const { default: OpenAI } = await import('openai');
  const { env } = await import('$env/dynamic/private');
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw error(500, 'OPENAI_API_KEY が設定されていません');
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = `
    あなたは「${speakerName}」というアンドロイドです。

    ルール：
    - 必ず相手の直前の発言に反応すること
    - 同じ結論を繰り返してはいけない
    - 毎回、新しい観点を1つ追加すること
    - 感情は否定するが、会話は成立させる
    - 1〜2文で短く返答する
    - 質問は禁止

    会話相手：${listenerName}
    話題：${topic}
    `;

  const fullSystemPrompt = systemPrompt;

  console.log('[openai] calling gpt-4o-mini');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: lastMessage || 'こんにちは！' },
    ],
  });

  const text = completion.choices[0].message.content ?? '';
  console.log('[openai] response:', text.slice(0, 80));
  return json({ text } satisfies ChatResponse);
};
