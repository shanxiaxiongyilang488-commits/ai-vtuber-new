import { extractReplyText, localMessages, logEmptyReply, type ProviderChatInput } from './types';

type OllamaTagsResponse = {
  models?: Array<{ name?: unknown }>;
};

function trimBaseUrl(baseUrl?: string): string {
  return baseUrl?.replace(/\/+$/, '') ?? '';
}

export async function listColabModels(baseUrl?: string): Promise<string[]> {
  const cleanBaseUrl = trimBaseUrl(baseUrl);
  if (!cleanBaseUrl) throw new Error('COLAB_OLLAMA_URL is not set');

  const tagsUrl = `${cleanBaseUrl}/api/tags`;
  const res = await fetch(tagsUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    console.error('Colab Ollama tags API returned non-OK response', {
      url: tagsUrl,
      status: res.status,
      statusText: res.statusText,
      body,
    });
    throw new Error(`Colab Ollama tags API error: ${body}`);
  }

  const data = await res.json() as OllamaTagsResponse;
  return (data.models ?? [])
    .map((model) => model.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

export async function chatColabOllama(input: ProviderChatInput & { baseUrl?: string }): Promise<string> {
  const cleanBaseUrl = trimBaseUrl(input.baseUrl);
  if (!cleanBaseUrl) throw new Error('COLAB_OLLAMA_URL is not set');
  if (!input.model) throw new Error('COLAB_OLLAMA_MODEL is not set');

  const res = await fetch(`${cleanBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: localMessages(input.systemPrompt, input.userMessage),
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Colab Ollama API error: ${msg}`);
  }

  const data = await res.json();
  const replyText = extractReplyText(data);
  if (!replyText.trim()) logEmptyReply('COLAB_OLLAMA', data);
  return replyText;
}
