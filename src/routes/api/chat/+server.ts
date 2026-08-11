import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { muryiPersona } from '$lib/ai/personas'
import { buildCharacterPrompt } from '$lib/ai/prompts/buildCharacterPrompt'
import { buildMemoryContext, recordMemoryCoreTurn, type BuiltMemoryPrompt, type MemoryCoreRequest } from '$lib/ai/memory-core/memoryCore';
import { generateText } from '$lib/aiRouter';
import { readSettings } from '$lib/server/settings';
import { buildCharacterTimeTonePrompt, buildEnergyPrompt, buildTimeCorePrompt, getTimeCore } from '../../../core/timeCore';

// =========================
// 型定義
// =========================
export interface ChatRequest {
  systemPrompt?: string;
  lastMessage: string;
  speakerName: string;
  listenerName: string;
  topic: string;
  engine?: 'openai' | 'grok' | 'gemini' | 'claude' | 'ollama' | 'lmstudio' | 'colab-ollama';
  model?: string;
  memory?: MemoryCoreRequest;
}

export interface ChatResponse {
  text: string;
  memory?: BuiltMemoryPrompt['debug'];
}

export interface ChatErrorResponse {
  error: {
    provider: string;
    model: string;
    message: string;
  };
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
    engine,
    model,
    memory
  } = body as ChatRequest;

  const settings = await readSettings();
  const actualEngine = engine ?? settings.chatConfig.provider;
  const configuredChatModel = engine ? model : (model || settings.chatConfig.model);
  console.log('[CHAT_PROVIDER]', actualEngine);
  console.log('[CHAT_MODEL]', configuredChatModel || '(default)');
  console.log(`[chat] engine=${actualEngine}`);

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
  const configuredSystemPrompt =
    systemPrompt && systemPrompt.trim().length > 0
      ? systemPrompt
      : defaultPrompt;
  const timeCore = getTimeCore();
  const finalSystemPrompt = [
    configuredSystemPrompt,
    buildTimeCorePrompt(timeCore),
    buildEnergyPrompt(timeCore, `${speakerName}\n${configuredSystemPrompt}`),
    buildCharacterTimeTonePrompt(timeCore, `${speakerName}\n${configuredSystemPrompt}`),
  ].filter(Boolean).join('\n\n');

  const memoryContext = buildMemoryContext({
    baseSystemPrompt: finalSystemPrompt,
    userInput: lastMessage || topic || '',
    memory
  });

  const messages = [
    { role: 'system' as const, content: memoryContext.systemPrompt },
    { role: 'user' as const, content: lastMessage || 'こんにちは！' }
  ];

  const memoryDebug = memory?.enabled ? memoryContext.debug : undefined;
  const saveMemoryTurn = async (text: string) => {
    if (!memory?.enabled) return;

    await recordMemoryCoreTurn({
      characterId: memory.characterId,
      userInput: lastMessage || topic || '',
      assistantReply: text,
      longTermMemories: memory.longTermMemories,
      sharedMemories: memory.sharedMemories,
      characterMemories: memory.characterMemories
    });
  };

  // =========================
  // Ollama
  // =========================
  if (actualEngine === 'ollama') {
    const ollamaModel = configuredChatModel || 'qwen2.5:3b';

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, messages, stream: false })
    });

    const data = await res.json();
    const text: string = data?.message?.content ?? '';

    await saveMemoryTurn(text);
    return json({ text, memory: memoryDebug });
  }

  // =========================
  // Colab Ollama (OpenAI互換)
  // =========================
  if (actualEngine === 'colab-ollama') {
    const baseUrl = env.COLAB_OLLAMA_URL?.replace(/\/+$/, '');
    const colabModel = configuredChatModel || env.COLAB_OLLAMA_MODEL;

    if (!baseUrl) {
      throw error(500, 'COLAB_OLLAMA_URL が未設定');
    }

    if (!colabModel) {
      throw error(500, 'COLAB_OLLAMA_MODEL が未設定');
    }

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: colabModel, messages })
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      throw error(503, `Colab Ollama API error: ${msg}`);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';

    await saveMemoryTurn(text);
    return json({ text, memory: memoryDebug });
  }

  // =========================
  // LM Studio
  // =========================
  if (actualEngine === 'lmstudio') {
    const lmModel = configuredChatModel || settings.local.model || 'qwen/qwen3-4b';

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

    await saveMemoryTurn(text);
    return json({ text, memory: memoryDebug });
  }

  const defaultModel =
    actualEngine === 'grok'
      ? settings.grok.model || 'grok-4.5'
        : actualEngine === 'gemini'
        ? settings.gemini.model || 'gemini-3.5-flash'
      : actualEngine === 'claude'
        ? settings.anthropic.model || 'claude-haiku-4-5-20251001'
        : settings.openai.model || 'gpt-5.4-mini';

  let text: string;
  const actualModel = configuredChatModel || defaultModel;

  try {
    text = await generateText({
      model: actualModel,
      messages
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error('[CHAT_API_ERROR]', {
      provider: actualEngine,
      model: actualModel,
      message,
    });
    return json({
      error: {
        provider: actualEngine,
        model: actualModel,
        message,
      },
    } satisfies ChatErrorResponse, { status: 502 });
  }

  await saveMemoryTurn(text);
  return json({ text, memory: memoryDebug });
};
