import { extractReplyText, localMessages, logEmptyReply, type ProviderChatInput } from './types';

export const LM_STUDIO_BASE_URL = 'http://127.0.0.1:1234/v1';
export const LM_STUDIO_API_KEY = 'lm-studio';
export const LM_STUDIO_DEFAULT_MODEL = 'qwen/qwen3-4b';

type LMStudioModelsResponse = {
  data?: Array<{ id?: unknown }>;
};

export async function listLMStudioModels(): Promise<string[]> {
  const res = await fetch(`${LM_STUDIO_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${LM_STUDIO_API_KEY}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`LM Studio Offline: ${body}`);
  }

  const data = await res.json() as LMStudioModelsResponse;
  return (data.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

export async function chatLMStudio(input: ProviderChatInput): Promise<string> {
  const res = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LM_STUDIO_API_KEY}`,
    },
    body: JSON.stringify({
      model: input.model || LM_STUDIO_DEFAULT_MODEL,
      messages: localMessages(input.systemPrompt, input.userMessage),
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2048,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`LM Studio API error: ${body}`);
  }

  const data = await res.json();
  const replyText = extractReplyText(data);
  console.log('[MODEL_FINISH]', {
    provider: 'lmstudio',
    finishReason: data?.choices?.[0]?.finish_reason ?? null,
    visibleLength: replyText.length,
  });
  if (!replyText.trim()) logEmptyReply('LM_STUDIO', data);
  return replyText;
}
