import { json } from '@sveltejs/kit';
import OpenAI from 'openai';
import { generateReply } from "$lib/aiRouter";

export async function POST({ request }) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const { message, characters } = await request.json();

    console.log("📡 UIから来たengine:", characters?.[0]?.engine, characters?.[1]?.engine);

    const char1 = characters?.[0];
    const char2 = characters?.[1];

    if (!char1 || !char2) {
      return json({ message: "Character missing" }, { status: 400 });
    }

    // 🔥 安全にプロンプト取得（ここが今回の核心）
    const char1Prompt = char1.systemPrompt || char1.prompt || "普通に会話してください";
    const char2Prompt = char2.systemPrompt || char2.prompt || "普通に会話してください";

    // =========================
    // 🧠 1人目プロンプト
    // =========================
    const prompt1 = `
【キャラクター設定】
${char1Prompt}

【ルール】
・自分のキャラを絶対に崩さない
・話題よりキャラを優先する
・口調や感情を必ず出す
・2〜3文で簡潔に話す

テーマ：
${message}

このテーマについてあなたのキャラで話してください。
`;

    console.log("🧠 char1 最終プロンプト ↓↓↓");
    console.log(prompt1);

    // 🧠 1人目
const text1 = await generateReply({
  engine: char1.engine ?? "openai",
  prompt: prompt1
});

// 🧠 2人目（←ここが重要）
const prompt2 = `
[キャラクター設定]
${char2Prompt}

[ルール]
・自分のキャラを絶対に崩さない
・話題よりキャラを優先する
・口調や感情を必ず出す
・2〜3文で簡潔に話す

相手の発言:
${text1}

これに対してあなたのキャラで返答してください。
`;

const text2 = await generateReply({
  engine: char2.engine ?? "openai",
  prompt: prompt2
});

    return json({
      messages: [
        { speaker: char1.name, text: text1 },
        { speaker: char2.name, text: text2 }
      ]
    });

  } catch (err) {
    console.error("❌ APIエラー:", err);
    return json({ message: "Internal Error" }, { status: 500 });
  }
}