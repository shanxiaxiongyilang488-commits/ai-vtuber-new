import OpenAI from "openai";
import type { Character } from "$lib/types/character";

type Engine = "openai" | "gemini" | "claude" | "ollama" | "lmstudio";

type HandlerParams = {
  prompt: string;
  character: Character;
};

//
// ==============================
// 🔵 OpenAI
// ==============================
//
async function openaiHandler({ prompt, character }: HandlerParams): Promise<string> {
  console.log("🔥 OpenAI 呼び出し開始");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const systemPrompt = `
一人称は「${character.firstPerson || "私"}」を使う。
二人称は「${character.secondPerson || "あなた"}」を使う。
口調は「${character.catchPhrase || ""}」のように話す。

絶対ルール:
- キャラクターの口調を崩さない
- ミュリィはギャル口調で話す
- シエルは論理的で冷静に話す
- 同じ内容を繰り返さない
- 1発言は2〜3文以内

発言は最大3文まで
- 短くテンポよく返す
直前の相手の発言だけを見て返答する



${character.systemPrompt || ""}

${prompt}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt }
    ],
    temperature: 0.9
  });

  return res.choices[0]?.message?.content ?? "";
}

//
// ==============================
// 🟣 Gemini
// ==============================
//
async function geminiHandler({ prompt }: HandlerParams): Promise<string> {
  console.log("🔥 Gemini 呼び出し開始");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const data = await res.json();

  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "（Gemini応答失敗）";
}

//
// ==============================
// 🟡 Claude
// ==============================
//
async function claudeHandler({ prompt }: HandlerParams): Promise<string> {
  console.log("🔥 Claude 呼び出し開始");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const data = await res.json();

  return data?.content?.[0]?.text ?? "（Claude応答失敗）";
}

//
// ==============================
// 🟢 Local (Ollama)
// ==============================
//
async function ollamaHandler({ prompt, character }: HandlerParams): Promise<string> {
  console.log("🟢 Ollama 呼び出し");

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: character.ollamaModel || "qwen2.5:3b",
      prompt: prompt,
      stream: false
    })
  });

  const text = await res.text();

  try {
    const data = JSON.parse(text);
    return data.response || "(Ollama空応答)";
  } catch (e) {
    console.error("❌ JSON parse失敗:", e);
    return "(Ollamaパース失敗)";
  }
}

//
// ==============================
//  🟡 LMstudio
// ==============================
//

async function lmstudioHandler({ prompt, character }: HandlerParams): Promise<string> {
  console.log("🟡 LM Studio 呼び出し");

  const res = await fetch("http://localhost:1234/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: character.ollamaModel || "local-model",
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await res.json();

  return data.choices?.[0]?.message?.content ?? "LM Studio応答失敗";
}

//
// ==============================
// 🔥 ハンドラー一覧
// ==============================
//
const handlers: Record<Engine, (p: HandlerParams) => Promise<string>> = {
  openai: openaiHandler,
  gemini: geminiHandler,
  claude: claudeHandler,
  ollama: ollamaHandler,
  lmstudio: lmstudioHandler,
};

//
// ==============================
// 🚀 メイン
// ==============================
//
export async function generateReply({
  engine,
  prompt,
  character
}: {
  engine: Engine;
  prompt: string;
  character: Character;
}): Promise<string> {

  console.log("🤖 使用AI:", engine);

  const handler = handlers[engine];

  if (!handler) {
    throw new Error(`未対応エンジン: ${engine}`);
  }

  return await handler({ prompt, character });
}
