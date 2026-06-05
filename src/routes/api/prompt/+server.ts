import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { getProviderKey } from '$lib/server/settings';

export const POST: RequestHandler = async ({ request }) => {
  const { basePrompt, refDescription, locale = 'ja' } = await request.json();

  const apiKey = await getProviderKey('openai');
  if (!apiKey) {
    throw error(500, 'OpenAI API key 未設定');
  }

  const openai = new OpenAI({
    apiKey
  });

  const systemPrompt = `
あなたは画像生成用プロンプトを整える専門AIです。

必須条件:
- locale は必ず ${locale === 'ja' ? 'ja' : 'ja'} として扱う
- 出力は日本語のみ
- 入力された基本プロンプトとキャラクター説明を統合する
- キャラクターの同一性、顔、髪型、衣装を維持する
- キャラクターを再デザインしない
- 画面内にメタデータ、UIキャプション、注釈、説明ラベルを描く場合は日本語のみ
- Point、Error、Concern、Scene、Prompt、Panel、Caption、Metadata などの英語UIラベルを出力しない
- 英語フォールバックを使わない

最終プロンプト本文だけを返してください。
`;

  const userPrompt = `
キャラクター説明:
${refDescription}

基本プロンプト:
${basePrompt}

日本語固定の安定した画像生成プロンプトを生成してください。
`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const finalPrompt = res.choices[0]?.message?.content;

  if (!finalPrompt) {
    throw error(500, 'プロンプト生成失敗');
  }

  return json({ prompt: finalPrompt });
};
