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

function summarizeOpenAIPayload(payload: {
  model: string;
  instructions: string;
  input: Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
  }>;
  max_output_tokens: number;
  store: boolean;
}, images: ChatImageInput[]) {
  return {
    ...payload,
    instructions: {
      length: payload.instructions.length,
      preview: payload.instructions.slice(0, 200),
    },
    input: payload.input.map((message) => ({
      role: message.role,
      content: typeof message.content === 'string'
        ? {
          type: 'input_text',
          length: message.content.length,
          preview: message.content.slice(0, 200),
        }
        : message.content.map((part, index) => {
          if (part.type !== 'input_image') {
            const text = typeof part.text === 'string' ? part.text : '';
            return {
              type: part.type,
              length: text.length,
              preview: text.slice(0, 200),
            };
          }

          const dataUrl = typeof part.image_url === 'string' ? part.image_url : '';
          const commaIndex = dataUrl.indexOf(',');
          return {
            type: 'input_image',
            detail: part.detail,
            name: images[index]?.name ?? null,
            mimeType: dataUrl.match(/^data:([^;,]+)/)?.[1] ?? null,
            encodedLength: commaIndex >= 0 ? dataUrl.length - commaIndex - 1 : dataUrl.length,
            dataUrlPrefix: dataUrl.slice(0, Math.min(commaIndex + 1 || 64, 64)),
          };
        }),
    })),
  };
}

export async function chatOpenAI(input: ProviderChatInput & { apiKey?: string }): Promise<string> {
  if (!input.apiKey) throw new Error('OpenAI API key is not set');

  const images = input.images ?? [];
  const model = input.model || OPENAI_DEFAULT_MODEL;
  const apiKey = input.apiKey;
  console.log('[OPENAI KEY SOURCE]', 'settings.json');
  console.log('[OPENAI KEY CONFIGURED]', Boolean(apiKey));
  console.log('[OPENAI MODEL]', model);
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  try {
    const payload = {
      model,
      instructions: input.systemPrompt,
      input: [{
        role: 'user' as const,
        content: openAIUserContent(input.userMessage, images) as any,
      }],
      max_output_tokens: input.maxTokens ?? 2048,
      store: false as const,
    };
    console.log(
      '[OPENAI_RESPONSES_PAYLOAD]',
      JSON.stringify(summarizeOpenAIPayload(payload, images), null, 2),
    );
    console.log('[OPENAI_RESPONSES_INPUT_IMAGE]', {
      included: images.length > 0,
      count: images.length,
    });
    const response = await client.responses.create(payload);

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
