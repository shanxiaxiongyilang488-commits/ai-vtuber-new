import { json, type RequestHandler } from '@sveltejs/kit';
import OpenAI from 'openai';
import { getProviderKey } from '$lib/server/settings';

type Atmosphere = 'bright' | 'midnight' | 'news';

const TURNS: Record<number, number> = { 3: 8, 5: 14, 10: 24 };

const ATMOSPHERE_DESC: Record<Atmosphere, string> = {
  bright: '明るく元気なポップラジオ番組。テンポよく楽しく話す。笑いや驚きを交える。',
  midnight: '深夜ラジオ。しっとりした雰囲気で、リスナーへ語りかけるように話す。個人的で親密なトーン。',
  news: '情報番組風。わかりやすく丁寧に、リスナーへ情報を伝える。落ち着いてプロフェッショナルに。'
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { theme, duration = 5, atmosphere = 'bright', characters } = await request.json();

    const turns: number = TURNS[duration as number] ?? 14;
    const name1: string = characters?.[0]?.name ?? 'キャラA';
    const name2: string = characters?.[1]?.name ?? 'キャラB';
    const atmosphereDesc: string = ATMOSPHERE_DESC[(atmosphere as Atmosphere)] ?? ATMOSPHERE_DESC.bright;

    const apiKey = await getProviderKey('openai');
    if (!apiKey) {
      return json({ message: 'OpenAI API key is not configured' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });

    const scriptPrompt = `あなたはラジオ台本作家です。以下の条件でラジオ台本を生成してください。

【雰囲気】${atmosphereDesc}
【出演者】${name1}、${name2}
【テーマ】${theme}
【セリフ数】${turns}行（2人が交互に話す）

【出力形式】以下の形式のみ。説明・前置き・タイトルは不要。
${name1}: セリフ内容
${name2}: セリフ内容
...

【ルール】
- 1セリフは1〜2文以内（短くテンポよく）
- 自然なラジオトークを心がける
- 必ず${name1}から始める`;

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: scriptPrompt }],
      temperature: 0.9
    });

    const raw = res.choices[0]?.message?.content ?? '';
    console.log(`[radio] raw response (${raw.split('\n').length} lines):\n${raw.slice(0, 300)}`);

    // Parse "名前: セリフ" lines
    // 全角コロン（：）も ASCII コロン（:）も両対応
    const messages = raw
      .split('\n')
      .map((line) => line.trim().replace('：', ':'))  // 全角→ASCII 正規化
      .filter((line) => line.length > 0 && line.includes(':'))
      .map((line) => {
        const colonIdx = line.indexOf(':');
        const speaker = line.slice(0, colonIdx).trim();
        const text = line.slice(colonIdx + 1).trim();
        return { speaker, text };
      })
      .filter((m) => (m.speaker === name1 || m.speaker === name2) && m.text.length > 0);

    console.log(`[radio] parsed messages=${messages.length}, speakers=[${name1}, ${name2}]`, messages);
    return json({ messages });
  } catch (err) {
    console.error('❌ radio APIエラー:', err);
    return json({ message: 'Internal Error' }, { status: 500 });
  }
};
