import { env } from '$env/dynamic/private';
import { extractReplyText, localMessages, type ProviderChatInput } from './types';

/**
 * Grok (xAI) provider — AI Provider V2 foundation.
 *
 * Scope for this phase: scaffolding only. This file establishes the call shape
 * and, crucially, the API-key fallback so that selecting Grok never stops the
 * app. The live Character Memory chat path still routes Grok to its fallback
 * provider via aiProviderRouter — the lab-chat / MEMORYCORE backend is untouched.
 *
 * xAI exposes an OpenAI-compatible Chat Completions API at https://api.x.ai/v1.
 * Wire `chatGrok` into the backend (and replace the OpenAI fallback in
 * aiProviderRouter) once XAI_API_KEY is provisioned.
 */
export const GROK_DEFAULT_MODEL = 'grok-4';
const GROK_BASE_URL = 'https://api.x.ai/v1';

/** True only when an xAI API key (XAI_API_KEY) is configured. */
export function hasGrokApiKey(): boolean {
  return Boolean(env.XAI_API_KEY);
}

/**
 * Result of a Grok call. `ok: false` with reason `'no-api-key'` is the
 * non-fatal fallback returned when XAI_API_KEY is missing — the caller decides
 * how to fall back (e.g. route to OpenAI) instead of crashing.
 */
export type GrokChatResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'no-api-key'; text: '' };

/**
 * Foundation for the Grok API call.
 *
 * When XAI_API_KEY is missing it warns and returns a non-fatal fallback result
 * instead of throwing, so selecting Grok never stops the app.
 */
export async function chatGrok(
  input: ProviderChatInput & { apiKey?: string; baseUrl?: string },
): Promise<GrokChatResult> {
  const apiKey = input.apiKey ?? env.XAI_API_KEY;
  if (!apiKey) {
    console.warn('Grok API key not found');
    return { ok: false, reason: 'no-api-key', text: '' };
  }

  const model = input.model || GROK_DEFAULT_MODEL;
  const baseUrl = (input.baseUrl || GROK_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: localMessages(input.systemPrompt, input.userMessage),
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2048,
      stream: false,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Grok API error: ${msg}`);
  }

  const data = await res.json();
  const text = extractReplyText(data);
  console.log('[MODEL_FINISH]', {
    provider: 'grok',
    model,
    finishReason: data?.choices?.[0]?.finish_reason ?? null,
    usage: data?.usage ?? null,
    visibleLength: text.length,
  });
  return { ok: true, text };
}
