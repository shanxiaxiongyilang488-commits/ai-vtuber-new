/**
 * Character Story Pack V3 — Character Memory 専用の「漫画制作の企画」ロジック。
 *
 * - Story Ref（カテゴリ付き複数参照画像）・Gag Generator・Story Dynamics・
 *   構造化された Story Timeline（StoryScene）・強化版 STORY YAML を扱う純粋ロジック。
 * - 画像生成・動画生成・LLM 推論は行わない（ルールベースのみ）。
 * - 永続化しない。character-memory.json には一切触れない（呼び出し側で in-memory 管理）。
 */

/** ① Story Ref のカテゴリ。 */
export type StoryRefCategory = 'character' | 'background' | 'prop' | 'past_manga' | 'other';

/** ① Story Ref（参照画像）。in-memory のみ・キャラごとに独立保持。 */
export type StoryRef = {
  id: string;
  name: string;
  /** data URL もしくはパス（V1 ではアップロード画像の data URL）。 */
  imagePath: string;
  /** ① カテゴリ。既存（未設定）は 'other' 扱い。 */
  category: StoryRefCategory;
};

/** Story Ref の最大保持枚数。 */
export const MAX_REFERENCE_IMAGES = 10;
export const STORY_REF_LIMIT = MAX_REFERENCE_IMAGES;

/** カテゴリの表示メタ（UI のセレクタ／チップ用）。 */
export const STORY_REF_CATEGORIES: { id: StoryRefCategory; icon: string; label: string }[] = [
  { id: 'character', icon: '👧', label: 'キャラ' },
  { id: 'background', icon: '🏠', label: '背景' },
  { id: 'prop', icon: '🤖', label: '小物' },
  { id: 'past_manga', icon: '📖', label: '過去漫画' },
  { id: 'other', icon: '📷', label: 'その他' },
];

/** ② Gag Generator のカテゴリ。 */
export const GAG_CATEGORIES = [
  '猫型アンドロイドあるある',
  '姉妹ネタ',
  '日常',
  '失敗談',
  'バッテリー',
  'お掃除',
  '記憶',
  '充電',
  '子猫メンテロボ',
] as const;
export type GagCategory = (typeof GAG_CATEGORIES)[number];

/** カテゴリ別のネタ候補（各3つ・ルールベース）。 */
const GAG_IDEAS: Record<GagCategory, string[]> = {
  '猫型アンドロイドあるある': [
    '撫でられるとCPU使用率が上がる',
    '褒められた言葉を何度もログ再生する',
    '尻尾の反応だけ先に出てしまう',
  ],
  '姉妹ネタ': [
    '妹の充電ケーブルを勝手に拝借する',
    '姉のフリして妹のログを上書きしようとする',
    'ケンカすると起動音で張り合う',
  ],
  '日常': [
    '朝の挨拶を毎回0.1秒だけ早くしてくる',
    '聞いてないのに天気予報を読み上げる',
    '好みを学習しすぎて勝手にメニューを決める',
  ],
  '失敗談': [
    '掃除中にコードを踏んで自分の電源を抜く',
    '味を「最適化」して塩を入れすぎる',
    'かっこつけた直後に転ぶ',
  ],
  'バッテリー': [
    '残量1%で急に正直になる',
    '省電力モードで動きがスローモーションになる',
    '充電中だけ甘えん坊になる',
  ],
  'お掃除': [
    'ホコリを敵と認識して全力で追う',
    '床を磨きすぎて自分が滑る',
    '片付けた場所を忘れて再検索する',
  ],
  '記憶': [
    '大事な約束より雑談を優先保存していた',
    '去年の恥ずかしい言動を急に再生する',
    '容量不足で「好きな食べ物」を一時退避する',
  ],
  '充電': [
    '充電プラグを枕にして寝落ちする',
    '満充電なのに「もう少しだけ」と粘る',
    '充電中に見た夢のログを自慢してくる',
  ],
  '子猫メンテロボ': [
    '小さい体で大きい工具を運ぼうとする',
    'メンテ対象に懐いて整備が進まない',
    'ネジを一本だけ「お守り」として残す',
  ],
};

/** 選択カテゴリのネタ候補3つを返す（未知カテゴリは空配列）。 */
export function gagIdeas(category: string): string[] {
  return (GAG_IDEAS as Record<string, string[]>)[category] ?? [];
}

