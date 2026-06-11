import type { ChatImageInput, ProviderChatInput } from './types';

export const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function claudeUserContent(userMessage: string, images: ChatImageInput[]) {
  if (images.length === 0) return userMessage;

  const parts: any[] = images.map((img) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.dataUrl.match(/^data:(.*?);/)?.[1] ?? 'image/jpeg',
      data: img.dataUrl.split(',')[1] ?? '',
    },
  }));
  parts.push({ type: 'text', text: userMessage });
  return parts;
}

export async function chatClaude(input: ProviderChatInput & { apiKey?: string }): Promise<string> {
  if (!input.apiKey) throw new Error('Anthropic API key is not set');

  const images = input.images ?? [];
  const model = input.model || CLAUDE_DEFAULT_MODEL;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 2048,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: claudeUserContent(input.userMessage, images) }],
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Claude API error: ${msg}`);
  }

  const data = await res.json();
  const text = (data?.content ?? [])
    .filter((part: { type?: string; text?: unknown }) => part?.type === 'text' && typeof part?.text === 'string')
    .map((part: { text: string }) => part.text)
    .join('');
  console.log('[MODEL_FINISH]', {
    provider: 'claude',
    finishReason: data?.stop_reason ?? null,
    visibleLength: text.length,
  });
  return text;
}
