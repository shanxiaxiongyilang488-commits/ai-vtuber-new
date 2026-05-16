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

export function buildMemorySystemPrompt(input: BuildMemoryPromptInput): BuiltMemoryPrompt {
  const base = input.baseSystemPrompt?.trim() || input.persona?.trim() || 'あなたは親しみやすいAI VTuberです。';
  const shortTermMessages = trimShortTermMessages(input.shortTermMessages);
  const injectedMemoryIds = [
    ...input.sharedMemories.map((memory) => memory.id),
    ...input.characterMemories.map((memory) => memory.id),
  ];

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
    },
  };
}
