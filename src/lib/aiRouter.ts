import type { Character } from "$lib/types/character";
import { getProviderKey, readSettings } from "$lib/server/settings";
import { buildCharacterTimeTonePrompt, buildEnergyPrompt, buildTimeCorePrompt, getTimeCore } from "../core/timeCore";

type Engine = "openai" | "grok" | "gemini" | "claude" | "ollama" | "lmstudio" | "colab-ollama";
type Provider = "openai" | "grok" | "gemini" | "anthropic";
type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type HandlerParams = {
  prompt: string;
  character: Character;
  model?: string;
};

type GenerateTextParams = {
  model?: string;
  messages: Message[];
};

function detectProvider(model: string): Provider {
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes("gpt") || lowerModel.includes("o4")) {
    return "openai";
  }

  if (lowerModel.includes("grok")) {
    return "grok";
  }

  if (lowerModel.includes("gemini")) {
    return "gemini";
  }

  if (lowerModel.includes("claude")) {
    return "anthropic";
  }

  return "openai";
}

async function getApiKey(provider: Provider): Promise<string> {
  const apiKey = await getProviderKey(provider);

  if (!apiKey) {
    throw `${provider} API key is not configured`;
  }

  return apiKey;
}

async function parseJsonResponse(res: Response, provider: Provider): Promise<any> {
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`${provider} API error: ${msg}`);
  }

  return await res.json();
}

async function callOpenAI(apiKey: string, model: string, messages: Message[]): Promise<string> {
  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? "";
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      ...(systemPrompt ? { instructions: systemPrompt } : {}),
      input,
      store: false
    })
  });

  if (!res.ok) {
    const message = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`provider=openai model=${model} message=${message}`);
  }

  const data = await res.json() as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  };
  if (typeof data.output_text === "string") return data.output_text;
  return data.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("") ?? "";
}

async function callGemini(apiKey: string, model: string, messages: Message[]): Promise<string> {
  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? "";
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents
    })
  });

  const data = await parseJsonResponse(res, "gemini");
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGrok(apiKey: string, model: string, messages: Message[]): Promise<string> {
  const settings = await readSettings();
  const baseUrl = (settings.grok.baseUrl || "https://api.x.ai/v1").replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  });

  const data = await parseJsonResponse(res, "grok");
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(apiKey: string, model: string, messages: Message[]): Promise<string> {
  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? "";
  const claudeMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: claudeMessages
    })
  });

  const data = await parseJsonResponse(res, "anthropic");
  return data?.content?.[0]?.text ?? "";
}

export async function generateText({ model = "gpt-5.4-mini", messages }: GenerateTextParams): Promise<string> {
  try {
    const provider = detectProvider(model);
    const apiKey = await getApiKey(provider);

    if (provider === "gemini") {
      return await callGemini(apiKey, model, messages);
    }

    if (provider === "grok") {
      return await callGrok(apiKey, model, messages);
    }

    if (provider === "anthropic") {
      return await callAnthropic(apiKey, model, messages);
    }

    return await callOpenAI(apiKey, model, messages);
  } catch (error) {
    throw error instanceof Error ? error.message : String(error);
  }
}

function buildCharacterSystemPrompt(character: Character): string {
  return `
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

${buildTimeCorePrompt(getTimeCore())}
${buildEnergyPrompt(getTimeCore(), `${character.name}\n${character.systemPrompt || ''}`)}
${buildCharacterTimeTonePrompt(getTimeCore(), `${character.name}\n${character.systemPrompt || ''}`)}
`;
}

//
// ==============================
// 🔵 OpenAI
// ==============================
//
async function openaiHandler({ prompt, character, model }: HandlerParams): Promise<string> {
  console.log("🔥 OpenAI 呼び出し開始");

  return await generateText({
    model: model || character.ollamaModel || "gpt-5.4-mini",
    messages: [
      { role: "system", content: buildCharacterSystemPrompt(character) },
      { role: "user", content: prompt }
    ]
  });
}

//
// ==============================
// 🟣 Gemini
// ==============================
//
async function geminiHandler({ prompt, character, model }: HandlerParams): Promise<string> {
  console.log("🔥 Gemini 呼び出し開始");

  return await generateText({
    model: model || character.ollamaModel || "gemini-3.5-flash",
    messages: [
      { role: "system", content: buildCharacterSystemPrompt(character) },
      { role: "user", content: prompt }
    ]
  });
}

//
// ==============================
// Grok
// ==============================
//
async function grokHandler({ prompt, character, model }: HandlerParams): Promise<string> {
  console.log("Grok 呼び出し開始");

  return await generateText({
    model: model || character.ollamaModel || "grok-4.5",
    messages: [
      { role: "system", content: buildCharacterSystemPrompt(character) },
      { role: "user", content: prompt }
    ]
  });
}

//
// ==============================
// 🟡 Claude
// ==============================
//
async function claudeHandler({ prompt, character, model }: HandlerParams): Promise<string> {
  console.log("🔥 Claude 呼び出し開始");

  return await generateText({
    model: model || character.ollamaModel || "claude-haiku-4-5-20251001",
    messages: [
      { role: "system", content: buildCharacterSystemPrompt(character) },
      { role: "user", content: prompt }
    ]
  });
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
      model: character.ollamaModel || "qwen/qwen3-4b",
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
// 🟢 Colab Ollama (OpenAI compatible)
// ==============================
//
async function colabOllamaHandler({ prompt, character, model }: HandlerParams): Promise<string> {
  console.log("🟢 Colab Ollama 呼び出し");

  const baseUrl = process.env.COLAB_OLLAMA_URL?.replace(/\/+$/, "");
  const actualModel = model || process.env.COLAB_OLLAMA_MODEL || character.ollamaModel;

  if (!baseUrl) {
    throw new Error("COLAB_OLLAMA_URL が未設定");
  }

  if (!actualModel) {
    throw new Error("COLAB_OLLAMA_MODEL が未設定");
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: actualModel,
      messages: [
        { role: "system", content: buildCharacterSystemPrompt(character) },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Colab Ollama API error: ${msg}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

//
// ==============================
// 🔥 ハンドラー一覧
// ==============================
//
const handlers: Record<Engine, (p: HandlerParams) => Promise<string>> = {
  openai: openaiHandler,
  grok: grokHandler,
  gemini: geminiHandler,
  claude: claudeHandler,
  ollama: ollamaHandler,
  lmstudio: lmstudioHandler,
  "colab-ollama": colabOllamaHandler,
};

//
// ==============================
// 🚀 メイン
// ==============================
//
export async function generateReply({
  engine,
  prompt,
  character,
  model
}: {
  engine: Engine;
  prompt: string;
  character: Character;
  model?: string;
}): Promise<string> {

  console.log("🤖 使用AI:", engine);

  const handler = handlers[engine];

  if (!handler) {
    throw new Error(`未対応エンジン: ${engine}`);
  }

  return await handler({ prompt, character, model });
}
