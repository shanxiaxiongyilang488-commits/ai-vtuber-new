import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { buildMemoryContext, recordMemoryCoreTurn, type BuiltMemoryPrompt, type MemoryCoreRequest } from '$lib/ai/memory-core/memoryCore';
import { chatClaude, CLAUDE_DEFAULT_MODEL } from '$lib/providers/claude';
import { chatColabOllama } from '$lib/providers/colab';
import { chatGemini, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { chatLMStudio, LM_STUDIO_DEFAULT_MODEL as PROVIDER_LM_STUDIO_DEFAULT_MODEL } from '$lib/providers/lmstudio';
import { chatOllama, OLLAMA_DEFAULT_MODEL } from '$lib/providers/ollama';
import { chatOpenAI, OPENAI_DEFAULT_MODEL } from '$lib/providers/openai';
import { extractReplyText, logEmptyReply } from '$lib/providers/types';
import { getProviderKey, readSettings } from '$lib/server/settings';

type Provider = 'openai' | 'gemini' | 'claude' | 'ollama' | 'lmstudio' | 'colab-ollama';
const LM_STUDIO_BASE_URL = 'http://127.0.0.1:1234/v1';
const LM_STUDIO_API_KEY = 'lm-studio';
const LM_STUDIO_DEFAULT_MODEL = 'qwen/qwen3-4b';
const OLLAMA_TIMEOUT_MS = 120000;

interface LabChatRequest {
  provider?: Provider;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  systemPrompt: string;
  userMessage: string;
  memory?: MemoryCoreRequest;
  images?: string[];
}

// base64 data URL: "data:<mime>;base64,<data>"
interface ImageInput {
  dataUrl: string;
  name?: string;
}

async function imageSourceToDataUrl(imageUrl: string, sourceLabel: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;
  if (!/^https?:\/\//.test(imageUrl)) throw new Error(`Unsupported image source: ${sourceLabel}`);

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Image fetch failed (${sourceLabel}): HTTP ${res.status}`);

  const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ================================================================
// Request parsing — FormData (sendMessage) or JSON (other callers)
// ================================================================
async function parseRequest(request: Request): Promise<{ body: LabChatRequest; images: ImageInput[]; enableMemoryByDefault: boolean }> {
  const ct = request.headers.get('content-type') ?? '';

  if (ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    const providerValue = fd.get('provider');
    const body: LabChatRequest = {
      provider:     typeof providerValue === 'string' && providerValue ? providerValue as Provider : undefined,
      model:        (fd.get('model') as string | null) ?? undefined,
      temperature:  Number(fd.get('temperature') ?? 0.7),
      max_tokens:   Number(fd.get('max_tokens') ?? 2048),
      systemPrompt: (fd.get('systemPrompt') as string) ?? '',
      userMessage:  (fd.get('userMessage') as string) ?? '',
    };
    const images: ImageInput[] = [];
    for (let i = 0; fd.has(`image_${i}`); i++) {
      const file = fd.get(`image_${i}`) as File;
      const buf  = await file.arrayBuffer();
      const b64  = Buffer.from(buf).toString('base64');
      const mime = file.type || 'image/jpeg';
      console.log(`[lab-chat] parse image[${i}]: name=${file.name} type=${file.type || '(none)'} size=${buf.byteLength}B b64len=${b64.length} mime_used=${mime}`);
      if (!b64) { console.warn(`[lab-chat] image[${i}] skipped — empty base64`); continue; }
      images.push({ dataUrl: `data:${mime};base64,${b64}`, name: file.name });
    }
    const imageUrlEntries = Array.from(fd.entries())
      .filter(([key]) => /^image_url_\d+$/.test(key))
      .sort(([a], [b]) => Number(a.slice('image_url_'.length)) - Number(b.slice('image_url_'.length)));
    for (const [key, value] of imageUrlEntries) {
      const imageUrl = typeof value === 'string' ? value.trim() : '';
      if (!imageUrl) continue;
      const dataUrl = await imageSourceToDataUrl(imageUrl, key);
      console.log(`[lab-chat] parse form ${key}: sourceLen=${imageUrl.length} dataUrlLen=${dataUrl.length}`);
      images.push({ dataUrl, name: key });
    }
    // Bug 4 fix: note_i をユーザーメッセージへ付加
    const notes: string[] = [];
    for (let i = 0; fd.has(`note_${i}`); i++) {
      const note = fd.get(`note_${i}`) as string | null;
      if (note?.trim()) notes.push(`[画像${i + 1}: ${note.trim()}]`);
    }
    if (notes.length > 0) {
      body.userMessage = `${body.userMessage}\n${notes.join(' ')}`;
    }
    return { body, images, enableMemoryByDefault: true };
  }

  const body = await request.json() as LabChatRequest;
  const imageUrls = Array.isArray(body.images) ? body.images.filter((img): img is string => typeof img === 'string' && img.trim().length > 0) : [];
  const images: ImageInput[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i].trim();
    const dataUrl = await imageSourceToDataUrl(imageUrl, `json_image_${i}`);
    console.log(`[lab-chat] parse json image[${i}]: sourceLen=${imageUrl.length} dataUrlLen=${dataUrl.length}`);
    images.push({ dataUrl, name: `json_image_${i}` });
  }

  return { body, images, enableMemoryByDefault: images.length > 0 };
}

// ================================================================
// OpenAI — Vision content builder
// ================================================================
function openAIUserContent(userMessage: string, images: ImageInput[]) {
  if (images.length === 0) return userMessage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = images.map(img => ({
    type:      'image_url',
    image_url: { url: img.dataUrl, detail: 'high' },
  }));
  parts.push({ type: 'text', text: userMessage });
  return parts;
}

async function callOpenAI(
  systemPrompt: string,
  userMessage:  string,
  model?:       string,
  images:       ImageInput[] = [],
): Promise<string> {
  const apiKey = await getProviderKey('openai');
  if (!apiKey) throw new Error('OpenAI API key が未設定');
  const actualModel = model || 'gpt-4o-mini';
  console.log('[OPENAI KEY PREFIX]', apiKey?.slice(0,12));
  console.log('[OPENAI MODEL]', actualModel);
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: actualModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: openAIUserContent(userMessage, images) as any },
    ],
    ...(images.length > 0 ? { max_tokens: 2400 } : {}),
  });
  return completion.choices[0].message.content ?? '';
}

function logVisionText(provider: string, images: ImageInput[], text: string): void {
  if (images.length === 0) return;
  const preview = text.replace(/\s+/g, ' ').slice(0, 200);
  images.forEach((img, i) => {
    console.log(`[vision] ${img.name ?? `image_${i}`} analysis length=${text.length}`);
    console.log(`[vision] preview=${preview}`);
  });
  console.log(`[lab-chat] ${provider} vision ok (${text.length} chars) preview=${preview}`);
}

function localMessages(systemPrompt: string, userMessage: string) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

function isOllamaTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = err.cause as { code?: unknown; name?: unknown } | undefined;
  return (
    err.name === 'TimeoutError' ||
    cause?.name === 'HeadersTimeoutError' ||
    cause?.code === 'UND_ERR_HEADERS_TIMEOUT'
  );
}

async function callOllama(systemPrompt: string, userMessage: string, model?: string): Promise<string> {
  const actualModel = model || 'qwen2.5:3b';
  console.log('[OLLAMA REQUEST START]');

  try {
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      body:    JSON.stringify({ model: actualModel, messages: localMessages(systemPrompt, userMessage), stream: false }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Ollama API error: ${msg}`);
    }
    const data = await res.json();
    console.log('[OLLAMA RESPONSE OK]');
    const replyText = extractReplyText(data);
    if (!replyText.trim()) logEmptyReply('OLLAMA_LEGACY', data);
    return replyText;
  } catch (err) {
    if (isOllamaTimeout(err)) {
      console.log('[OLLAMA TIMEOUT]');
      return '生成中...';
    }

    throw err;
  }
}

