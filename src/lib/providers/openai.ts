import type { ChatImageInput, ProviderChatInput } from './types';

export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

function openAIUserContent(userMessage: string, images: ChatImageInput[]) {
  if (images.length === 0) return userMessage;

  const parts = images.map((img) => ({
    type: 'image_url',
    image_url: { url: img.dataUrl, detail: 'high' },
  }));
  parts.push({ type: 'text', text: userMessage } as any);
  return parts;
}

export async function chatOpenAI(input: ProviderChatInput & { apiKey?: string }): Promise<string> {
  if (!input.apiKey) throw new Error('OpenAI API key is not set');

  const images = input.images ?? [];
  const model = input.model || OPENAI_DEFAULT_MODEL;
  const apiKey = input.apiKey;
  console.log('[OPENAI KEY SOURCE]', 'settings.json');
  console.log('[OPENAI KEY PREFIX]', apiKey?.slice(0,12));
  console.log('[OPENAI MODEL]', model);
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: openAIUserContent(input.userMessage, images) as any },
    ],
    ...(images.length > 0 ? { max_tokens: 2400 } : {}),
  });

  return completion.choices[0].message.content ?? '';
}
