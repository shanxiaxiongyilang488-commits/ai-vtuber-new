import type { CommonIntent } from './intentTypes';

export type IntentDefinition = {
  intent: CommonIntent;
  label: string;
  description: string;
  executable: boolean;
};

export const INTENT_REGISTRY: Record<CommonIntent, IntentDefinition> = {
  CHAT: {
    intent: 'CHAT',
    label: '通常会話',
    description: '生成・編集・解析を実行せず、会話として返答する。',
    executable: false,
  },
  IMAGE: {
    intent: 'IMAGE',
    label: '画像生成',
    description: '新しい画像やイラストを生成する明確な依頼。',
    executable: true,
  },
  VIDEO: {
    intent: 'VIDEO',
    label: '動画生成',
    description: '新しい動画を生成する明確な依頼。StoryCardとVideoPackageを作り、動画生成を開始する。',
    executable: true,
  },
  VIDEO_EDIT: {
    intent: 'VIDEO_EDIT',
    label: '動画編集',
    description: '既存動画・既存StoryCardを元にMotion Promptを調整して再生成する依頼。',
    executable: true,
  },
  MANGA: {
    intent: 'MANGA',
    label: '漫画生成',
    description: '漫画または漫画ページを生成する明確な依頼。',
    executable: true,
  },
  STORYCARD: {
    intent: 'STORYCARD',
    label: 'StoryCard生成',
    description: '作品設計・StoryCardのみを作り、動画や画像の生成は実行しない依頼。',
    executable: true,
  },
  VOICE: {
    intent: 'VOICE',
    label: '音声生成',
    description: '音声・ボイス・読み上げを生成する明確な依頼。',
    executable: true,
  },
  YAML: {
    intent: 'YAML',
    label: 'YAML操作',
    description: 'YAMLの読み込み、確認、編集、変換に関する依頼。',
    executable: false,
  },
  VIDEO_ANALYSIS: {
    intent: 'VIDEO_ANALYSIS',
    label: 'Character Scanner',
    description: 'MP4から抽出したフレームを顔・全身・耳・尻尾のVisual Memory候補へ構造化する依頼。',
    executable: false,
  },
  IMAGE_ANALYSIS: {
    intent: 'IMAGE_ANALYSIS',
    label: '画像解析',
    description: '画像の内容や改善点を分析する依頼。',
    executable: false,
  },
  MEMORY: {
    intent: 'MEMORY',
    label: '記憶操作',
    description: '記憶の確認、保存、更新、固定に関する依頼。',
    executable: false,
  },
  UNKNOWN: {
    intent: 'UNKNOWN',
    label: '不明',
    description: '意図が十分に特定できない。',
    executable: false,
  },
};

export const DEFAULT_COMMON_INTENTS: CommonIntent[] = [
  'CHAT',
  'IMAGE',
  'VIDEO',
  'VIDEO_EDIT',
  'MANGA',
  'STORYCARD',
  'VOICE',
  'YAML',
  'VIDEO_ANALYSIS',
  'IMAGE_ANALYSIS',
  'MEMORY',
];

export function intentDefinitionsFor(intents: CommonIntent[]): IntentDefinition[] {
  return intents.map((intent) => INTENT_REGISTRY[intent]).filter(Boolean);
}