async function callLMStudio(
  systemPrompt: string,
  userMessage: string,
  model?: string,
  temperature = 0.7,
  maxTokens = 2048,
): Promise<string> {
  const actualModel = model || LM_STUDIO_DEFAULT_MODEL;
  const res = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LM_STUDIO_API_KEY}`,
    },
    body: JSON.stringify({
      model: actualModel,
      messages: localMessages(systemPrompt, userMessage),
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`LM Studio API error: ${msg}`);
  }

  const data = await res.json();
  const replyText = extractReplyText(data);
  if (!replyText.trim()) logEmptyReply('LM_STUDIO_LEGACY', data);
  return replyText;
}

async function callColabOllama(systemPrompt: string, userMessage: string, model?: string): Promise<string> {
  const baseUrl = env.COLAB_OLLAMA_URL?.replace(/\/+$/, '');
  const actualModel = model || env.COLAB_OLLAMA_MODEL;

  if (!baseUrl) throw new Error('COLAB_OLLAMA_URL が未設定');
  if (!actualModel) throw new Error('COLAB_OLLAMA_MODEL が未設定');

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: actualModel,
      messages: localMessages(systemPrompt, userMessage),
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Colab Ollama API error: ${msg}`);
  }
  const data = await res.json();
  const replyText = extractReplyText(data);
  if (!replyText.trim()) logEmptyReply('COLAB_OLLAMA_LEGACY', data);
  return replyText;
}

