export type CharacterVisualVoiceEvidence = {
  hairColor?: string;
  eyeColor?: string;
  ears?: string;
  tail?: string;
  androidParts?: string;
  outfit?: string;
  accessories?: string;
  appearance?: string;
};

export type LocalCharacterVoiceInput = {
  name: string;
  role?: string;
  description?: string;
  visual?: CharacterVisualVoiceEvidence;
};

export type LocalCharacterVoiceProposal = {
  caption: string;
  summary: string;
  reasons: string[];
  testPhrase: string;
};

function compact(value: unknown, max = 180): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function isVisible(value: string): boolean {
  const normalized = value.toLowerCase();
  return Boolean(value) && !hasAny(normalized, [
    'unknown',
    'none visible',
    'not visible',
    '不明',
    'なし',
    '見えない',
  ]);
}

export function buildLocalCharacterVoiceProposal(input: LocalCharacterVoiceInput): LocalCharacterVoiceProposal {
  const name = compact(input.name, 60) || 'このキャラクター';
  const role = compact(input.role);
  const description = compact(input.description, 500);
  const visual = input.visual ?? {};
  const hair = compact(visual.hairColor);
  const eyes = compact(visual.eyeColor);
  const ears = compact(visual.ears);
  const tail = compact(visual.tail);
  const androidParts = compact(visual.androidParts);
  const outfit = compact(visual.outfit);
  const appearance = compact(visual.appearance, 400);
  const all = [role, description, hair, eyes, ears, tail, androidParts, outfit, compact(visual.accessories), appearance]
    .join(' ')
    .normalize('NFKC')
    .toLowerCase();

  let pitch = '自然な中高音域';
  let pace = '聞き取りやすい自然なテンポ';
  const textures = new Set<string>(['親しみやすく滑らかな声質']);
  const performances = new Set<string>(['日常会話で感情が自然に伝わる話し方']);
  const reasons: string[] = [];

  if (hasAny(all, ['妹', 'younger', 'cute', 'kawaii', 'small', 'childlike'])) {
    pitch = '明るい中高音域';
    textures.add('軽やかな可愛らしさ');
    performances.add('素直で表情豊かなリアクション');
    reasons.push('役割・設定から、軽やかさと親しみやすさを優先しました。');
  } else if (hasAny(all, ['姉', 'お姉', 'mature', 'adult', 'leader', 'captain', 'senior'])) {
    pitch = '落ち着いた中音域';
    textures.add('少し大人びた芯と包容力');
    performances.add('余裕のある穏やかな語尾');
    reasons.push('役割・設定から、落ち着きと包容力を優先しました。');
  }

  if (hasAny(all, ['white', 'silver', '白髪', '銀髪', '白色', '銀色'])) {
    textures.add('透明感のある澄んだ響き');
    reasons.push('白・銀系の髪色から、透明感のある響きを加えました。');
  }
  if (hasAny(all, ['black hair', '黒髪', 'dark hair', 'dark outfit', 'black outfit', '黒い服', '黒色'])) {
    textures.add('落ち着いた柔らかな低めの成分');
    reasons.push('暗色の髪や衣装から、声に少し落ち着いた芯を持たせました。');
  }
  if (hasAny(all, ['orange', 'gold', 'blonde', 'amber', 'オレンジ', '金髪', '琥珀', '黄色'])) {
    textures.add('明るく快活な艶');
    performances.add('テンポのよい快活な反応');
    reasons.push('暖色の配色から、明るさと快活さを強めました。');
  }
  if (hasAny(all, ['blue', 'cyan', '青', '水色'])) {
    textures.add('涼しくクリアな抜け');
    reasons.push('青・水色系の要素から、涼しくクリアな抜けを加えました。');
  }

  if (isVisible(androidParts) || hasAny(all, ['android', 'robot', 'mechanical', 'アンドロイド', '機械', 'メカ'])) {
    performances.add('子音を明瞭に発音するが、音声エフェクトや機械音は加えない');
    reasons.push('機械的な外観は発音の明瞭さだけへ反映し、音声加工とは分離しました。');
  }
  if (isVisible(ears) || isVisible(tail) || hasAny(all, ['cat ear', 'animal ear', '猫耳', '獣耳', '尻尾', 'しっぽ'])) {
    performances.add('愛嬌があり、反応が少し機敏');
    reasons.push('耳や尻尾の意匠から、愛嬌と反応の軽快さを加えました。');
  }
  if (hasAny(all, ['smile', 'smiling', 'cheerful', '笑顔', '微笑', '元気'])) {
    textures.add('明るい笑顔を感じる響き');
    reasons.push('表情から、声にも明るい笑顔が感じられる方向を選びました。');
  }
  if (hasAny(all, ['calm', 'serious', 'stoic', '無表情', '冷静', '落ち着'])) {
    pace = '少しゆったりした安定したテンポ';
    performances.add('感情を抑えすぎず静かな余韻を残す');
    reasons.push('落ち着いた印象から、テンポと語尾を穏やかにしました。');
  }

  if (reasons.length === 0) {
    reasons.push('登録された見た目の記述と役割を合わせ、会話で長く聞きやすい自然な声にしました。');
  }

  const textureText = [...textures].slice(0, 6).join('、');
  const performanceText = [...performances].slice(0, 4).join('。');
  const caption = [
    'LOCAL CHARACTER VOICE DESIGN — HIGHEST PRIORITY.',
    `${pitch}。${textureText}。`,
    `${pace}。${performanceText}。`,
    'アニメ調のキャラクターボイスだが、一人の声だけを中央で近く明瞭に録ったドライな生声にする。エコー、リバーブ、コーラス、二重声、位相揺れ、金属的なエフェクトは加えず、長い会話でも自然に聞ける声。',
  ].join(' ');

  return {
    caption,
    summary: `${pitch}・${[...textures].slice(-2).join('・')}`,
    reasons: reasons.slice(0, 4),
    testPhrase: `${name}です。これからよろしくね。`,
  };
}
