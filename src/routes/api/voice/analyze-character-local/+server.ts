import { json, type RequestHandler } from '@sveltejs/kit';
import { getCharacter, getCharacterReferenceDataUrl } from '$lib/server/characterRegistry';
import {
  buildLocalCharacterVoiceProposal,
  type LocalCharacterVoiceProposal,
} from '$lib/localCharacterVoice';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const VISION_MODEL_PATTERN = /(?:llava|bakllava|moondream|gemma3|qwen[^:]*-?vl|minicpm-v|granite3.*vision)/i;

type OllamaModel = {
  name?: string;
  model?: string;
  capabilities?: string[];
};

type LocalVoiceAnalyzeResponse = LocalCharacterVoiceProposal & {
  backend: 'ollama-vision' | 'local-visual-profile';
  model: string;
  usedImagePixels: boolean;
  notice: string;
};

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Local Vision response is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function normalizeVisionProposal(
  parsed: Record<string, unknown>,
  fallback: LocalCharacterVoiceProposal,
): LocalCharacterVoiceProposal {
  const rawCaption = clean(parsed.caption, 1400);
  const summary = clean(parsed.summary, 180) || fallback.summary;
  const testPhrase = clean(parsed.testPhrase, 120) || fallback.testPhrase;
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons.map((reason) => clean(reason, 180)).filter(Boolean).slice(0, 5)
    : fallback.reasons;
  if (rawCaption.length < 20) throw new Error('Local Vision did not return a usable voice caption');
  return {
    caption: `LOCAL CHARACTER VOICE DESIGN — HIGHEST PRIORITY. ${rawCaption}`,
    summary,
    reasons: reasons.length ? reasons : fallback.reasons,
    testPhrase,
  };
}

async function listLocalModels(): Promise<OllamaModel[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json() as { models?: OllamaModel[] };
  return Array.isArray(data.models) ? data.models : [];
}

function selectVisionModel(models: OllamaModel[], configuredModel: string): string {
  if (configuredModel) {
    const configured = models.find((entry) => (entry.name ?? entry.model) === configuredModel);
    if (configured) return configuredModel;
  }
  const matched = models.find((entry) => (
    entry.capabilities?.includes('vision')
    || VISION_MODEL_PATTERN.test(entry.name ?? entry.model ?? '')
  ));
  return matched?.name ?? matched?.model ?? '';
}

async function analyzeWithOllama(
  model: string,
  imageDataUrl: string,
  character: NonNullable<ReturnType<typeof getCharacter>>,
  fallback: LocalCharacterVoiceProposal,
): Promise<LocalCharacterVoiceProposal> {
  const imageBase64 = imageDataUrl.replace(/^data:[^;,]+;base64,/i, '');
  const visual = character.characterBible?.characters[0] ?? null;
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0.25, num_predict: 1200 },
      messages: [
        {
          role: 'system',
          content: [
            'You are a local character voice director. Analyze the attached fictional character image.',
            'Propose a voice that SUITS the design; do not claim age, gender, personality, or biography as facts.',
            'Do not imitate or name a real person, actor, celebrity, or existing copyrighted character voice.',
            'The result is a reversible suggestion for local Irodori TTS.',
            'Return JSON only: {"caption":"detailed Japanese voice design description","summary":"short Japanese label","reasons":["short Japanese visible-design reason"],"testPhrase":"natural Japanese audition line"}.',
            'Describe pitch range, vocal weight, transparency, brightness, softness, articulation, tempo, emotional range, and any subtle artificial precision.',
            'Keep the voice natural enough for long conversations. Avoid audio effects and excessive caricature.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            characterName: character.name,
            roleHint: character.role || null,
            settingHint: character.description || null,
            storedVisualDescription: visual,
            fallbackDirection: fallback.summary,
          }),
          images: [imageBase64],
        },
      ],
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Ollama Vision HTTP ${response.status}: ${message.slice(0, 240)}`);
  }
  const data = await response.json() as { message?: { content?: string }; response?: string };
  const text = data.message?.content ?? data.response ?? '';
  return normalizeVisionProposal(parseJsonObject(text), fallback);
}

export const POST: RequestHandler = async ({ request }) => {
  let body: { characterId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = clean(body.characterId, 80).toLowerCase();
  if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });

  let character: ReturnType<typeof getCharacter>;
  try {
    character = getCharacter(characterId);
  } catch {
    character = null;
  }
  if (!character) return json({ message: 'character not found' }, { status: 404 });
  if (!character.hasReference) return json({ message: 'Character Ref image is required' }, { status: 400 });

  const visual = character.characterBible?.characters[0];
  const fallback = buildLocalCharacterVoiceProposal({
    name: character.name,
    role: character.role,
    description: character.description,
    ...(visual ? { visual } : {}),
  });

  const { env } = await import('$env/dynamic/private');
  const configuredModel = clean(env.LOCAL_VISION_MODEL, 120);
  try {
    const models = await listLocalModels();
    const model = selectVisionModel(models, configuredModel);
    if (model) {
      const imageDataUrl = getCharacterReferenceDataUrl(character.id);
      if (imageDataUrl) {
        try {
          const proposal = await analyzeWithOllama(model, imageDataUrl, character, fallback);
          const result: LocalVoiceAnalyzeResponse = {
            ...proposal,
            backend: 'ollama-vision',
            model,
            usedImagePixels: true,
            notice: '画像ピクセルをローカルOllamaで解析しました。クラウド送信はありません。',
          };
          return json(result, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
          console.warn('[local-character-voice] Ollama Vision fallback:', error);
        }
      }
    }

    const result: LocalVoiceAnalyzeResponse = {
      ...fallback,
      backend: 'local-visual-profile',
      model: 'deterministic-local-v1',
      usedImagePixels: false,
      notice: visual
        ? 'Visionモデル未検出のため、画像から保存済みのCharacter YAMLをローカルで声へ変換しました。'
        : 'Visionモデル未検出のため、登録された役割・説明からローカルで仮の声を提案しました。',
    };
    return json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('[local-character-voice] Ollama unavailable:', error);
    const result: LocalVoiceAnalyzeResponse = {
      ...fallback,
      backend: 'local-visual-profile',
      model: 'deterministic-local-v1',
      usedImagePixels: false,
      notice: visual
        ? 'Ollama停止中のため、画像から保存済みのCharacter YAMLをローカルで声へ変換しました。'
        : 'Ollama停止中のため、登録された役割・説明からローカルで仮の声を提案しました。',
    };
    return json(result, { headers: { 'Cache-Control': 'no-store' } });
  }
};