// ================================================================
// Gemini — Vision parts builder
// ================================================================
function geminiUserParts(userMessage: string, images: ImageInput[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = images.map((img, i) => {
    // indexOf で最初のカンマ位置を取得 — split(',')[1] はカンマ複数時に切り捨てる恐れがある
    const commaIdx = img.dataUrl.indexOf(',');
    const header   = commaIdx >= 0 ? img.dataUrl.slice(0, commaIdx) : '';
    const data     = commaIdx >= 0 ? img.dataUrl.slice(commaIdx + 1) : '';
    const mimeType = header.match(/^data:(.*?);/)?.[1] ?? 'image/jpeg';

    console.log(`[lab-chat][gemini] image[${i}] mimeType=${mimeType} dataLen=${data.length} valid=${data.length > 100 && mimeType.startsWith('image/')}`);
    if (!data || data.length < 10) {
      console.error(`[lab-chat][gemini] image[${i}] INVALID — empty or too-short base64 (len=${data.length})`);
    }

    return { inlineData: { mimeType, data } };
  });
  parts.push({ text: userMessage });
  console.log(`[lab-chat][gemini] parts built: ${images.length} image(s) + 1 text = ${parts.length} total`);
  return parts;
}

// ================================================================
// Claude — Vision content builder
// ================================================================
function claudeUserContent(userMessage: string, images: ImageInput[]) {
  if (images.length === 0) return userMessage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = images.map(img => ({
    type:   'image',
    source: {
      type:       'base64',
      media_type: img.dataUrl.match(/^data:(.*?);/)?.[1] ?? 'image/jpeg',
      data:       img.dataUrl.split(',')[1] ?? '',
    },
  }));
  parts.push({ type: 'text', text: userMessage });
  return parts;
}

// ================================================================
// Main handler
// ================================================================
export const POST: RequestHandler = async ({ request }) => {
  console.log('[LAB CHAT ENTRY]');

  let parsed: { body: LabChatRequest; images: ImageInput[]; enableMemoryByDefault: boolean };
  try {
    parsed = await parseRequest(request);
  } catch {
    throw error(400, 'Invalid request');
  }

  const { body, images, enableMemoryByDefault } = parsed;
  const settings = await readSettings();
  const provider = body.provider ?? settings.chatConfig.provider;
  const { model, systemPrompt, userMessage } = body;
  const openaiApiKey = settings.openai.key;
  const geminiApiKey = settings.gemini.key;
  const anthropicApiKey = settings.anthropic.key;
  const temperature = Number.isFinite(body.temperature) ? body.temperature : 0.7;
  const maxTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : 2048;
  const memory = body.memory ?? { enabled: enableMemoryByDefault };
  const memoryContext = buildMemoryContext({
    baseSystemPrompt: systemPrompt,
    userInput: userMessage,
    memory,
  });
  const effectiveSystemPrompt = memory.enabled ? memoryContext.systemPrompt : systemPrompt;
  const memoryDebug: BuiltMemoryPrompt['debug'] | undefined = memory.enabled ? memoryContext.debug : undefined;
  const withMemory = async (response: Record<string, unknown>, text: string) => {
    if (memory.enabled) {
      await recordMemoryCoreTurn({
        characterId: memory.characterId,
        userInput: userMessage,
        assistantReply: text,
        longTermMemories: memory.longTermMemories,
        sharedMemories: memory.sharedMemories,
        characterMemories: memory.characterMemories,
      });
    }

    return memoryDebug ? { ...response, memory: memoryDebug } : response;
  };

  console.log('[CHAT_PROVIDER]', provider);
  console.log('[CHAT_MODEL]', model || (provider === settings.chatConfig.provider ? settings.chatConfig.model : '(default)'));
  console.log('[PROVIDER]', provider);
  console.log('[FINAL MODEL]', model || '(default)');
  console.log(`[lab-chat] provider=${provider} model=${model || '(default)'} images=${images.length}`);

  // ================================================================
  // OpenAI
  // ================================================================
  if (provider === 'openai') {
    if (!openaiApiKey) throw error(500, 'OpenAI API key が未設定');
    const actualModel = model || (provider === settings.chatConfig.provider ? settings.chatConfig.model : settings.openai.model) || OPENAI_DEFAULT_MODEL;
    const apiKey = openaiApiKey;
    console.log('[OPENAI KEY SOURCE]', 'settings.json');
    console.log('[OPENAI KEY PREFIX]', apiKey?.slice(0,12));
    console.log('[OPENAI MODEL]', actualModel);
    const text = await chatOpenAI({
      apiKey,
      systemPrompt: effectiveSystemPrompt,
      userMessage,
      model: actualModel,
      images,
    });
    console.log(`[lab-chat] openai ok (${text.length} chars)`);
    logVisionText('openai', images, text);
    return json(await withMemory({ text, provider: 'openai', actualModel }, text));
  }

  // ================================================================
  // Ollama / LM Studio
  // ================================================================
  if (provider === 'ollama' || provider === 'lmstudio') {
    if (images.length > 0) {
      console.warn(`[lab-chat] ${provider} selected with ${images.length} image(s); local text endpoint will ignore images`);
    }
    try {
      const actualModel = model || (provider === settings.chatConfig.provider ? settings.chatConfig.model : '') || (provider === 'ollama' ? OLLAMA_DEFAULT_MODEL : settings.local.model || PROVIDER_LM_STUDIO_DEFAULT_MODEL);
      const text = provider === 'ollama'
        ? await chatOllama({ systemPrompt: effectiveSystemPrompt, userMessage, model: actualModel })
        : await chatLMStudio({ systemPrompt: effectiveSystemPrompt, userMessage, model: actualModel, temperature, maxTokens });
      const replyText = typeof text === 'string' ? text : String(text ?? '');
      console.log(`[lab-chat] ${provider} ok (${replyText.length} chars)`);
      return json(await withMemory({ text: replyText, replyText, provider, actualModel }, replyText));
    } catch (e) {
      console.error(`[lab-chat] ${provider} error:`, e);
      throw error(503, provider === 'lmstudio'
        ? 'LM Studio Offline'
        : 'Ollama への接続に失敗しました。ローカルサーバーを確認してください。');
    }
  }

  // ================================================================
  // Colab Ollama (OpenAI互換)
  // ================================================================
  if (provider === 'colab-ollama') {
    if (images.length > 0) {
      console.warn(`[lab-chat] ${provider} selected with ${images.length} image(s); OpenAI-compatible Colab endpoint will ignore images`);
    }
    try {
      const actualModel = model || env.COLAB_OLLAMA_MODEL;
      const text = await chatColabOllama({
        baseUrl: env.COLAB_OLLAMA_URL,
        systemPrompt: effectiveSystemPrompt,
        userMessage,
        model: actualModel,
      });
      const replyText = typeof text === 'string' ? text : String(text ?? '');
      console.log(`[lab-chat] ${provider} ok (${replyText.length} chars)`);
      return json(await withMemory({ text: replyText, replyText, provider, actualModel }, replyText));
    } catch (e) {
      console.error(`[lab-chat] ${provider} error:`, e);
      throw error(503, 'Colab Ollama への接続に失敗しました。COLAB_OLLAMA_URL / COLAB_OLLAMA_MODEL と Colab 側の公開URLを確認してください。');
    }
  }

  // ================================================================
  // Gemini（失敗時は OpenAI へフェイルオーバー）
  // ================================================================
  if (provider === 'gemini') {
    let geminiFailReason: string | null = null;

    if (geminiApiKey) {
      console.log('[GEMINI KEY SOURCE]', 'settings.json');
      try {
        const geminiModel = model || (provider === settings.chatConfig.provider ? settings.chatConfig.model : settings.gemini.model) || GEMINI_DEFAULT_MODEL;
        const text = await chatGemini({
          apiKey: geminiApiKey,
          systemPrompt: effectiveSystemPrompt,
          userMessage,
          model: geminiModel,
          images,
        });
        console.log(`[lab-chat] gemini ok (${text.length} chars)`);
        logVisionText('gemini', images, text);
        return json(await withMemory({ text, provider: 'gemini', actualModel: geminiModel }, text));

        const legacyGeminiModel = model || (provider === settings.chatConfig.provider ? settings.chatConfig.model : settings.gemini.model) || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${legacyGeminiModel}:generateContent?key=${geminiApiKey}`;

        const userParts = geminiUserParts(userMessage, images);
        // ペイロード構造を base64 本体を除いてログ（スパム防止）
        console.log('[lab-chat][gemini] request_summary:', JSON.stringify({
          model:           legacyGeminiModel,
          systemPromptLen: effectiveSystemPrompt.length,
          partsCount:      userParts.length,
          imageParts:      userParts
            .filter((p: any) => p.inlineData)
            .map((p: any) => ({ mimeType: p.inlineData.mimeType, dataLen: p.inlineData.data.length })),
          textPart:        (userParts.find((p: any) => p.text) as any)?.text?.slice(0, 80),
        }));

        const res = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: effectiveSystemPrompt }] },
            contents: [{ role: 'user', parts: userParts }],
            generationConfig: images.length > 0 ? { maxOutputTokens: 2400 } : undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) {
            console.log(`[lab-chat] gemini ok (${text.length} chars)`);
            logVisionText('gemini', images, text);
            return json(await withMemory({ text, provider: 'gemini', actualModel: legacyGeminiModel }, text));
          }
          // 空応答の場合は candidates の状態もログ
          console.warn('[lab-chat][gemini] empty text — candidates:', JSON.stringify(data?.candidates?.map((c: any) => ({
            finishReason: c.finishReason,
            safetyRatings: c.safetyRatings,
          }))));
          geminiFailReason = 'empty response';
        } else {
          const errBody = await res.text().catch(() => '');
          console.error(`[lab-chat][gemini] HTTP ${res.status}: ${errBody.slice(0, 300)}`);
          geminiFailReason = `HTTP ${res.status}`;
        }
      } catch (e) {
        geminiFailReason = String(e);
      }
    } else {
      geminiFailReason = 'no API key';
    }

    console.warn(`[lab-chat] gemini failed (${geminiFailReason}) — trying OpenAI fallback`);

    try {
      const fallbackModel = settings.openai.model || OPENAI_DEFAULT_MODEL;
      const apiKey = openaiApiKey;
      if (!apiKey) throw error(500, 'OpenAI API key が未設定');
      console.log('[OPENAI KEY SOURCE]', 'settings.json');
      console.log('[OPENAI KEY PREFIX]', apiKey?.slice(0,12));
      console.log('[OPENAI MODEL]', fallbackModel);
      const text = await chatOpenAI({
        apiKey,
        systemPrompt: effectiveSystemPrompt,
        userMessage,
        model: fallbackModel,
        images,
      });
      console.log(`[lab-chat] openai fallback ok (${text.length} chars)`);
      logVisionText('openai fallback', images, text);
      return json(await withMemory({ text, failover: true, provider: 'openai', actualModel: fallbackModel }, text));
    } catch (fallbackErr) {
      console.error('[lab-chat] openai fallback also failed:', fallbackErr);
      throw error(503, `Gemini と OpenAI の両方が失敗しました。時間をおいて再試行してください。`);
    }
  }

  // ================================================================
  // Claude
  // ================================================================
  if (provider === 'claude') {
    if (!anthropicApiKey) throw error(500, 'Anthropic API key が未設定');
    const claudeModel = model || settings.anthropic.model || CLAUDE_DEFAULT_MODEL;
    console.log('[ANTHROPIC KEY SOURCE]', 'settings.json');
    const text = await chatClaude({
      apiKey: anthropicApiKey,
      systemPrompt: effectiveSystemPrompt,
      userMessage,
      model: claudeModel,
      images,
    });
    console.log(`[lab-chat] claude ok (${text.length} chars)`);
    return json(await withMemory({ text, provider: 'claude', actualModel: claudeModel }, text));
  }

  throw error(400, `Unknown provider: ${provider}`);
};
