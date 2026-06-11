import { formatShortTermMessages, trimShortTermMessages } from './shortTermMemory';
import type { BuildMemoryPromptInput, BuiltMemoryPrompt, LongTermMemory } from './types';

function formatMemories(memories: LongTermMemory[]): string {
  if (memories.length === 0) return '関連記憶なし。';
  return memories
    .map((memory) => {
      const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : '';
      return `- ${memory.title}${tags} (importance:${memory.importance}): ${memory.content}`;
    })
    .join('\n');
}

function normalizeScore(score?: number): number | undefined {
  if (score === undefined) return undefined;
  return Math.max(0, Math.min(100, Number(score) || 0));
}

function buildTrustInstruction(trust?: number): string {
  if (trust === undefined) return '- 信頼度が不明な場合は、記憶への言及は控えめにしてください。';
  if (trust >= 75) return '- Trust が高いので、関連する記憶は自然な範囲で積極的に返答へ反映してください。';
  if (trust >= 40) return '- Trust は中程度です。記憶は話題に強く関係する時だけさりげなく使ってください。';
  return '- Trust が低いので、記憶への言及はかなり控えめにし、踏み込みすぎないでください。';
}

function buildAffectionInstruction(affection?: number): string {
  if (affection === undefined) return '- 親密度が不明な場合は、温度感は自然で落ち着いた表現にしてください。';
  if (affection >= 75) return '- Affection が高いので、記憶に触れる時は少し温かく、親しみのある表現にしてください。';
  if (affection >= 40) return '- Affection は中程度です。記憶に触れる時も過度に甘くせず、自然な親しさに留めてください。';
  return '- Affection が低いので、記憶に触れる時も距離感を保ち、淡々とした表現にしてください。';
}

export function buildMemorySystemPrompt(input: BuildMemoryPromptInput): BuiltMemoryPrompt {
  const base = input.baseSystemPrompt?.trim() || input.persona?.trim() || 'あなたは親しみやすいAI VTuberです。';
  const shortTermMessages = trimShortTermMessages(input.shortTermMessages);
  const trust = normalizeScore(input.trust);
  const affection = normalizeScore(input.affection);
  const injectedMemoryIds = [
    ...input.sharedMemories.map((memory) => memory.id),
    ...input.characterMemories.map((memory) => memory.id),
  ];
  const retrievedMemories = [...input.sharedMemories, ...input.characterMemories].map((memory) => ({
    id: memory.id,
    content: memory.content,
    importance: memory.importance,
    tags: memory.tags,
    timestamp: memory.timestamp,
  }));

  if (input.debug) {
    const systemPrompt = [
      'あなたは Memory Core の記憶検索テスト専用アシスタントです。',
      '',
      '【Debug Memory Mode】',
      '- キャラクター演出、口癖、感情表現、雑談をすべて抑えてください。',
      '- 回答は取得された記憶の内容だけに基づき、1文で簡潔に答えてください。',
      '- 推測、補足説明、前置き、質問返しは禁止です。',
      '- 関連記憶がない場合は「関連する記憶はありません。」とだけ答えてください。',
      '- 記憶内容をそのまま長く引用せず、質問への答えだけを短く返してください。',
      '',
      '【共有記憶】',
      formatMemories(input.sharedMemories),
      '',
      '【このキャラクターとの記憶】',
      formatMemories(input.characterMemories),
      '',
      '【現在のユーザー入力】',
      input.userInput,
    ].join('\n');

    return {
      systemPrompt,
      debug: {
        injectedMemoryIds,
        shortTermCount: shortTermMessages.length,
        retrievedMemories,
      },
    };
  }

  const systemPrompt = [
    base,
    '',
    '【Memory Core】',
    '- 記憶は返答の背景情報です。必要な時だけ、会話に溶け込む形で自然に使ってください。',
    '- 「前回は」「さっきは」「以前あなたは」「記憶によると」のような説明的・機械的な言い方は避けてください。',
    '- 記憶に触れる場合も、キャラクターの口調のまま1〜2文に収めてください。',
    '- 記憶の内容を報告するのではなく、相手を少し理解しているように返答へ反映してください。',
    '- 過去の Assistant 応答に含まれる、質問と無関係な感情的な締め文、季節の比喩、愛情確認、依存的な呼びかけは文体例として再利用しないでください。',
    '- 記憶は事実と会話文脈だけに使い、「覚えてるのか、すごいな」「夏の夜はまだ終わらない」「見捨てないでほしい」「一緒に考えてほしい」等を末尾へ反復しないでください。',
    buildTrustInstruction(trust),
    buildAffectionInstruction(affection),
    '- 記憶にないことを事実として断定しないでください。',
    '- 古い記憶と新しい発言が矛盾する場合は、現在のユーザー発言を優先してください。',
    input.characterName ? `- あなたは「${input.characterName}」として振る舞います。` : '',
    '',
    '【共有記憶】',
    formatMemories(input.sharedMemories),
    '',
    '【このキャラクターとの記憶】',
    formatMemories(input.characterMemories),
    '',
    '【最近の会話（最大30件）】',
    formatShortTermMessages(shortTermMessages),
  ].filter((line) => line !== '').join('\n');

  return {
    systemPrompt,
    debug: {
      injectedMemoryIds,
      shortTermCount: shortTermMessages.length,
      retrievedMemories,
    },
  };
}
