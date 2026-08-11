const DEFAULT_KIZUNA_VOICE_API_URL = 'http://127.0.0.1:8000';

export function resolveKizunaVoiceApiUrl(env: Record<string, string | undefined>): string {
  return (env.KIZUNA_VOICE_API_URL?.trim() || DEFAULT_KIZUNA_VOICE_API_URL).replace(/\/+$/, '');
}

export async function requestKizunaVoice(
  env: Record<string, string | undefined>,
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const baseUrl = resolveKizunaVoiceApiUrl(env);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`Kizuna Voice backend is not reachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function kizunaJsonResponse(response: Response): Promise<Response> {
  const text = await response.text();
  return new Response(text || '{}', {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' },
  });
}
