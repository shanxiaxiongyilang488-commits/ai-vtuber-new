import { ChatServiceFactory, runOnceText, type Message } from "@aituber-onair/chat";
import type { Character } from "$lib/types/character";

type Engine = "openai" | "gemini" | "claude" | "ollama" | "lmstudio";
type Provider = "openai" | "gemini" | "anthropic";

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

  if (lowerModel.includes("gemini")) {
    return "gemini";
  }

  if (lowerModel.includes("claude")) {
    return "anthropic";
  }

  return "openai";
}

function getApiKey(provider: Provider): string {
  const apiKey =
    provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw `${provider} API key is not configured`;
  }

  return apiKey;
}

function createChat({
  provider,
  apiKey,
  model
}: {
  provider: Provider;
  apiKey: string;
  model: string;
}) {
  const chatProvider = provider === "anthropic" ? "claude" : provider;
  const chatService = ChatServiceFactory.createChatService(chatProvider, {
    apiKey,
    model
  });

  return {
    async generateText({ messages }: { messages: Message[] }): Promise<{ text: string }> {
      return {
        text: await runOnceText(chatService, messages)
      };
    }
  };
}

export async function generateText({ model = "gpt-4o-mini", messages }: GenerateTextParams): Promise<string> {
  try {
    const provider = detectProvider(model);
    const apiKey = getApiKey(provider);

    const chat = createChat({
      provider,
      apiKey,
      model
    });

    const result = await chat.generateText({
      messages
    });

    return result.text;
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
    model: model || character.ollamaModel || "gpt-4o-mini",
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
    model: model || character.ollamaModel || "gemini-2.5-flash",
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
