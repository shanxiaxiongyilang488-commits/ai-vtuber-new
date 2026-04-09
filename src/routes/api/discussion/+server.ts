import { json } from '@sveltejs/kit';
import { generateReply } from '$lib/aiRouter';

export async function POST({ request }) {
  try {
    const { message, characters, turns = 6 } = await request.json();

    const char1 = {
      ...characters[0],
      engine: characters[0]?.engine ?? "openai"
    };

    const char2 = {
      ...characters[1],
      engine: characters[1]?.engine ?? "openai"
    };

    if (!char1 || !char2) {
      return json({ message: "Character missing" }, { status: 400 });
    }

    let history = "";
    let messages: { speaker: string; text: string }[] = [];

    // ===============================
    // 🔥 品質制御関数群（全部入り）
    // ===============================

    function sanitizeMessage(text: string): string {
      return text
        // 名前付き発言削除（ミュリィ：など）
        .replace(/^[^\n：:]{1,10}[:：]\s*/u, '')

        // 呼びかけ削除（シエルさん、）
        .replace(/^[^\s、]{1,10}さん、/, '')

        // 呼びかけ削除（名前だけ）
        .replace(/^[^\s、]{1,10}、/, '')

        // 英語コロン対策
        .replace(/^[^\n:]{1,10}:\s*/, '')

        .trim();
    }

    function limitLength(text: string): string {
      const sentences = text.split(/[。！？!?]/);

      const trimmed = sentences.slice(0, 2);

      const shortened = trimmed.map(s => s.slice(0, 40));

      return shortened.join('。').trim() + '。';
    }

    function removeRepetition(text: string): string {
      const lines = text.split('。');
      const unique: string[] = [];

      for (const line of lines) {
        if (!unique.includes(line.trim()) && line.trim() !== "") {
          unique.push(line.trim());
        }
      }

      return unique.join('。') + '。';
    }

    function cleanup(text: string): string {
      return text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function refine(text: string): string {
      return cleanup(
        removeRepetition(
          limitLength(
            sanitizeMessage(text)
          )
        )
      );
    }

    // ===============================
    // 🔥 会話ループ
    // ===============================

    for (let i = 0; i < turns; i++) {
      const isChar1 = i % 2 === 0;
      const current = isChar1 ? char1 : char2;

      const basePrompt = `
${current.systemPrompt || ""}

【会話ルール】
・必ず最初に相手の発言へのリアクションを一言入れる（例：「それはわかるけど」「いや、それ違うでしょ」など）
・1回の発言は最大2文まで
・1文は短く（20〜40文字）
・1つの主張だけ話す
・説明しすぎない（解説は禁止）
・同じことを繰り返さない
・キャラの口調を最優先
・自分の名前を名乗らない
・相手の名前は必要な時だけ使う

【スタイル】
・論文調は禁止
・軽くテンポよく話す
・自然な会話をする

【テーマ】
${message}
`;

      const prompt = history
        ? `${basePrompt}

【直前の会話】
${history}

自然に続けてください。`
        : basePrompt;

      const rawText = await generateReply({
        engine: current.engine,
        prompt,
        character: current
      });

      // 🔥 完全整形
      const finalText = refine(rawText);

      // 🔥 履歴
      history += "\n" + current.name + ": " + finalText;

      // 🔥 UI出力
      messages = [
        ...messages,
        {
          speaker: current.name,
          text: finalText
        }
      ];
    }

    return json({ messages });

  } catch (err) {
    console.error("❌ APIエラー:", err);
    return json({ message: "Internal Error" }, { status: 500 });
  }
}