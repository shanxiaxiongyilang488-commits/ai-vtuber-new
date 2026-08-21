import { readSettings, type ApiSettings } from './settings';
import { extractAiJson } from './aiJson';
import tls from 'node:tls';

export const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.5-flash';
export const GEMINI_API_VERSION = 'v1beta';

export type GeminiTextModelSource = 'env' | 'settings.gemini.model' | 'settings.chatConfig.model' | 'default';

export type GeminiTextModelConfig = {
  model: string;
  source: GeminiTextModelSource;
  normalizedFrom?: string;
};

export type GeminiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type GeminiRequestMetrics = {
  model: string;
  latencyMs: number;
  usage: GeminiUsage;
};

let systemCaApplied = false;

function applySystemCertificateAuthorities(): void {
  if (systemCaApplied) return;
  systemCaApplied = true;
  try {
    const defaults = tls.getCACertificates('default');
    const system = tls.getCACertificates('system');
    if (system.length > 0) {
      tls.setDefaultCACertificates(Array.from(new Set([...defaults, ...system])));
      console.log('[GEMINI_TLS_CA]', { default: defaults.length, system: system.length, applied: true });
    }
  } catch (error) {
    console.warn('[GEMINI_TLS_CA_ERROR]', error instanceof Error ? error.message : String(error));
  }
}

applySystemCertificateAuthorities();

function normalizeTextModel(model: string): { model: string; normalizedFrom?: string } {
  const trimmed = model.trim();
  if (!trimmed) return { model: DEFAULT_GEMINI_TEXT_MODEL };
  if (trimmed === DEFAULT_GEMINI_TEXT_MODEL) return { model: trimmed };
  if (/^gemini-(?:pro|[0-9].*(?:flash|pro|preview))/i.test(trimmed) && !/image/i.test(trimmed)) {
    return { model: DEFAULT_GEMINI_TEXT_MODEL, normalizedFrom: trimmed };
  }
  return { model: trimmed };
}

export async function getGeminiTextModelConfig(settings?: ApiSettings): Promise<GeminiTextModelConfig> {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) {
    const normalized = normalizeTextModel(envModel);
    return { source: 'env', ...normalized };
  }

  const resolvedSettings = settings ?? await readSettings();
  const geminiModel = resolvedSettings.gemini.model?.trim();
  if (geminiModel) {
    const normalized = normalizeTextModel(geminiModel);
    return { source: 'settings.gemini.model', ...normalized };
  }

  const chatModel = resolvedSettings.chatConfig.provider === 'gemini' ? resolvedSettings.chatConfig.model?.trim() : '';
  if (chatModel) {
    const normalized = normalizeTextModel(chatModel);
    return { source: 'settings.chatConfig.model', ...normalized };
  }

  return { model: DEFAULT_GEMINI_TEXT_MODEL, source: 'default' };
}

export function geminiGenerateContentUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent?key=${apiKey}`;
}

export function geminiUsageFromResponse(data: unknown): GeminiUsage {
  const usage = data && typeof data === 'object'
    ? (data as { usageMetadata?: Record<string, unknown> }).usageMetadata
    : undefined;
  return {
    inputTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : undefined,
    outputTokens: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined,
    totalTokens: typeof usage?.totalTokenCount === 'number' ? usage.totalTokenCount : undefined,
  };
}

type GeminiCandidateParts = {
  raw: string;
  finishReason: string;
  partCount: number;
  usageMetadata: unknown;
};

/** candidates[0] から thought パートを除く全テキストを連結して返す（JSONの複数パート分割対応）。 */
export function geminiCandidateParts(data: unknown): GeminiCandidateParts {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const candidate = (Array.isArray(record.candidates) ? record.candidates[0] : undefined) as
    | { finishReason?: unknown; content?: { parts?: unknown } }
    | undefined;
  const parts: unknown[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const raw = parts
    .map((part) => (part && typeof part === 'object' ? part as { text?: unknown; thought?: unknown } : {}))
    .filter((part) => typeof part.text === 'string' && part.thought !== true)
    .map((part) => String(part.text))
    .join('');
  return {
    raw,
    finishReason: String(candidate?.finishReason ?? ''),
    partCount: parts.length,
    usageMetadata: record.usageMetadata ?? null,
  };
}

/**
 * Gemini の JSON 応答を抽出・パースする。
 * gemini-3.5-flash は thinking トークンが maxOutputTokens に含まれるため、予算不足時に
 * JSON が途中切断される（finishReason=MAX_TOKENS）。空応答・パース失敗時は logTag で
 * finishReason / usageMetadata / 生テキストを必ずログに残してから throw する。
 */
export function geminiParseJsonResponse(
  data: unknown,
  options: { label: string; logTag: string; context?: Record<string, unknown> },
): { parsed: unknown; raw: string; finishReason: string } {
  const { raw, finishReason, partCount, usageMetadata } = geminiCandidateParts(data);
  if (!raw.trim()) {
    console.warn(options.logTag, { ...options.context, finishReason, partCount, usageMetadata, raw: '' });
    throw new Error(`${options.label} returned an empty response (finishReason=${finishReason || 'unknown'})`);
  }
  try {
    // テキスト→JSONの抽出はプロバイダ共通ヘルパー（フェンス除去・説明文除去・配列対応）に委譲する。
    const parsed = extractAiJson(raw, options.label);
    return { parsed, raw, finishReason };
  } catch (parseError) {
    console.warn(options.logTag, {
      ...options.context,
      finishReason,
      partCount,
      usageMetadata,
      rawLength: raw.length,
      raw: raw.slice(0, 1000),
    });
    throw parseError;
  }
}

export function geminiFetchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    const code = 'code' in cause ? String((cause as { code?: unknown }).code ?? '') : '';
    const causeMessage = 'message' in cause ? String((cause as { message?: unknown }).message ?? '') : '';
    return [error.message, code, causeMessage].filter(Boolean).join(' / ');
  }
  return error.message;
}
