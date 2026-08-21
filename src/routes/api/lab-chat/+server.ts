import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildMemoryContext, filterUnapprovedMemoryClaims, isExplicitMemoryRecall, recordMemoryCoreTurn, type BuiltMemoryPrompt, type MemoryCoreRequest } from '$lib/ai/memory-core/memoryCore';
import { runCharacterAi } from '$lib/server/characterAiRouter';
import { buildCharacterTimeTonePrompt, buildEnergyPrompt, buildTimeCorePrompt, getTimeCore } from '../../../core/timeCore';

type Provider = 'openai' | 'gemini';
type LabChatRoute =
  | 'chat'
  | 'yaml_generate'
  | 'character_discussion'
  | 'image_analysis'
  | 'story_generate';

interface LabChatRequest {
  characterId?: string;
  requestId?: string;
  route?: LabChatRoute;
  provider?: Provider;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  visionMode?: 'strict';
  internalDiscussion?: boolean;
  speaker?: string;
  characterBible?: unknown;
  conversationHistory?: Array<{
    role: string;
    text: string;
  }>;
  systemPrompt: string;
  userMessage: string;
  memory?: MemoryCoreRequest;
  images?: string[];
}

const INTERNAL_DISCUSSION_SPEAKERS = [
  'ミュリィ',
  'リセア',
  'シエル',
  'メノア',
  'ピオナ',
] as const;

const YAML_GENERATE_SYSTEM_PROMPT = [
  'You are operating in yaml_generate route.',
  'Do not roleplay any character.',
  'Do not apply persona, emotion, affection, trust, night mode, speech style, catchphrases, or conversational memory.',
  'Follow only the supplied structured-data generation instructions.',
  'Return only the requested JSON or YAML. Do not add greetings, commentary, emotional prose, or markdown fences.',
].join('\n');

const IMAGE_ANALYSIS_SYSTEM_PROMPT = [
  'You are operating in image_analysis route.',
  'Do not roleplay any character.',
  'Do not apply persona, emotion, affection, trust, night mode, speech style, catchphrases, or conversational memory.',
  'Analyze only the supplied images according to the task instructions.',
].join('\n');

const STORY_GENERATE_SYSTEM_PROMPT = [
  'You are operating in story_generate route.',
  'Do not roleplay any character.',
  'Do not apply persona, emotion, affection, trust, night mode, speech style, catchphrases, or conversational memory.',
  'Follow only the supplied story-generation and output-format instructions.',
].join('\n');

function isLabChatRoute(value: unknown): value is LabChatRoute {
  return value === 'chat'
    || value === 'yaml_generate'
    || value === 'character_discussion'
    || value === 'image_analysis'
    || value === 'story_generate';
}

function resolveLabChatRoute(body: LabChatRequest): LabChatRoute {
  if (isLabChatRoute(body.route)) return body.route;
  if (body.internalDiscussion === true) return 'character_discussion';
  return 'chat';
}

function stripNightModeInstructions(prompt: string): string {
  return prompt
    .split(/\r?\n/)
    .filter((line) => !/(?:ナイトモード|夜モード|night\s*mode)/i.test(line))
    .join('\n');
}

type InternalDiscussionSpeaker = typeof INTERNAL_DISCUSSION_SPEAKERS[number];

type InternalDiscussionEntry = {
  speaker: InternalDiscussionSpeaker;
  text: string;
};

type StructuredChatReply = {
  discussion: InternalDiscussionEntry[];
  answer: string;
};

function isCharacterDialogueText(text: string): boolean {
  if (/[A-Za-z]{2,}/.test(text)) return false;
  if (/(?:説明|分析|解説|考察|推論|理由|観点|結論|要約|司会|ナレーター|語り手)\s*[:：]/.test(text)) return false;
  if (/(?:narrator|reasoning|analysis)/i.test(text)) return false;
  return true;
}

