export interface IntentResult {
  intent: 'chat' | 'image' | 'manga' | 'yaml' | 'memory' | 'voice';
  action?: string;
  generate_image?: boolean;
  generate_yaml?: boolean;
  generate_manga?: boolean;
  subtype?: string;
  confidence: number;
  reason?: string;
  source?: 'rules' | 'openai';
  matched_rule?: string;
  matched_keywords?: string[];
  negative_keywords?: string[];
  score_breakdown?: Record<string, number | boolean | string>;
}

export interface AIIntentClassifier {
  name: string;
  classify(text: string): Promise<IntentResult>;
}

const VALID_INTENTS = new Set(['chat', 'image', 'manga', 'yaml', 'memory', 'voice']);

function normalizeIntentResult(value: unknown): IntentResult {
  const data = value as Partial<IntentResult> | null;
  if (!data || typeof data.intent !== 'string' || !VALID_INTENTS.has(data.intent)) {
    throw new Error('Intent Router returned an invalid intent');
  }
  if (typeof data.action !== 'string' || !data.action.trim()) {
    throw new Error('Intent Router returned an invalid action');
  }
  if (
    typeof data.generate_image !== 'boolean'
    || typeof data.generate_yaml !== 'boolean'
    || typeof data.generate_manga !== 'boolean'
  ) {
    throw new Error('Intent Router returned invalid generation flags');
  }
  if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence)) {
    throw new Error('Intent Router returned an invalid confidence');
  }
  if (typeof data.reason !== 'string' || !data.reason.trim()) {
    throw new Error('Intent Router returned an invalid reason');
  }
  return {
    intent: data.intent as IntentResult['intent'],
    action: data.action.trim(),
    generate_image: data.generate_image,
    generate_yaml: data.generate_yaml,
    generate_manga: data.generate_manga,
    confidence: Math.min(1, Math.max(0, data.confidence)),
    reason: data.reason.trim(),
    source: 'openai',
    matched_rule: typeof data.matched_rule === 'string' ? data.matched_rule.trim() : undefined,
    matched_keywords: Array.isArray(data.matched_keywords)
      ? data.matched_keywords.filter((value): value is string => typeof value === 'string')
      : [],
    negative_keywords: Array.isArray(data.negative_keywords)
      ? data.negative_keywords.filter((value): value is string => typeof value === 'string')
      : [],
    score_breakdown: data.score_breakdown && typeof data.score_breakdown === 'object'
      ? data.score_breakdown as Record<string, number | boolean | string>
      : {},
  };
}

const openAIIntentClassifier: AIIntentClassifier = {
  name: 'openai-gpt-5.5-final-router',
  async classify(text: string): Promise<IntentResult> {
    const response = await fetch('/api/intent-router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message ?? `Intent Router HTTP ${response.status}`);
    }
    return normalizeIntentResult(await response.json());
  },
};

let activeAIIntentClassifier: AIIntentClassifier = openAIIntentClassifier;

export function setAIIntentClassifier(classifier: AIIntentClassifier | null): void {
  activeAIIntentClassifier = classifier ?? openAIIntentClassifier;
}

export function classifyIntentAI(text: string): Promise<IntentResult> {
  return activeAIIntentClassifier.classify(text);
}
