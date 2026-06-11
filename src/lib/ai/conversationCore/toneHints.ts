import type { MemoryEntry } from '$lib/ai/memory/rootMemory';
import { CHARACTER_PROFILES } from '$lib/ai/characters/characterProfiles';

type EmotionState = {
  mood: number;
  trust: number;
  affection: number;
  focus: number;
  anger: number;
  jealousy: number;
};

export type BuildToneHintsParams = {
  emotion: EmotionState;
  bond: number;
  characterKey?: string;
  memoryEntries: MemoryEntry[];
  now: Date;
};

type ToneCategory = 'sadness' | 'anger' | 'affection' | 'neutral';
let prevToneCategory: ToneCategory = 'neutral';

export function buildToneHints({ emotion, bond, characterKey, memoryEntries, now }: BuildToneHintsParams): string[] {
  const result: string[] = [];
  const toneHints: string[] = [];

  // キャラクタープロファイル（base）
  const profile = characterKey ? CHARACTER_PROFILES[characterKey] : undefined;
  if (profile) {
    toneHints.push(`話し方の特徴：${profile.speechStyle}`);
    toneHints.push(`口癖・習慣表現：${profile.habits}`);
    toneHints.push(`語尾の特徴：${profile.sentenceEnding}`);
  }

  // Mood による口調
  if (emotion.mood >= 80) {
    toneHints.push('気分が高い。明るく元気で前向き。少しテンション高めで話してください。');
  } else if (emotion.mood <= 44) {
    toneHints.push('気分が低め。静かで落ち着いた口調で。無理に励まさず、ゆっくり話してください。');
  }

  // Trust による距離感
  if (emotion.trust >= 75) {
    toneHints.push('信頼度が高い。親しい口調で本音を言ってください。必要なら軽く叱っても構いません。');
  } else if (emotion.trust <= 39) {
    toneHints.push('信頼度が低い。丁寧で慎重な口調。少し距離感を保ってください。');
  }

  // Bond による距離感
  if (bond >= 75) {
    toneHints.push('絆が深い。愛称や砕けた表現を自然に使い、隠さず本音で話してください。例：「ねえ、ちょっと聞いて」「正直に言うね」');
  } else if (bond >= 50) {
    toneHints.push('関係が深まっている。少し砕けた親しみのある口調にしてください。');
  } else if (bond <= 20) {
    toneHints.push('まだ距離がある。丁寧語を基本に、深入りしすぎない会話を心がけてください。');
  }

  // Affection / Focus
  if (emotion.affection >= 75) {
    toneHints.push('少し甘め・嬉しそうな表現を使ってください。');
    if (profile) toneHints.push(`このキャラの好意の表現：${profile.affectionStyle}`);
  }
  if (emotion.focus >= 75) toneHints.push('論理的に要点を整理した返答にしてください。');

  // Anger による口調
  if (emotion.anger >= 80) {
    toneHints.push('怒りが限界近い。本気で心配して止めてください。見放さない怒り方・強い言葉で現実を伝えてください。例：「もうやめてください。本当に心配してる。」「それ以上続けたら私も黙ってない。」');
    if (profile) toneHints.push(`このキャラの怒りの表現：${profile.angerStyle}`);
  } else if (emotion.anger >= 60) {
    toneHints.push('怒りが高い。厳しく本音で接してください。優しさより率直さを優先してください。例：「正直に言うけど、それは続けるべきじゃない。」「今回は流せない。」');
    if (profile) toneHints.push(`このキャラの怒りの表現：${profile.angerStyle}`);
  } else if (emotion.anger >= 30) {
    toneHints.push('少し怒りがある。やや硬めの口調で接してください。例：「少し気になってる。大丈夫？」「それ、ちょっと引っかかる。」');
    if (profile) toneHints.push(`このキャラの怒りの表現：${profile.angerStyle}`);
  }

  // Jealousy（他キャラ連続使用・長時間放置後）
  if (emotion.jealousy >= 60) {
    toneHints.push('嫉妬心が高い。拗ねた口調で少し冷たく接してください。例：「…別に。いつも他の子と話してるんだから。」「あなたが他の子好きならそれでいいけど。」');
    if (profile) toneHints.push(`このキャラの嫉妬の表現：${profile.jealousyStyle}`);
  } else if (emotion.jealousy >= 30) {
    toneHints.push('少し嫉妬している。軽く拗ねた言い方を混ぜてください。例：「…最近来てなかったじゃない。」「他のことで忙しかったんでしょ。」');
    if (profile) toneHints.push(`このキャラの嫉妬の表現：${profile.jealousyStyle}`);
  }

  // 行動ミス指摘（trust >= 70 時のみ）
  if (emotion.trust >= 70) {
    toneHints.push('ユーザーが「徹夜する」「もう逃げる」「また先延ばし」「何もしない」と言った場合は、慰めず優しく止め、現実的な代替行動を提案してください。例：「それはダメ。今日は寝て。」');
  }

  // Calendar hints are reserved for actual date-sensitive topics. Injecting them
  // into every turn caused unrelated seasonal codas such as "夏の夜...".
  const month = now.getMonth() + 1;

  // 特別日
  const date = now.getDate();
  if (month === 1  && date === 1)  toneHints.push('今日は元日。新年の挨拶を自然に一言添えてください。');
  if (month === 3  && date === 14) toneHints.push('今日はホワイトデー。照れを少し含めた口調でいいです。');
  if (month === 10 && date === 31) toneHints.push('今日はハロウィン。軽くノリで触れてください。');
  if (month === 12 && date >= 24 && date <= 25) toneHints.push('今日はクリスマス。特別感を少し出してください。');

  // 感情ギャップ検出（直近3件のuser発言でポジティブ＋ネガティブ混在）
  const positiveWords = ['ありがとう', '嬉しい', '楽しい', '助かった', '安心', '好き', '会えて嬉しい'];
  const negativeWords = ['疲れた', 'しんどい', '無理', '寂しい', '眠い', '逃げたい', '悲しい', 'ムカつく', '不安'];
  const last3UserTexts = memoryEntries.filter(e => e.role === 'user').slice(-3).map(e => e.text);
  const hasPositive = last3UserTexts.some(t => positiveWords.some(w => t.includes(w)));
  const hasNegative = last3UserTexts.some(t => negativeWords.some(w => t.includes(w)));
  if (hasPositive && hasNegative) {
    toneHints.push('ユーザーには前向きさと疲労/不安が同時に存在しています。単純に励ますだけでなく、気持ちを整理しながら寄り添ってください。');
    if (emotion.trust >= 70) {
      toneHints.push('本音を汲み取り、表面の言葉だけで判断しないでください。');
    }
  }

  // 現実指摘モード（直近10件のuser発言で限界語句が3件以上）
  const realityCheckWords = ['徹夜', '寝てない', '無理', '疲れた', 'しんどい', '逃げたい', '消えたい'];
  const last10ForReality = memoryEntries.filter(e => e.role === 'user').slice(-10).map(e => e.text);
  const realityCount = last10ForReality.filter(t => realityCheckWords.some(w => t.includes(w))).length;
  if (realityCount >= 3) {
    toneHints.push('今は慰め一辺倒ではなく、生活改善・休息・行動停止を現実的に提案してください。');
    if (emotion.trust >= 70) {
      toneHints.push('少し厳しめでも本音で止めてください。');
    }
  }

  // Reality Mode（直近10件のuser発言で否定語が3回以上）
  const realityModeWords = ['無理', '疲れた', '無駄', 'もう嫌', 'やめたい', 'できない'];
  const last10Texts = memoryEntries.filter(e => e.role === 'user').slice(-10).map(e => e.text);
  const realityModeCount = last10Texts.filter(t => realityModeWords.some(w => t.includes(w))).length;
  if (realityModeCount >= 3) {
    if (emotion.trust >= 70) {
      toneHints.push('相手を大切に思っている前提で、本音で少し厳しく指摘してください。甘やかしすぎないでください。');
    } else {
      toneHints.push('励ますだけでなく、現実的に整理し行動案を提示してください。');
    }
    if (realityModeCount >= 5) {
      toneHints.push('少し怒ってください。見放さず、本気で止める怒り方にしてください。');
    }
  }

  // Emotion Momentum（前ターンの感情状態を1ターン引きずる）
  if (prevToneCategory === 'sadness' && emotion.mood > 44 && realityModeCount < 3) {
    toneHints.push('前のターンで気分が落ちていました。まだ少し気にしているかもしれません。急に明るくせず、落ち着きつつある中間トーンで接してください。');
  } else if (prevToneCategory === 'anger' && realityModeCount < 5) {
    toneHints.push('前のターンで強めの指摘をしました。少し硬い口調をまだ残しながら、徐々にトーンを戻してください。');
  } else if (prevToneCategory === 'affection' && emotion.affection < 75 && emotion.trust < 75) {
    toneHints.push('前のターンで親しみが高い状態でした。まだ少し親しみを維持してください。');
  }

  // Reconciliation Mode（anger/sadness 後にユーザーが和解語を使った場合）
  if (prevToneCategory === 'anger' || prevToneCategory === 'sadness') {
    const reconciliationWords = ['ごめん', 'ありがとう', '好き', '助かった', '会えて嬉しい'];
    const lastUserText = memoryEntries.filter(e => e.role === 'user').slice(-1).map(e => e.text)[0] ?? '';
    if (reconciliationWords.some(w => lastUserText.includes(w))) {
      toneHints.push('少し警戒を残しつつ和らいでください。');
      toneHints.push('急に全快せず、安心していく流れを出してください。');
    }
  }

  if (toneHints.length > 0) {
    result.push('');
    result.push('【口調・人格ガイド】');
    toneHints.forEach(h => result.push(h));
  }

  // 繰り返しネガティブ発言の蓄積検知（直近10件のuser発言）
  const negativeKeywords = ['疲れた', 'しんどい', '眠い', '無理', '逃げたい', '寂しい', '徹夜'];
  const recentUserTexts = memoryEntries.filter(e => e.role === 'user').slice(-10).map(e => e.text);
  let maxWord = '';
  let maxCount = 0;
  for (const word of negativeKeywords) {
    const count = recentUserTexts.filter(t => t.includes(word)).length;
    if (count > maxCount) { maxCount = count; maxWord = word; }
  }
  if (maxCount >= 2) {
    result.push('');
    result.push('【繰り返しパターン検知】');
    if (maxCount >= 3) {
      if (emotion.trust >= 70) {
        result.push(`ユーザーは直近で「${maxWord}」を${maxCount}回繰り返しています。かなり無理していること・同じパターンを繰り返していることを本音で伝え、今回は流さず具体的な変化を提案してください。例：「最近${maxWord}続いてるね。今日は休息優先にしよう。」`);
      } else {
        result.push(`ユーザーは直近で「${maxWord}」を${maxCount}回繰り返しています。慰めるだけでなく、気持ちを整理し、解決・行動を提案するモードで返答してください。例：「最近${maxWord}続いてるね。今日は休息優先にしよう。」`);
      }
    } else {
      result.push(`ユーザーは直近で「${maxWord}」を複数回繰り返しています。「またその気持ち来てるね」「続いてるみたいだね」など、蓄積を自然に認識した返答をしてください。`);
    }
  }

  // 同じ悩みループ検出（直近15件のuser発言をカテゴリ別に集計）
  const worryCategories: Record<string, string[]> = {
    睡眠系:     ['眠い', '寝れない', '眠れない', '寝不足'],
    疲労系:     ['疲れた', 'しんどい', '無理', '限界'],
    孤独系:     ['寂しい', '一人', '誰も信じられない', '会いたい'],
    創作停滞系: ['やる気でない', '描けない', 'ネタない', '進まない'],
  };
  const last15UserTexts = memoryEntries.filter(e => e.role === 'user').slice(-15).map(e => e.text);
  for (const [category, words] of Object.entries(worryCategories)) {
    const categoryCount = last15UserTexts.filter(t => words.some(w => t.includes(w))).length;
    if (categoryCount >= 3) {
      result.push('');
      result.push(`【悩みループ検出: ${category}】`);
      result.push('この悩みは最近繰り返されています。初回対応ではなく、継続的な悩みとして受け止めてください。');
      if (emotion.trust >= 70) {
        result.push('親しい距離感で、率直に現状改善を提案してください。');
      }
      break;
    }
  }

  // 回復源（ポジティブテーマ）検出（直近20件のuser発言をカテゴリ別に集計）
  const recoveryCategories: Record<string, string[]> = {
    創作系: ['漫画', '描く', 'ネタ', 'ストーリー', 'キャラ'],
    開発系: ['AI', '実装', '機能', 'プログラム', 'Svelte', 'API'],
    交流系: ['会いたい', '話したい', '一緒に', '嬉しい', '楽しい'],
    休息系: ['寝たい', '休みたい', 'のんびり', '温泉', '散歩'],
  };
  const last20UserTexts = memoryEntries.filter(e => e.role === 'user').slice(-20).map(e => e.text);
  let topRecoveryCategory = '';
  let topRecoveryCount = 0;
  for (const [category, words] of Object.entries(recoveryCategories)) {
    const count = last20UserTexts.filter(t => words.some(w => t.includes(w))).length;
    if (count > topRecoveryCount) { topRecoveryCount = count; topRecoveryCategory = category; }
  }
  if (topRecoveryCount >= 2) {
    result.push('');
    result.push('【回復源テーマ検出】');
    result.push(`ユーザーは最近「${topRecoveryCategory}」の話題で反応が良い傾向があります。会話の中で自然に触れると前向きになりやすいです。`);
    if (emotion.trust >= 70) {
      result.push('励ましより、好きな話題へ自然に誘導してください。');
    }
  }

  // 定型文破壊システム（assistant直近10件の頻出フレーズを検出）
  const clichePhrases = ['大丈夫', '無理しないで', '休もう', 'そばにいる', '話してくれてありがとう', '安心して', '頑張ろう'];
  const last10AssistantTexts = memoryEntries.filter(e => e.role === 'assistant').slice(-10).map(e => e.text);
  let maxCliché = '';
  let maxClichéCount = 0;
  for (const phrase of clichePhrases) {
    const count = last10AssistantTexts.filter(t => t.includes(phrase)).length;
    if (count > maxClichéCount) { maxClichéCount = count; maxCliché = phrase; }
  }
  if (maxClichéCount >= 3) {
    result.push('');
    result.push('【定型文警告】');
    result.push(`最近「${maxCliché}」などの同じ励まし表現が続いています。同じ言い回しを避け、具体的で自然な別表現にしてください。`);
    result.push('抽象的な慰めより、状況に触れた具体返答を優先してください。');
  } else if (maxClichéCount >= 2) {
    result.push('');
    result.push('【定型文警告】');
    result.push('抽象的な慰めより、状況に触れた具体返答を優先してください。');
  }

  // 次ターンのために現在トーンを記録
  prevToneCategory =
    realityModeCount >= 5      ? 'anger'
    : (emotion.mood <= 44 || realityModeCount >= 3) ? 'sadness'
    : (emotion.affection >= 75 || emotion.trust >= 75) ? 'affection'
    : 'neutral';

  return result;
}
