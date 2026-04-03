import { json } from '@sveltejs/kit';
import OpenAI from 'openai';

export async function POST({ request }) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const { message, characters } = await request.json();

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

    const res1 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.3,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: prompt1
        }
      ]
    });

    const text1 = res1.choices[0].message.content ?? "";

    console.log("🗣 char1 出力:", text1);

    // =========================
    // 🧠 2人目プロンプト
    // =========================
    const prompt2 = `
【キャラクター設定】
${char2Prompt}

【ルール】
・自分のキャラを絶対に崩さない
・話題よりキャラを優先する
・口調や感情を必ず出す
・2〜3文で簡潔に話す

相手の発言：
${text1}

これに対してあなたのキャラで返答してください。
`;

    console.log("🧠 char2 最終プロンプト ↓↓↓");
    console.log(prompt2);

    const res2 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.3,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: prompt2
        }
      ]
    });

    const text2 = res2.choices[0].message.content ?? "";

    console.log("🗣 char2 出力:", text2);

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