export interface IntentResult {
  intent:
    | 'chat'
    | 'image'
    | 'manga'
    | 'yaml'
    | 'memory'
    | 'voice';
  subtype?: string;
  confidence: number;
  reason?: string;
  source?: 'rules' | 'gemini';
}

export interface AIIntentClassifier {
  name: string;
  classify(text: string): Promise<IntentResult>;
}

const geminiAIIntentClassifier: AIIntentClassifier = {
  name: 'gemini-intent-router',
  async classify(text: string): Promise<IntentResult> {
    try {
      const res = await fetch('/api/intent-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        console.warn('[intent-router] Gemini route failed:', res.status);
        return { intent: 'chat', confidence: 0.55, reason: `Gemini Router HTTP ${res.status}`, source: 'gemini' };
      }
      const data = await res.json();
      return normalizeIntentResult(data);
    } catch (error) {
      console.warn('[intent-router] Gemini route error:', error);
      return { intent: 'chat', confidence: 0.55, reason: 'Gemini Router呼び出しに失敗', source: 'gemini' };
    }
  },
};

const VALID_INTENTS = new Set(['chat', 'image', 'manga', 'yaml', 'memory', 'voice']);

function normalizeIntentResult(value: unknown): IntentResult {
  const data = value as Partial<IntentResult> | null;
  const intent = typeof data?.intent === 'string' && VALID_INTENTS.has(data.intent)
    ? data.intent as IntentResult['intent']
    : 'chat';
  const confidence = typeof data?.confidence === 'number' && Number.isFinite(data.confidence)
    ? Math.min(1, Math.max(0, data.confidence))
    : 0.55;
  const subtype = typeof data?.subtype === 'string' && data.subtype.trim()
    ? data.subtype.trim()
    : undefined;
  const reason = typeof data?.reason === 'string' && data.reason.trim()
    ? data.reason.trim()
    : 'Gemini Routerで分類';
  return { intent, subtype, confidence, reason, source: 'gemini' };
}

let activeAIIntentClassifier: AIIntentClassifier = geminiAIIntentClassifier;

export function setAIIntentClassifier(classifier: AIIntentClassifier | null): void {
  activeAIIntentClassifier = classifier ?? geminiAIIntentClassifier;
}

export async function classifyIntentAI(text: string): Promise<IntentResult> {
  return activeAIIntentClassifier.classify(text);
}