/** ③ Story Dynamics（漫画の「動きの条件」）。 */
export interface StoryDynamics {
  min_panels: number;
  min_movements: number;
  expression_changes: boolean;
  unexpected_event: boolean;
  ending_punchline: boolean;
}

export const DEFAULT_STORY_DYNAMICS: StoryDynamics = {
  min_panels: 4,
  min_movements: 3,
  expression_changes: true,
  unexpected_event: true,
  ending_punchline: true,
};

/** ④ Story Timeline の1シーン（dialogue は必須項目として扱う）。 */
export type StoryScene = {
  id: string;
  title: string;
  visual: string;
  action: string;
  dialogue: string;
  emotion: string;
};

/** YAML 出力用の参照（name＋category）。 */
export interface StoryReference {
  name: string;
  category: StoryRefCategory;
}

/** STORY YAML の生成項目（V3 強化版）。 */
export interface StoryDraft {
  title: string;
  theme: string;
  gagCategory: string;
  gagIdea: string;
  characters: string[];
  references: StoryReference[];
  dynamics: StoryDynamics;
  scenes: StoryScene[];
  emotion: string;
  ending: string;
}

/** 会話履歴の最小形（生成の参考に使う）。 */
export interface StoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Story Ref を1件生成する（id は in-memory 用の一時 ID）。 */
export function createStoryRef(
  name: string,
  imagePath: string,
  category: StoryRefCategory = 'other',
): StoryRef {
  const id = `story-ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name: name.trim() || '無題', imagePath, category };
}

function newSceneId(): string {
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function snippet(text: string, max = 40): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

interface KeywordRule {
  label: string;
  words: string[];
}

/** テーマ推定（会話履歴のキーワードから。先頭一致を採用）。 */
const STORY_THEME_RULES: KeywordRule[] = [
  { label: '創作・漫画制作', words: ['漫画', 'マンガ', 'ストーリー', '作画', 'ネーム', '創作'] },
  { label: 'AI・人格研究', words: ['AI', '哲学', '思想', '人格'] },
  { label: 'ものづくり', words: ['作りたい', '実装', 'コード', '制作', '作ろう', 'ボイス'] },
  { label: '休息・癒し', words: ['疲れた', '眠い', '休み', '癒', 'のんびり'] },
  { label: '冒険・挑戦', words: ['挑戦', '冒険', '頑張', '挑む'] },
];

/** 感情推定（会話履歴のキーワードから）。 */
const STORY_EMOTION_RULES: KeywordRule[] = [
  { label: 'わくわく', words: ['楽しい', '作りたい', 'わくわく', '面白'] },
  { label: '切なさ', words: ['寂しい', '悲しい', '切ない'] },
  { label: 'やさしさ', words: ['疲れた', '眠い', '大丈夫', 'ありがとう'] },
];

function detectLabel(text: string, rules: KeywordRule[]): string | null {
  for (const rule of rules) {
    if (rule.words.some((word) => text.includes(word))) return rule.label;
  }
  return null;
}

/**
 * 展開のある4コマ構成（起承転結）を生成する。
 * 1枚画像からでも「動き・表情変化・予想外・オチ」が出るようにする。
 */
function defaultScenes(name: string, gagIdea: string, emotion: string): StoryScene[] {
  const idea = gagIdea.trim() || '日常のひとコマ';
  const surprise = emotion && emotion !== '穏やか' ? emotion : 'びっくり';
  return [
    {
      id: newSceneId(), title: '導入',
      visual: `${name}がいつもの様子でいる`,
      action: '物語が静かに始まる',
      dialogue: '「いつも通りの一日だね」',
      emotion: '平常',
    },
    {
      id: newSceneId(), title: '展開',
      visual: `${name}が「${idea}」に直面する`,
      action: '小さな変化が起きて動き出す',
      dialogue: '「あれ……？なんだか変かも」',
      emotion: '戸惑い',
    },
    {
      id: newSceneId(), title: '転換',
      visual: '予想外の出来事が割り込む',
      action: `${name}が驚いて飛び上がる`,
      dialogue: '「えっ、そんなことある！？」',
      emotion: surprise,
    },
    {
      id: newSceneId(), title: 'オチ',
      visual: `${name}が照れ笑いする`,
      action: 'みんなで笑って一件落着',
      dialogue: '「……まあ、これも私らしいか」',
      emotion: '笑顔',
    },
  ];
}

/**
 * 会話履歴・キャラ名・Story Ref・Gag から STORY YAML のドラフトを組み立てる（純粋関数）。
 * scenes が渡された場合は編集済みとして優先採用し、無ければ4コマ構成を自動生成する。
 */
export function buildStoryDraft(input: {
  characterName: string;
  messages: StoryMessage[];
  refs: StoryRef[];
  gagCategory?: string;
  gagIdea?: string;
  scenes?: StoryScene[];
}): StoryDraft {
  const name = input.characterName.trim() || 'キャラクター';
  const userTexts = input.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text)
    .filter((text) => text.trim().length > 0);
  const joined = userTexts.join(' ');

  const theme = detectLabel(joined, STORY_THEME_RULES) ?? '日常';
  const emotion = detectLabel(joined, STORY_EMOTION_RULES) ?? '穏やか';
  const gagCategory = (input.gagCategory ?? '').trim();
  const gagIdea = (input.gagIdea ?? '').trim();

  const references: StoryReference[] = input.refs.map((ref) => ({ name: ref.name, category: ref.category }));
  const scenes = input.scenes && input.scenes.length > 0
    ? input.scenes
    : defaultScenes(name, gagIdea, emotion);

  const title = gagIdea
    ? `${snippet(gagIdea, 20)}の話`
    : `${name}と${theme}の物語`;

  return {
    title,
    theme,
    gagCategory,
    gagIdea,
    characters: [name],
    references,
    dynamics: { ...DEFAULT_STORY_DYNAMICS },
    scenes,
    emotion,
    ending: `${name}の物語はつづく。`,
  };
}

/** YAML のダブルクオートスカラへ安全に変換（日本語はそのまま、引用符等のみエスケープ）。 */
function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

/** ⑤ StoryDraft を強化版 YAML（story: ルート）へ整形する。 */
export function storyDraftToYaml(draft: StoryDraft): string {
  const lines: string[] = [];
  lines.push('story:');
  lines.push(`  title: ${yamlScalar(draft.title)}`);
  lines.push(`  theme: ${yamlScalar(draft.theme)}`);
  lines.push(`  gag_category: ${yamlScalar(draft.gagCategory)}`);
  lines.push(`  gag_idea: ${yamlScalar(draft.gagIdea)}`);

  lines.push('');
  if (draft.characters.length === 0) {
    lines.push('  characters: []');
  } else {
    lines.push('  characters:');
    for (const character of draft.characters) lines.push(`    - ${yamlScalar(character)}`);
  }

  lines.push('');
  if (draft.references.length === 0) {
    lines.push('  references: []');
  } else {
    lines.push('  references:');
    for (const ref of draft.references) {
      lines.push(`    - name: ${yamlScalar(ref.name)}`);
      lines.push(`      category: ${ref.category}`);
    }
  }

  lines.push('');
  lines.push('  dynamics:');
  lines.push(`    min_panels: ${draft.dynamics.min_panels}`);
  lines.push(`    min_movements: ${draft.dynamics.min_movements}`);
  lines.push(`    expression_changes: ${draft.dynamics.expression_changes}`);
  lines.push(`    unexpected_event: ${draft.dynamics.unexpected_event}`);
  lines.push(`    ending_punchline: ${draft.dynamics.ending_punchline}`);

  lines.push('');
  if (draft.scenes.length === 0) {
    lines.push('  scenes: []');
  } else {
    lines.push('  scenes:');
    for (const scene of draft.scenes) {
      lines.push(`    - title: ${yamlScalar(scene.title)}`);
      lines.push(`      visual: ${yamlScalar(scene.visual)}`);
      lines.push(`      action: ${yamlScalar(scene.action)}`);
      lines.push(`      dialogue: ${yamlScalar(scene.dialogue)}`);
      lines.push(`      emotion: ${yamlScalar(scene.emotion)}`);
    }
  }

  lines.push('');
  lines.push(`  emotion: ${yamlScalar(draft.emotion)}`);
  lines.push(`  ending: ${yamlScalar(draft.ending)}`);
  return lines.join('\n');
}

function indentOf(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

/** YAML スカラ（ダブルクオート or 素のテキスト）を文字列へ。失敗しても素の値を返す。 */
function parseScalar(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('"')) {
    try {
      return String(JSON.parse(value));
    } catch {
      return value.replace(/^"|"$/g, '');
    }
  }
  return value;
}

function applySceneKv(scene: Record<string, string>, kv: string): void {
  const index = kv.indexOf(':');
  if (index < 0) return;
  const key = kv.slice(0, index).trim();
  if (key === 'title' || key === 'visual' || key === 'action' || key === 'dialogue' || key === 'emotion') {
    scene[key] = parseScalar(kv.slice(index + 1));
  }
}

/**
 * アップロードされた STORY YAML から scenes を寛容に抽出する（ベストエフォート）。
 * 自前の storyDraftToYaml 形式を想定。一致しなければ空配列。例外は投げない。
 */
export function parseScenesFromYaml(text: string): StoryScene[] {
  const scenes: StoryScene[] = [];
  let inScenes = false;
  let current: Record<string, string> | null = null;

  const flush = () => {
    if (!current) return;
    const has = ['title', 'visual', 'action', 'dialogue', 'emotion'].some((key) => current?.[key]);
    if (has) {
      scenes.push({
        id: newSceneId(),
        title: current.title ?? '',
        visual: current.visual ?? '',
        action: current.action ?? '',
        dialogue: current.dialogue ?? '',
        emotion: current.emotion ?? '',
      });
    }
    current = null;
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!inScenes) {
      if (trimmed === 'scenes:' || trimmed === '- scenes:') inScenes = true;
      continue;
    }
    if (trimmed === '') continue;
    // scenes 配下は4スペース以上のインデント。それ未満なら scenes ブロック終了。
    if (indentOf(line) <= 3) {
      flush();
      break;
    }
    if (trimmed.startsWith('- ')) {
      flush();
      current = {};
      applySceneKv(current, trimmed.slice(2));
    } else if (current) {
      applySceneKv(current, trimmed);
    }
  }
  flush();
  return scenes;
}

/**
 * Story Card V5 — 完全YAML構造モデル。
 *
 * 内部データは常にこの構造（= YAML と1:1対応）に統一し、UI はこれをレンダリングするだけ。
 * SCENES は配列オブジェクト、dialogue は { speaker, text } の配列として構造化する。
 */
export interface StoryDialogue {
  speaker: string;
  text: string;
}

export interface StoryDocScene {
  title: string;
  visual: string;
  action: string;
  dialogue: StoryDialogue[];
  emotion: string;
}

export interface StoryDoc {
  title: string;
  theme: string;
  characters: string[];
  scenes: StoryDocScene[];
}

function applyDocSceneKv(scene: StoryDocScene, kv: string): void {
  const index = kv.indexOf(':');
  if (index < 0) return;
  const key = kv.slice(0, index).trim();
  if (key === 'title' || key === 'visual' || key === 'action' || key === 'emotion') {
    scene[key] = parseScalar(kv.slice(index + 1));
  }
}

function applyDialogueKv(dialogue: StoryDialogue, kv: string): void {
  const index = kv.indexOf(':');
  if (index < 0) return;
  const key = kv.slice(0, index).trim();
  if (key === 'speaker' || key === 'text') {
    dialogue[key] = parseScalar(kv.slice(index + 1));
  }
}

/**
 * Story Card V5: assistant 本文から Story（YAML）を抽出し、完全YAML構造（StoryDoc）へ変換する。
 * - ```yaml フェンス or 素の `story:` ブロックの両方に対応。
 * - dialogue は { speaker, text } 配列に構造化。旧形式（dialogue: "文字列" / 文字列リスト）も吸収。
 * - Story でなければ null。preamble は YAML 以外の地の文。
 * 純粋関数（副作用なし・例外を投げない）。
 */
export function parseStoryDoc(text: string): { preamble: string; doc: StoryDoc } | null {
  if (!text || !text.includes('story:')) return null;

  let yamlText: string;
  let preamble: string;
  const fence = text.match(/```(?:ya?ml)?\s*\n?([\s\S]*?)```/i);
  if (fence && fence[1].includes('story:')) {
    yamlText = fence[1];
    const start = fence.index ?? 0;
    preamble = (text.slice(0, start) + text.slice(start + fence[0].length)).trim();
  } else {
    const allLines = text.split(/\r?\n/);
    const start = allLines.findIndex((line) => line.trim() === 'story:' || line.trim() === '- story:');
    if (start < 0) return null;
    preamble = allLines.slice(0, start).join('\n').trim();
    yamlText = allLines.slice(start).join('\n');
  }

  const doc: StoryDoc = { title: '', theme: '', characters: [], scenes: [] };
  let section: 'root' | 'characters' | 'scenes' = 'root';
  let scene: StoryDocScene | null = null;
  let inDialogue = false;
  let pendingDialogue: StoryDialogue | null = null;

  const flushDialogue = () => {
    if (scene && pendingDialogue) { scene.dialogue.push(pendingDialogue); pendingDialogue = null; }
  };
  const pushScene = () => {
    if (scene) { flushDialogue(); doc.scenes.push(scene); scene = null; }
    inDialogue = false;
  };

  for (const raw of yamlText.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === '' || t === 'story:' || t === '- story:') continue;

    // story 直下のトップレベルキー（インデント2以下）。
    if (indentOf(raw) <= 2) {
      pushScene();
      if (t === 'characters:') { section = 'characters'; continue; }
      if (t === 'scenes:') { section = 'scenes'; continue; }
      if (/^title:/.test(t)) { doc.title = parseScalar(t.slice(t.indexOf(':') + 1)); section = 'root'; continue; }
      if (/^theme:/.test(t)) { doc.theme = parseScalar(t.slice(t.indexOf(':') + 1)); section = 'root'; continue; }
      section = 'root';
      continue;
    }

    if (section === 'characters') {
      if (t.startsWith('- ')) doc.characters.push(parseScalar(t.slice(2)));
      continue;
    }

    if (section === 'scenes') {
      // 新しいシーン項目（"- title: ..." など）。
      if (t.startsWith('- ') && /^(title|visual|action|emotion|dialogue)\s*:/.test(t.slice(2).trim())) {
        pushScene();
        scene = { title: '', visual: '', action: '', dialogue: [], emotion: '' };
        const rest = t.slice(2).trim();
        if (/^dialogue\s*:/.test(rest)) {
          const value = rest.slice(rest.indexOf(':') + 1).trim();
          if (value) scene.dialogue.push({ speaker: '', text: parseScalar(value) });
          else inDialogue = true;
        } else {
          applyDocSceneKv(scene, rest);
        }
        continue;
      }
      if (!scene) continue;

      if (inDialogue) {
        if (t.startsWith('- ')) {
          flushDialogue();
          const rest = t.slice(2).trim();
          if (/^(speaker|text)\s*:/.test(rest)) {
            pendingDialogue = { speaker: '', text: '' };
            applyDialogueKv(pendingDialogue, rest);
          } else {
            scene.dialogue.push({ speaker: '', text: parseScalar(rest) });
          }
          continue;
        }
        if (pendingDialogue && /^(speaker|text)\s*:/.test(t)) { applyDialogueKv(pendingDialogue, t); continue; }
        // dialogue ブロック終了 → シーンのスカラキーとして処理継続。
        flushDialogue();
        inDialogue = false;
      }

      if (/^dialogue\s*:/.test(t)) {
        const value = t.slice(t.indexOf(':') + 1).trim();
        if (value) scene.dialogue.push({ speaker: '', text: parseScalar(value) });
        else inDialogue = true;
        continue;
      }
      applyDocSceneKv(scene, t);
    }
  }
  pushScene();

  if (!doc.title && doc.scenes.length === 0) return null;
  if (!doc.title) doc.title = '無題のストーリー';
  return { preamble, doc };
}

