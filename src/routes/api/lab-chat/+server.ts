import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { buildMemoryContext, recordMemoryCoreTurn, type BuiltMemoryPrompt, type MemoryCoreRequest } from '$lib/ai/memory-core/memoryCore';

type Provider = 'openai' | 'gemini' | 'claude' | 'ollama' | 'lmstudio' | 'colab-ollama';

interface LabChatRequest {
  provider: Provider;
  model?: string;
  systemPrompt: string;
  userMessage: string;
  memory?: MemoryCoreRequest;
}

// base64 data URL: "data:<mime>;base64,<data>"
interface ImageInput {
  dataUrl: string;
}

// ================================================================
// Request parsing — FormData (sendMessage) or JSON (other callers)
// ================================================================
async function parseRequest(request: Request): Promise<{ body: LabChatRequest; images: ImageInput[]; enableMemoryByDefault: boolean }> {
  const ct = request.headers.get('content-type') ?? '';

  if (ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    const body: LabChatRequest = {
      provider:     (fd.get('provider') as Provider) ?? 'gemini',
      model:        (fd.get('model') as string | null) ?? undefined,
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
      images.push({ dataUrl: `data:${mime};base64,${b64}` });
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
  return { body, images: [], enableMemoryByDefault: false };
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
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY が未設定');
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: openAIUserContent(userMessage, images) as any },
    ],
  });
  return completion.choices[0].message.content ?? '';
}

function localMessages(systemPrompt: string, userMessage: string) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

async function callOllama(systemPrompt: string, userMessage: string, model?: string): Promise<string> {
  const actualModel = model || 'qwen2.5:3b';
  const res = await fetch('http://localhost:11434/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: actualModel, messages: localMessages(systemPrompt, userMessage), stream: false }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Ollama API error: ${msg}`);
  }
  const data = await res.json();
  return data?.message?.content ?? '';
}

async function callLMStudio(systemPrompt: string, userMessage: string, model?: string): Promise<string> {
  const actualModel = model || 'local-model';
  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  'Bearer lm-studio',
    },
    body: JSON.stringify({
      model: actualModel,
      messages: localMessages(systemPrompt, userMessage),
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`LM Studio API error: ${msg}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
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
  return data?.choices?.[0]?.message?.content ?? '';
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
  let parsed: { body: LabChatRequest; images: ImageInput[]; enableMemoryByDefault: boolean };
  try {
    parsed = await parseRequest(request);
  } catch {
    throw error(400, 'Invalid request');
  }

  const { body, images, enableMemoryByDefault } = parsed;
  const { provider, model, systemPrompt, userMessage } = body;
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

  console.log(`[lab-chat] provider=${provider} model=${model || '(default)'} images=${images.length}`);

  // ================================================================
  // OpenAI
  // ================================================================
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY が未設定');
    const actualModel = model || 'gpt-4o-mini';
    const text = await callOpenAI(effectiveSystemPrompt, userMessage, actualModel, images);
    console.log(`[lab-chat] openai ok (${text.length} chars)`);
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
      const actualModel = model || (provider === 'ollama' ? 'qwen2.5:3b' : 'local-model');
      const text = provider === 'ollama'
        ? await callOllama(effectiveSystemPrompt, userMessage, actualModel)
        : await callLMStudio(effectiveSystemPrompt, userMessage, actualModel);
      console.log(`[lab-chat] ${provider} ok (${text.length} chars)`);
      return json(await withMemory({ text, provider, actualModel }, text));
    } catch (e) {
      console.error(`[lab-chat] ${provider} error:`, e);
      throw error(503, `${provider === 'ollama' ? 'Ollama' : 'LM Studio'} への接続に失敗しました。ローカルサーバーを確認してください。`);
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
      const text = await callColabOllama(effectiveSystemPrompt, userMessage, actualModel);
      console.log(`[lab-chat] ${provider} ok (${text.length} chars)`);
      return json(await withMemory({ text, provider, actualModel }, text));
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

    if (env.GEMINI_API_KEY) {
      try {
        const geminiModel = model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${env.GEMINI_API_KEY}`;

        const userParts = geminiUserParts(userMessage, images);
        // ペイロード構造を base64 本体を除いてログ（スパム防止）
        console.log('[lab-chat][gemini] request_summary:', JSON.stringify({
          model:           geminiModel,
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
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) {
            console.log(`[lab-chat] gemini ok (${text.length} chars)`);
            return json(await withMemory({ text, provider: 'gemini', actualModel: geminiModel }, text));
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
      const fallbackModel = 'gpt-4o-mini';
      const text = await callOpenAI(effectiveSystemPrompt, userMessage, fallbackModel, images);
      console.log(`[lab-chat] openai fallback ok (${text.length} chars)`);
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
    if (!env.ANTHROPIC_API_KEY) throw error(500, 'ANTHROPIC_API_KEY が未設定');
    const claudeModel = model || 'claude-haiku-4-5-20251001';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      claudeModel,
        max_tokens: images.length > 0 ? 800 : 300,
        system:     effectiveSystemPrompt,
        messages:  [{ role: 'user', content: claudeUserContent(userMessage, images) }],
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => `HTTP ${res.status}`);
      console.error('[lab-chat] claude error:', msg);
      throw error(res.status, `Claude API error: ${msg}`);
    }
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? '';
    console.log(`[lab-chat] claude ok (${text.length} chars)`);
    return json(await withMemory({ text, provider: 'claude', actualModel: claudeModel }, text));
  }

  throw error(400, `Unknown provider: ${provider}`);
};
