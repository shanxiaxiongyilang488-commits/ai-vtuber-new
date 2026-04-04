import OpenAI from "openai";

type Engine = "openai" | "gemini" | "claude" | "local";

type Params = {
  prompt: string;
};

// ==============================
// 🔵 OpenAI
// ==============================
async function openaiHandler({ prompt }: Params) {
  console.log("🔥 OpenAI 呼び出し開始");
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: prompt }],
    temperature: 0.9
  });

  const text = res.choices[0]?.message?.content ?? "";

  console.log("✅ OpenAI 出力:", text);

  return text;
}

// ==============================
// 🟣 Gemini
// ==============================
async function geminiHandler({ prompt }: Params) {
  console.log("🔥 Gemini 呼び出し開始");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const data = await res.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  console.log("✅ Gemini 出力:", text);

  return text;
}

// ==============================
// 🟡 Claude
// ==============================
async function claudeHandler({ prompt }: Params) {
  console.log("🔥 Claude 呼び出し開始");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.CLAUDE_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
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

  const text = data?.content?.[0]?.text ?? "";

  console.log("✅ Claude 出力:", text);

  return text;
}


async function localHandler({ prompt }: Params) {
  console.log("🔥 Local AI 呼び出し");

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "qwen2.5:0.5b",
      prompt,
      stream: false
    })
  });

  const data = await res.json();

  return data.response ?? "";
}

// ==============================
// 🧠 ルーター
// ==============================
const handlers = {
  openai: openaiHandler,
  gemini: geminiHandler,
  claude: claudeHandler,
  local: localHandler
};

// ==============================
// 🚀 メイン関数
// ==============================
export async function generateReply({
  engine,
  prompt
}: {
  engine: Engine;
  prompt: string;
}) {
  console.log("=================================");
  console.log("🧠 generateReply 開始");
  console.log("👉 engine:", engine);
  console.log("👉 prompt:", prompt);
  console.log("🧠 使用AI:", engine);
  
  const handler = handlers[engine];

  if (!handler) {
    throw new Error(`❌ 未対応エンジン: ${engine}`);
  }

  const result = await handler({ prompt });

  console.log("🎯 最終出力:", result);
  console.log("=================================");

  return result;
}