/**
 * Story Card V5: StoryDoc から完全YAML構造の文字列を生成する（story: ルート）。
 * dialogue は { speaker, text } 配列として出力。出力/コピー/ダウンロード時のみ呼ぶ純粋関数。
 */
export function storyDocToYaml(doc: StoryDoc): string {
  const lines: string[] = ['story:'];
  lines.push(`  title: ${yamlScalar(doc.title)}`);
  lines.push(`  theme: ${yamlScalar(doc.theme)}`);
  if (doc.characters.length === 0) {
    lines.push('  characters: []');
  } else {
    lines.push('  characters:');
    for (const character of doc.characters) lines.push(`    - ${yamlScalar(character)}`);
  }
  if (doc.scenes.length === 0) {
    lines.push('  scenes: []');
  } else {
    lines.push('  scenes:');
    for (const scene of doc.scenes) {
      lines.push(`    - title: ${yamlScalar(scene.title)}`);
      lines.push(`      visual: ${yamlScalar(scene.visual)}`);
      lines.push(`      action: ${yamlScalar(scene.action)}`);
      if (scene.dialogue.length === 0) {
        lines.push('      dialogue: []');
      } else {
        lines.push('      dialogue:');
        for (const line of scene.dialogue) {
          lines.push(`        - speaker: ${yamlScalar(line.speaker)}`);
          lines.push(`          text: ${yamlScalar(line.text)}`);
        }
      }
      lines.push(`      emotion: ${yamlScalar(scene.emotion)}`);
    }
  }
  return lines.join('\n');
}
