import { json } from '@sveltejs/kit';
import { generateReply } from '$lib/aiRouter';

export async function POST({ request }) {
  try {
    const { message, characters, turns = 6 } = await request.json();

    // 🔥 キャラ定義
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

    console.log("CHAR1:", char1.engine);
    console.log("CHAR2:", char2.engine);

    let history = "";
    let messages: { speaker: string; text: string }[] = [];

    for (let i = 0; i < turns; i++) {

      const isChar1 = i % 2 === 0;
      const current = isChar1 ? char1 : char2;

      // 🔥 プロンプト構築（安全版）
      const basePrompt = `
${current.systemPrompt || ""}

【会話ルール】
・1回の発言は2文まで
・1つの主張だけ話す
・説明しすぎない
・前の発言にリアクションしてから話す
・同じことを繰り返さない
・キャラの口調を最優先する

【スタイル】
・論文調は禁止
・自然な会話をする
・軽くてもいいので人間っぽく話す

【テーマ】
${message}
`;

      const prompt = history
        ? `${basePrompt}

【直前の会話】
${history}

これに対して返答してください。`
        : basePrompt;

      console.log("🧠 使用AI:", current.aiEngine);

      const text = await generateReply({
      engine: current.aiEngine,
      prompt,
      character: current
    });

      // 🔥 履歴更新（テンプレ安全版）
      history += "\n" + current.name + ": " + text;

      // 🔥 UI用
      messages = [
        ...messages,
        {
          speaker: current.name,
          text: text
        }
      ];
    }

    return json({ messages });

  } catch (err) {
    console.error("❌ APIエラー:", err);
    return json({ message: "Internal Error" }, { status: 500 });
  }
}