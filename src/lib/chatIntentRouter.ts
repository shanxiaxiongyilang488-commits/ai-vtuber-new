/**
 * Character-chat intent gate. Questions always win over generation words so
 * prompts such as "動画を作り直せる？" remain a conversation, not an action.
 */
export type ChatIntent =
  | 'normal_chat'
  | 'question'
  | 'consultation'
  | 'image_generation'
  | 'manga_generation'
  | 'video_generation'
  | 'video_analysis'
  | 'yaml_operation';

const QUESTION = /[？?]|できる(?:？|\?|$)|可能(?:？|\?|$)|どう思う|どうする|教えて|知りたい|確認したい/u;
const CONSULTATION = /相談|悩(?:んで|み)|アドバイス|提案して|どうしたら/u;
const YAML = /\bya?ml\b|YAML/u;
const VIDEO_ANALYSIS = /動画を?(?:解析|分析)|この動画/u;
const VIDEO_GENERATION = /(?:動画|アニメ|映像).*(?:作って|生成して|作成して|動画化して|アニメ化して)|(?:作って|生成して|作成して|動画化して|アニメ化して).*(?:動画|アニメ|映像)/u;
const MANGA_GENERATION = /(?:漫画|マンガ).*(?:作って|生成して|作成して)|(?:作って|生成して|作成して).*(?:漫画|マンガ)/u;
const IMAGE_GENERATION = /(?:画像|イラスト|絵).*(?:作って|生成して|作成して)|(?:作って|生成して|作成して).*(?:画像|イラスト|絵)/u;

export function classifyChatIntent(message: string): ChatIntent {
  const text = message.trim();
  if (!text) return 'normal_chat';
  // Safety ordering: a question/consultation never triggers an engine.
  if (QUESTION.test(text)) return 'question';
  if (CONSULTATION.test(text)) return 'consultation';
  if (VIDEO_ANALYSIS.test(text)) return 'video_analysis';
  if (YAML.test(text)) return 'yaml_operation';
  if (VIDEO_GENERATION.test(text)) return 'video_generation';
  if (MANGA_GENERATION.test(text)) return 'manga_generation';
  if (IMAGE_GENERATION.test(text)) return 'image_generation';
  return 'normal_chat';
}