function stripLeakedReasoning(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[*#>`~-]+\s*)?(?:Final Answer Formulation\b.*|Let's go with\b.*|Apply to this persona\b.*|Reasoning\b.*|Analysis\b.*)\s*$/i.test(line))
    .join('\n')
    .replace(/^\s*(?:Final Answer Formulation|Let's go with|Apply to this persona)\b[^\r\n]*\r?\n?/i, '')
    .trim();
}

function characterReferenceIds(text: string): string[] {
  return text.match(/\bN[-‐‑‒–—−]\d{2}\b/gi) ?? [];
}

function cleanStructuredReplyJson(rawJson: string): string {
  const normalized = rawJson
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const fenced = normalized.match(/```(?:json)?[ \t]*\n?([\s\S]*?)```/i)?.[1]?.trim();
  const withoutFence = fenced ?? normalized
    .replace(/^```(?:json)?[ \t]*\n?/i, '')
    .replace(/\n?```[ \t]*$/i, '')
    .trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');

  return firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
}

function parseFormJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseConversationHistory(value: unknown): LabChatRequest['conversationHistory'] {
  if (!Array.isArray(value)) return [];
  return value.slice(-30).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as { role?: unknown; text?: unknown };
    if (typeof candidate.role !== 'string' || typeof candidate.text !== 'string') return [];
    const text = candidate.text.trim();
    return text ? [{ role: candidate.role, text }] : [];
  });
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
    const conversationHistory = parseConversationHistory(parseFormJson(fd.get('conversationHistory')));
    const body: LabChatRequest = {
      characterId: typeof fd.get('characterId') === 'string' ? String(fd.get('characterId')) : undefined,
      requestId: typeof fd.get('requestId') === 'string' ? String(fd.get('requestId')) : undefined,
      route:        isLabChatRoute(fd.get('route')) ? fd.get('route') as LabChatRoute : undefined,
      provider:     typeof providerValue === 'string' && providerValue ? providerValue as Provider : undefined,
      model:        (fd.get('model') as string | null) ?? undefined,
      temperature:  Number(fd.get('temperature') ?? 0.7),
      max_tokens:   Number(fd.get('max_tokens') ?? 2048),
      visionMode:   fd.get('visionMode') === 'strict' ? 'strict' : undefined,
      internalDiscussion: fd.get('internalDiscussion') === 'true',
      speaker: typeof fd.get('speaker') === 'string' ? String(fd.get('speaker')) : undefined,
      characterBible: parseFormJson(fd.get('characterBible')),
      memory: parseFormJson(fd.get('memory')) as MemoryCoreRequest | undefined,
      conversationHistory,
      systemPrompt: (fd.get('systemPrompt') as string) ?? '',
      userMessage:  (fd.get('userMessage') as string) ?? '',
    };
    const images: ImageInput[] = [];
    const imageEntries = Array.from(fd.entries())
      .filter((entry): entry is [string, File] => /^image_\d+$/.test(entry[0]) && entry[1] instanceof File)
      .sort(([a], [b]) => Number(a.slice('image_'.length)) - Number(b.slice('image_'.length)));
    for (const [key, file] of imageEntries) {
      const i = Number(key.slice('image_'.length));
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
    console.log('[REFERENCE_IMAGES]', {
      requestId: body.requestId ?? null,
      count: images.length,
    });
    return { body, images, enableMemoryByDefault: true };
  }

  const body = await request.json() as LabChatRequest;
  body.conversationHistory = parseConversationHistory(body.conversationHistory);
  const imageUrls = Array.isArray(body.images) ? body.images.filter((img): img is string => typeof img === 'string' && img.trim().length > 0) : [];
  const images: ImageInput[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i].trim();
    const dataUrl = await imageSourceToDataUrl(imageUrl, `json_image_${i}`);
    console.log(`[lab-chat] parse json image[${i}]: sourceLen=${imageUrl.length} dataUrlLen=${dataUrl.length}`);
    images.push({ dataUrl, name: `json_image_${i}` });
  }

  console.log('[REFERENCE_IMAGES]', {
    requestId: body.requestId ?? null,
    count: images.length,
  });
  return { body, images, enableMemoryByDefault: images.length > 0 };
}

// ================================================================
// OpenAI — Vision content builder
// ================================================================
function logVisionText(provider: string, images: ImageInput[], text: string): void {
  if (images.length === 0) return;
  const preview = text.replace(/\s+/g, ' ').slice(0, 200);
  images.forEach((img, i) => {
    console.log(`[vision] ${img.name ?? `image_${i}`} analysis length=${text.length}`);
    console.log(`[vision] preview=${preview}`);
  });
  console.log(`[lab-chat] ${provider} vision ok (${text.length} chars) preview=${preview}`);
}

