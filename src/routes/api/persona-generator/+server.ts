import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

type PersonaGeneratorResponse = {
  name: string;
  firstPerson: string;
  secondPerson: string;
  thirdPerson: string;
  speakingStyle: string;
  catchphrase: string;
  sentenceEnding: string;
  angerStyle: string;
};

function parsePersonaJson(text: string): PersonaGeneratorResponse {
  const trimmed = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('JSON が見つかりませんでした');
  }

  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Partial<PersonaGeneratorResponse>;
  const result: Record<keyof PersonaGeneratorResponse, unknown> = {
    name: parsed.name,
    firstPerson: parsed.firstPerson,
    secondPerson: parsed.secondPerson,
    thirdPerson: parsed.thirdPerson,
    speakingStyle: parsed.speakingStyle,
    catchphrase: parsed.catchphrase,
    sentenceEnding: parsed.sentenceEnding,
    angerStyle: parsed.angerStyle
  };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${key} が不正です`);
    }
  }

  return {
    name: String(result.name).trim(),
    firstPerson: String(result.firstPerson).trim(),
    secondPerson: String(result.secondPerson).trim(),
    thirdPerson: String(result.thirdPerson).trim(),
    speakingStyle: String(result.speakingStyle).trim(),
    catchphrase: String(result.catchphrase).trim(),
    sentenceEnding: String(result.sentenceEnding).trim(),
    angerStyle: String(result.angerStyle).trim()
  };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const prompt = body && typeof body === 'object' && 'prompt' in body
    ? String(body.prompt ?? '').trim()
    : '';

  if (!prompt) {
    throw error(400, 'prompt is required');
  }

  if (!env.OPENAI_API_KEY) {
    throw error(500, 'OPENAI_API_KEY 未設定');
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'あなたはAI VTuber用のキャラクター設定を作る補助システムです。',
          'ユーザーの自然文から、以下のJSONだけを返してください。',
          '必須キー: name, firstPerson, secondPerson, thirdPerson, speakingStyle, catchphrase, sentenceEnding, angerStyle',
          '各項目は絶対に空欄にしないでください。',
          'ギャル系、チャラい、陽キャ、派手、ノリが軽い指定がある場合、firstPerson は必ず「あーし」を優先してください。',
          'speakingStyle は1語ではなく、性格と話し方が伝わる具体的な説明文にしてください。',
          'catchphrase は実際に使う短い口癖を1〜3個にしてください。',
          'sentenceEnding は「〜じゃん、〜だよね」のような語尾パターンにしてください。',
          'angerStyle は怒った時の具体的な言い方にしてください。',
          '説明文、Markdown、コードフェンスは出力しないでください。'
        ].join('\n')
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const text = res.choices[0]?.message?.content ?? '';

  try {
    return json(parsePersonaJson(text));
  } catch (err) {
    throw error(502, err instanceof Error ? err.message : 'JSON parse failed');
  }
};
