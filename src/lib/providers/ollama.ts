import { extractReplyText, localMessages, logEmptyReply, type ProviderChatInput } from './types';

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
export const OLLAMA_DEFAULT_MODEL = 'qwen2.5:3b';
export const OLLAMA_TIMEOUT_MS = 120000;

type OllamaTagsResponse = {
  models?: Array<{ name?: unknown }>;
};

function isOllamaTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = err.cause as { code?: unknown; name?: unknown } | undefined;
  return (
    err.name === 'TimeoutError' ||
    cause?.name === 'HeadersTimeoutError' ||
    cause?.code === 'UND_ERR_HEADERS_TIMEOUT'
  );
}

export async function listOllamaModels(): Promise<string[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Ollama Offline: ${body}`);
  }

  const data = await res.json() as OllamaTagsResponse;
  return (data.models ?? [])
    .map((model) => model.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

export async function chatOllama(input: ProviderChatInput): Promise<string> {
  const actualModel = input.model || OLLAMA_DEFAULT_MODEL;
  console.log('[OLLAMA REQUEST START]');

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      body: JSON.stringify({
        model: actualModel,
        messages: localMessages(input.systemPrompt, input.userMessage),
        options: { num_predict: input.maxTokens ?? 2048 },
        stream: false,
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Ollama API error: ${msg}`);
    }

    const data = await res.json();
    console.log('[OLLAMA RESPONSE OK]');
    const replyText = extractReplyText(data);
    console.log('[MODEL_FINISH]', {
      provider: 'ollama',
      finishReason: data?.done_reason ?? null,
      visibleLength: replyText.length,
    });
    if (!replyText.trim()) logEmptyReply('OLLAMA', data);
    return replyText;
  } catch (err) {
    if (isOllamaTimeout(err)) {
      console.log('[OLLAMA TIMEOUT]');
      return '生成中...';
    }

    throw err;
  }
}