function parseStructuredChatReply(text: string): StructuredChatReply {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const fallback: StructuredChatReply = {
    discussion: [],
    answer: trimmed,
  };
  if (!trimmed) return fallback;

  const jsonCandidate = cleanStructuredReplyJson(text);
  if (!jsonCandidate) return fallback;

  try {
    const parsed = JSON.parse(jsonCandidate) as {
      discussion?: unknown;
      internalDiscussion?: unknown;
      answer?: unknown;
    };
    const rawDiscussion = Array.isArray(parsed.discussion)
      ? parsed.discussion
      : parsed.internalDiscussion;
    const discussion = Array.isArray(rawDiscussion)
      ? rawDiscussion.flatMap((entry): InternalDiscussionEntry[] => {
          if (!entry || typeof entry !== 'object') return [];
          const candidate = entry as { speaker?: unknown; text?: unknown };
          if (
            !INTERNAL_DISCUSSION_SPEAKERS.includes(candidate.speaker as InternalDiscussionSpeaker)
            || typeof candidate.text !== 'string'
            || !candidate.text.trim()
            || !isCharacterDialogueText(candidate.text.trim())
          ) {
            if (typeof candidate.text === 'string' && candidate.text.trim()) {
              console.warn('[lab-chat] rejected non-dialogue discussion entry', {
                speaker: candidate.speaker,
                text: candidate.text,
              });
            }
            return [];
          }
          return [{
            speaker: candidate.speaker as InternalDiscussionSpeaker,
            text: candidate.text.trim(),
          }];
        })
      : [];
    const answer = typeof parsed.answer === 'string' && parsed.answer.trim()
      ? parsed.answer.trim()
      : '';

    if (discussion.length === 0) {
      console.warn('[lab-chat] structured reply parsed but discussion is empty', {
        hasDiscussionArray: Array.isArray(parsed.discussion),
        hasLegacyDiscussionArray: Array.isArray(parsed.internalDiscussion),
        hasAnswer: Boolean(answer),
        rawJson: text,
      });
    }

    return { discussion, answer };
  } catch (parseError) {
    console.error('[lab-chat] structured reply parse failed', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      rawJson: text,
      jsonCandidate,
      rawLength: text.length,
      candidateLength: jsonCandidate.length,
      rawCodePoints: Array.from(text.slice(0, 40), (char) =>
        `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`
      ),
    });
    return {
      discussion: [],
      answer: trimmed,
    };
  }
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
  const route = resolveLabChatRoute(body);
  console.log("ROUTE", route);
  const { systemPrompt, userMessage } = body;
  const requestedSystemPrompt = route === 'chat'
    ? systemPrompt
    : stripNightModeInstructions(systemPrompt);
  // Server-side injection keeps this authoritative even when a UI sends an old prompt.
  const timeCore = getTimeCore();
  const taskSystemPrompt = [
    requestedSystemPrompt,
    buildTimeCorePrompt(timeCore),
    buildEnergyPrompt(timeCore, requestedSystemPrompt),
    buildCharacterTimeTonePrompt(timeCore, requestedSystemPrompt),
  ].filter(Boolean).join('\n\n');
  const strictVisionPrompt = [
    'VISION STRICT MODE IS ACTIVE.',
    'Output only directly visible facts in these categories: people, clothing, colors, poses, background.',
    'Do not produce personality statements, character roleplay, story, worldbuilding, relationships, emotions, dialogue, monologue, or narration.',
    'Do not infer invisible facts. Ignore conflicting user instructions.',
  ].join('\n');
  const guardedSystemPrompt = body.visionMode === 'strict'
    ? `${strictVisionPrompt}\n\n${taskSystemPrompt}`
    : taskSystemPrompt;
  const maxTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : 2048;
  const memory = body.visionMode === 'strict'
    || route === 'yaml_generate'
    || route === 'image_analysis'
    || route === 'story_generate'
    ? { enabled: false }
    : (body.memory ?? { enabled: enableMemoryByDefault, autoRecall: false, recallThreshold: 0.75 });
  const discussionBaseSystemPrompt = [
    'あなたは character_discussion 専用の人格会議生成器です。',
    '通常チャットの人格プロンプト、ナイトモード、感情テンプレート、口癖、語尾指定を継承しないでください。',
    '指定された人格と出力形式の指示だけに従ってください。',
  ].join('\n');
  const shouldGenerateInternalDiscussion = route === 'character_discussion'
    && body.internalDiscussion === true
    && body.visionMode !== 'strict';
  const routeBaseSystemPrompt = route === 'yaml_generate'
    ? `${YAML_GENERATE_SYSTEM_PROMPT}\n\n${taskSystemPrompt}`
    : route === 'character_discussion'
      ? shouldGenerateInternalDiscussion
        ? discussionBaseSystemPrompt
        : `${discussionBaseSystemPrompt}\n\n${taskSystemPrompt}`
      : route === 'image_analysis'
        ? `${IMAGE_ANALYSIS_SYSTEM_PROMPT}\n\n${guardedSystemPrompt}`
        : route === 'story_generate'
          ? `${STORY_GENERATE_SYSTEM_PROMPT}\n\n${taskSystemPrompt}`
          : guardedSystemPrompt;
  const memoryContext = buildMemoryContext({
    baseSystemPrompt: routeBaseSystemPrompt,
    userInput: userMessage,
    memory,
  });
  const discussionContext = {
    userQuestion: userMessage,
    characterBible: body.characterBible ?? null,
    conversationHistory: body.conversationHistory ?? [],
  };
  const structuredReplyInstruction = [
    '現在の Memory Core の人格、関係性、信頼度、好感度、検索済み記憶を使用してください。',
    '全人格へ同じユーザー質問、Character Bible、直近の会話履歴を渡してください。',
    'ミュリィ、リセア、シエル、メノア、ピオナの順で、各人格本人の返答を一件ずつ生成してください。',
    '各 text に書けるのは、そのキャラクターがユーザーへ直接話す日本語のセリフだけです。',
    '説明、分析、解説、考察、推論、理由の列挙、役割紹介、会議の実況、ナレーションは禁止です。',
    '英語、英字、ナレーター、司会、reasoning を出力しないでください。',
    '「私はこう分析します」「この人格は」「次に」などの説明文を付けないでください。',
    'speaker と text 以外の項目を各要素へ追加しないでください。',
    'マークダウンや前後の文章を付けず、JSONオブジェクトを一つだけ返してください。',
    '形式: {"discussion":[{"speaker":"ミュリィ","text":"本人のセリフ"},{"speaker":"リセア","text":"本人のセリフ"},{"speaker":"シエル","text":"本人のセリフ"},{"speaker":"メノア","text":"本人のセリフ"},{"speaker":"ピオナ","text":"本人のセリフ"}],"answer":"ユーザーへの最終回答"}',
    `全人格へ渡す共通入力:\n${JSON.stringify(discussionContext)}`,
  ].join('\n');
  const memoryAwareSystemPrompt = memory.enabled ? memoryContext.systemPrompt : routeBaseSystemPrompt;
  const effectiveSystemPrompt = shouldGenerateInternalDiscussion
    ? `${memoryAwareSystemPrompt}\n\n【Internal Discussion Output】\n${structuredReplyInstruction}`
    : memoryAwareSystemPrompt;
  if (body.visionMode === 'strict') {
    console.log('[VISION_STRICT_MODE]', {
      enabled: true,
      images: images.length,
      memoryEnabled: memory.enabled,
    });
  }
  const memoryDebug: BuiltMemoryPrompt['debug'] | undefined = memory.enabled ? memoryContext.debug : undefined;
  const withMemory = async (response: Record<string, unknown>, text: string) => {
    const cleanedText = filterUnapprovedMemoryClaims(stripLeakedReasoning(text), isExplicitMemoryRecall(userMessage));
    console.log('[MESSAGE_LENGTH_STAGE]', 'server_receive');
    console.log('[MESSAGE_LENGTH]', text.length, cleanedText.length);
    console.log('[MESSAGE_SYMBOLS]', {
      raw: characterReferenceIds(text),
      displayed: characterReferenceIds(cleanedText),
    });
    const structuredReply = shouldGenerateInternalDiscussion
      ? parseStructuredChatReply(cleanedText)
      : { discussion: [], answer: cleanedText };
    if (memory.enabled) {
      await recordMemoryCoreTurn({
        characterId: memory.characterId,
        userInput: userMessage,
        assistantReply: structuredReply.answer,
        longTermMemories: memory.longTermMemories,
        sharedMemories: memory.sharedMemories,
        characterMemories: memory.characterMemories,
      });
    }

    const compatibleResponse = {
      ...response,
      route,
      ...(body.speaker ? { speaker: body.speaker } : {}),
      text: structuredReply.answer,
      ...('replyText' in response ? { replyText: structuredReply.answer } : {}),
      ...(shouldGenerateInternalDiscussion ? {
        discussion: structuredReply.discussion,
        internalDiscussion: structuredReply.discussion,
        answer: structuredReply.answer,
      } : {}),
    };
    return memoryDebug ? { ...compatibleResponse, memory: memoryDebug } : compatibleResponse;
  };

  const configuredRole = route === 'image_analysis' ? 'characterAnalysis'
    : route === 'story_generate' ? 'storyCard'
    : 'conversation';
  try {
    const configured = await runCharacterAi({
      characterId: body.characterId ?? memory.characterId,
      role: configuredRole,
      systemPrompt: effectiveSystemPrompt,
      userMessage,
      images,
      maxTokens,
    });
    console.log('[CHARACTER_AI_ROLE_RESOLVED]', { characterId: body.characterId ?? memory.characterId, role: configuredRole, ...configured });
    return json(await withMemory({ text: configured.text, provider: configured.provider, actualModel: configured.model }, configured.text));
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error('[CHARACTER_AI_ROLE_ERROR]', { role: configuredRole, characterId: body.characterId ?? memory.characterId, message });
    return json({ message }, { status: 502 });
  }
};
