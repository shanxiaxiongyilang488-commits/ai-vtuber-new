import type { ChatImageInput, ProviderChatInput } from './types';

export const OPENAI_DEFAULT_MODEL = 'gpt-5.4-mini';
export const OPENAI_ORCHESTRATION_MODEL = 'gpt-5.5';
export const OPENAI_FALLBACK_MODEL = 'gpt-5.5';

export type OpenAIChatResult = { text: string; model: string; fallbackFrom?: string };

function shouldFallbackFromGPT56(model: string, error: unknown): boolean {
  if (!model.startsWith('gpt-5.6-')) return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined;
  const code = typeof candidate?.code === 'string' ? candidate.code.toLowerCase() : '';
  const message = String(candidate?.message ?? error).toLowerCase();
  return status === 403 || status === 404
    || code === 'model_not_found'
    || /model.*(?:not found|does not exist|not available|access|permission)|(?:access|permission).*model/.test(message);
}

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
  reasoning?: { effort: 'low' | 'high' };
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

export async function chatOpenAIWithModel(input: ProviderChatInput & { apiKey?: string }): Promise<OpenAIChatResult> {
  if (!input.apiKey) throw new Error('OpenAI API key is not set');

  const images = input.images ?? [];
  const model = input.model || OPENAI_DEFAULT_MODEL;
  const apiKey = input.apiKey;
  console.log('[OPENAI KEY SOURCE]', 'settings.json');
  console.log('[OPENAI KEY CONFIGURED]', Boolean(apiKey));
  console.log('[OPENAI MODEL]', model);
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const createResponse = async (requestModel: string) => {
    const supportsReasoningEffort = /^gpt-5(?:[.-]|$)/i.test(requestModel);
    const payload = {
      model: requestModel,
      instructions: input.systemPrompt,
      input: [{
        role: 'user' as const,
        content: openAIUserContent(input.userMessage, images) as any,
      }],
      max_output_tokens: input.maxTokens ?? 2048,
      store: false as const,
      ...(supportsReasoningEffort && input.reasoningEffort
        ? { reasoning: { effort: input.reasoningEffort } }
        : {}),
    };
    console.log(
      '[OPENAI_RESPONSES_PAYLOAD]',
      JSON.stringify(summarizeOpenAIPayload(payload, images), null, 2),
    );
    console.log('[OPENAI_RESPONSES_INPUT_IMAGE]', {
      requestId: input.requestId ?? null,
      included: images.length > 0,
      count: images.length,
    });
    return client.responses.create(payload);
  };
  try {
    let response;
    let actualModel = model;
    let fallbackFrom: string | undefined;
    try {
      response = await createResponse(model);
    } catch (error) {
      if (!shouldFallbackFromGPT56(model, error)) throw error;
      fallbackFrom = model;
      actualModel = OPENAI_FALLBACK_MODEL;
      console.warn('[OPENAI_MODEL_FALLBACK]', { from: model, to: actualModel });
      response = await createResponse(actualModel);
    }

    const text = response.output_text ?? '';
    console.log('[MODEL_FINISH]', {
      provider: 'openai',
      api: 'responses',
      status: response.status ?? null,
      visibleLength: text.length,
    });
    return { text, model: actualModel, ...(fallbackFrom ? { fallbackFrom } : {}) };
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error('[OPENAI_RESPONSES_ERROR]', { provider: 'openai', model, message });
    throw new Error(`provider=openai model=${model} message=${message}`);
  }
}

export async function chatOpenAI(input: ProviderChatInput & { apiKey?: string }): Promise<string> {
  return (await chatOpenAIWithModel(input)).text;
}
