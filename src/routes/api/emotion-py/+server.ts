import { json, error } from '@sveltejs/kit';

const PYTHON_URL = 'http://localhost:8000/analyze';

// ---------- 型定義 ----------

export interface EmotionRequest {
  text: string;
  current_emotion?: string;
  trust?: number;
}

export interface EmotionResponse {
  emotion: string;
  confidence: number;
  delta_trust: number;
  reason: string;
  source: 'python' | 'fallback';
}

// ---------- エンドポイント ----------

export async function POST({ request }: { request: Request }) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  if (!body || typeof body !== 'object') {
    throw error(400, 'Request body must be an object');
  }

  const { text, current_emotion = 'neutral', trust = 50 } = body as EmotionRequest;

  if (!text || typeof text !== 'string') {
    throw error(400, 'text field is required');
  }

  // Python サーバーへ中継
  try {
    const res = await fetch(PYTHON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, current_emotion, trust }),
      signal: AbortSignal.timeout(3000)  // 3秒でタイムアウト
    });

    if (!res.ok) {
      throw new Error(`Python server returned ${res.status}`);
    }

    const data = await res.json() as Omit<EmotionResponse, 'source'>;

    return json({ ...data, source: 'python' } satisfies EmotionResponse);

  } catch (e) {
    // Python が落ちていても UI を壊さない: fallback を返す
    const isOffline =
      e instanceof TypeError ||      // fetch failed (connection refused)
      (e instanceof Error && e.name === 'TimeoutError');

    console.warn('[emotion-py] Python server unavailable, returning fallback:', e);

    if (isOffline) {
      return json({
        emotion: current_emotion,
        confidence: 0,
        delta_trust: 0,
        reason: 'python_offline',
        source: 'fallback'
      } satisfies EmotionResponse);
    }

    throw error(502, 'Emotion engine error');
  }
};
