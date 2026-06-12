import type { ChatImageInput, ProviderChatInput } from './types';

export const OPENAI_DEFAULT_MODEL = 'gpt-5.4-mini';

function openAIUserContent(userMessage: string, images: ChatImageInput[]) {
  if (images.length === 0) return userMessage;

  const parts = images.map((img) => ({
    type: 'input_image',
    image_url: img.dataUrl,
    detail: 'high',
  }));
  parts.push({ type: 'input_text', text: userMessage } as any);
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
  try {
    const response = await client.responses.create({
      model,
      instructions: input.systemPrompt,
      input: [{
        role: 'user',
        content: openAIUserContent(input.userMessage, images) as any,
      }],
      max_output_tokens: input.maxTokens ?? 2048,
      store: false,
    });

    const text = response.output_text ?? '';
    console.log('[MODEL_FINISH]', {
      provider: 'openai',
      api: 'responses',
      status: response.status ?? null,
      visibleLength: text.length,
    });
    return text;
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error('[OPENAI_RESPONSES_ERROR]', { provider: 'openai', model, message });
    throw new Error(`provider=openai model=${model} message=${message}`);
  }
}
