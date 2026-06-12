import type { AIEngine } from '$lib/types/character';
import type { ChatErrorResponse, ChatRequest, ChatResponse } from '../../routes/api/chat/+server';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface IAIEngine {
  generate(
    history: ChatMessage[],
    systemPrompt: string,
    speakerName: string,
    listenerName: string,
    topic: string
  ): Promise<string>;
}

// -------------------------------------------------------------------
// Dummy engine — 開発・テスト用
// -------------------------------------------------------------------
const DUMMY_POOL = [
  'なるほど、それは面白いですね！もう少し詳しく教えてもらえますか？',
  'ええ、私もそう思っていたんです。さすがですね。',
  'うーん、ちょっと違う考え方もあると思うんですけど…どうでしょう？',
  'わあ、それは素晴らしいアイデアですね！さっそく試してみたいです。',
  'ははは、それは面白い視点ですね。私にはなかった発想です。',
  'なんと！それは予想外でした。もう少し教えていただけますか？',
  'そうですね、確かにその通りかもしれません。私もそう感じます。',
  'ちょっと待って、それってつまりどういうことですか？',
  '難しい問題ですね。一緒に考えてみましょうか。',
  'すごい！それは本当に面白いですね。私も似たようなことを考えていました。',
  'そういう見方もあるんですね。勉強になります！',
  'まったくその通り！よく気づきましたね。',
];

export class DummyAIEngine implements IAIEngine {
  private index = 0;

  async generate(
    _history: ChatMessage[],
    _systemPrompt: string,
    _speakerName: string,
    _listenerName: string,
    _topic: string
  ): Promise<string> {
    const delay = 600 + Math.random() * 1000;
    await new Promise((r) => setTimeout(r, delay));
    const text = DUMMY_POOL[this.index % DUMMY_POOL.length];
    this.index++;
    return text;
  }
}

// -------------------------------------------------------------------
// OpenAI engine — /api/chat エンドポイント経由で GPT-4o-mini を呼ぶ
// APIキーはサーバー側にのみ存在し、クライアントには漏れない。
// -------------------------------------------------------------------
export class OpenAIEngine implements IAIEngine {
  async generate(
    history: ChatMessage[],
    systemPrompt: string,
    speakerName: string,
    listenerName: string,
    topic: string
  ): Promise<string> {
    // 直前の相手の発言だけを渡す（簡易実装）
    const lastOpponentMessage = [...history]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.content.startsWith(`${speakerName}:`));

    const lastMessage = lastOpponentMessage
      ? lastOpponentMessage.content.replace(/^[^:]+:\s*/, '') // "名前: " プレフィックスを除去
      : '';

    const requestBody: ChatRequest = {
      systemPrompt,
      lastMessage,
      speakerName,
      listenerName,
      topic,
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const fallbackMessage = `HTTP ${response.status}`;
      const data = await response.json().catch(() => null) as ChatErrorResponse | null;
      const provider = data?.error?.provider ?? 'openai';
      const model = data?.error?.model ?? 'unknown';
      const message = data?.error?.message ?? fallbackMessage;
      throw new Error(`provider=${provider} model=${model} message=${message}`);
    }

    const data: ChatResponse = await response.json();
    return data.text;
  }
}

// -------------------------------------------------------------------
// Ollama engine — ローカルで動いている Ollama に直接リクエストを送る
// Ollama が起動していない場合は分かりやすいエラーを投げる。
//
// CORS 注意: SvelteKit dev サーバー（localhost:5173）から localhost:11434 への
// クロスオリジンリクエストが必要なため、Ollama 側で許可が必要な場合がある。
// 環境変数 OLLAMA_ORIGINS=* を設定するか、同一オリジンで動作させること。
// -------------------------------------------------------------------
export class OllamaEngine implements IAIEngine {
  constructor(private model: string = 'qwen:0.5b') {}

  async generate(
    history: ChatMessage[],
    systemPrompt: string,
    speakerName: string,
    listenerName: string,
    topic: string
  ): Promise<string> {
    const lastOpponentMsg = [...history]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.content.startsWith(`${speakerName}:`));

    const lastMessage = lastOpponentMsg
      ? lastOpponentMsg.content.replace(/^[^:]+:\s*/, '')
      : 'こんにちは！';

    const fullSystemPrompt = [
      systemPrompt,
      `あなたの名前は「${speakerName}」です。`,
      `会話相手は「${listenerName}」です。`,
      `話題: ${topic}`,
      '「名前:」のようなプレフィックスを付けず、セリフだけを短く返してください。',
    ].join('\n');

    const messages = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: lastMessage },
    ];

    const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    systemPrompt,
    lastMessage,
    speakerName,
    listenerName,
    topic,
    engine: 'ollama',
    model: this.model
  })
});

const data = await response.json();
return data.text;
  }
}

export class LMStudioEngine implements IAIEngine {
  constructor(private model: string = '') {}

  async generate(
    history: ChatMessage[],
    systemPrompt: string,
    speakerName: string,
    listenerName: string,
    topic: string
  ): Promise<string> {

    const lastOpponentMsg = [...history]
      .reverse()
      .find((m) => m.role === 'assistant');

    const lastMessage = lastOpponentMsg
      ? lastOpponentMsg.content.replace(/^[^:]+:\s*/, '')
      : 'こんにちは！';

    const messages = [
  {
    role: 'system',
    content: `${systemPrompt}

    必ず会話形式で返答してください。
    必ず日本語で会話してください。
    説明は禁止です。
    短くテンポよく話してください。
    雑談してください。
    `
      },
      {
        role: 'user',
        content: lastMessage
      }
    ];

    const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    systemPrompt,
    lastMessage,
    speakerName,
    listenerName,
    topic,
    engine: 'lmstudio',
    model: this.model
  })
});

const data = await response.json();
return data.text;
  }
}

// -------------------------------------------------------------------
// Factory
// -------------------------------------------------------------------
export function createAIEngine(engine: AIEngine, ollamaModel?: string): IAIEngine {
  switch (engine) {
    case 'openai':
      return new OpenAIEngine();
    case 'ollama':
      return new OllamaEngine(ollamaModel ?? 'qwen:0.5b');
    case 'lmstudio':  
      return new LMStudioEngine(ollamaModel ?? '');
    case 'gemini':
      console.warn('[AIEngine] Gemini not yet implemented → using Dummy');
      return new DummyAIEngine();
    case 'dummy':
    default:
      return new DummyAIEngine();
  }
}
