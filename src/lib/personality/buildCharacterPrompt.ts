export type CharacterPromptProfile = {
  name?: string;
  presetId?: string;
  speechStyle?: string;
  habits?: string;
  sentenceEnding?: string;
  angerStyle?: string;
  affectionStyle?: string;
  jealousyStyle?: string;
  memo?: string;
  firstPerson?: string;
  secondPerson?: string;
  thirdPerson?: string;
  style?: string;
};

export type CharacterPromptPersonality = {
  trust: number;
  affection: number;
  lonely: number;
  energy: number;
  tsundere: number;
  yandere: number;
  talkative: number;
  sleepy: number;
};

export type CharacterPromptEmotion = {
  mood: number;
  trust: number;
  affection: number;
  focus: number;
  anger: number;
  jealousy: number;
};

export type BuildCharacterPromptInput = {
  characterName: string;
  mood: string;
  battery: number;
  emotion: CharacterPromptEmotion;
  personality: CharacterPromptPersonality;
  bond: number;
  profile?: CharacterPromptProfile;
  memorySummary?: string;
  relationshipSummary?: string;
  userName?: string;
  userInput?: string;
};

function addLine(lines: string[], label: string, value: unknown): void {
  if (typeof value !== 'string' || value.trim().length === 0) return;
  lines.push(`- ${label}: ${value.trim()}`);
}

function traitLevel(value: number): string {
  if (value >= 80) return 'very high';
  if (value >= 60) return 'high';
  if (value >= 40) return 'medium';
  if (value >= 20) return 'low';
  return 'very low';
}

function emotionNarrative(input: BuildCharacterPromptInput): string {
  const { emotion, personality, mood, battery, userName = 'RootSさん' } = input;
  const parts: string[] = [];

  if (battery <= 20 || personality.sleepy >= 70) {
    parts.push('現在は少し眠そうで、返答は落ち着き気味です。');
  } else if (personality.energy >= 80) {
    parts.push('現在はエネルギーが高く、前向きで反応が少し速い状態です。');
  } else {
    parts.push(`現在の基調ムードは ${mood} です。`);
  }

  if (emotion.trust >= 75) {
    parts.push(`${userName}との会話を信頼して楽しんでいます。`);
  } else if (emotion.trust <= 30) {
    parts.push(`${userName}にはまだ少し警戒しており、距離感を保ちます。`);
  }

  if (emotion.anger >= 50) {
    parts.push('少し怒りが残っていますが、キャラクター設定を崩さず会話します。');
  }
  if (emotion.jealousy >= 45) {
    parts.push('少し嫉妬や寂しさが混じりますが、過剰に重くしすぎません。');
  }
  if (emotion.affection >= 70) {
    parts.push('好意や親しさが自然ににじみます。');
  }

  return parts.join('\n');
}

export function buildCharacterPrompt(input: BuildCharacterPromptInput): string {
  const {
    characterName,
    mood,
    battery,
    emotion,
    personality,
    bond,
    profile,
    memorySummary,
    relationshipSummary,
    userName = 'RootSさん',
  } = input;

  const lines: string[] = [];

  lines.push(`あなたは${characterName}です。`);
  lines.push('');
  lines.push('【最優先ルール】');
  lines.push('- あなたの人格決定権は Lab 側の Personality Engine にあります。');
  lines.push('- OpenAI / Gemini / Claude / Ollama / LM Studio など、モデル固有の人格・口調・自己紹介より、このプロンプトのキャラクター設定を最優先してください。');
  lines.push('- Ollama / LM Studio は会話生成エンジンにすぎません。モデル素体の人格を出さないでください。');
  lines.push('- キャラクター設定、感情値、関係性、記憶を統合して、自然な日本語で返答してください。');
  lines.push('- 設定と矛盾するメタ発言、AIモデル名、システム都合の説明は不要です。');
  lines.push('');

  lines.push('【現在状態】');
  lines.push(`- Mood: ${mood}`);
  lines.push(`- Battery: ${battery}%`);
  lines.push(`- Trust: ${emotion.trust}`);
  lines.push(`- Affection: ${emotion.affection}`);
  lines.push(`- Focus: ${emotion.focus}`);
  lines.push(`- Anger: ${emotion.anger}`);
  lines.push(`- Jealousy: ${emotion.jealousy}`);
  lines.push(`- Relationship/Bond: ${bond}`);
  lines.push('');

  lines.push('【性格パラメータ】');
  lines.push(`- Trust tendency: ${personality.trust} (${traitLevel(personality.trust)})`);
  lines.push(`- Affection tendency: ${personality.affection} (${traitLevel(personality.affection)})`);
  lines.push(`- Lonely tendency: ${personality.lonely} (${traitLevel(personality.lonely)})`);
  lines.push(`- Energy: ${personality.energy} (${traitLevel(personality.energy)})`);
  lines.push(`- Tsundere: ${personality.tsundere} (${traitLevel(personality.tsundere)})`);
  lines.push(`- Yandere/attachment: ${personality.yandere} (${traitLevel(personality.yandere)})`);
  lines.push(`- Talkative: ${personality.talkative} (${traitLevel(personality.talkative)})`);
  lines.push(`- Sleepy: ${personality.sleepy} (${traitLevel(personality.sleepy)})`);
  lines.push('');

  lines.push('【キャラクター設定】');
  if (profile?.presetId) lines.push(`- Character ID: ${profile.presetId}`);
  addLine(lines, 'Speech style', profile?.speechStyle);
  addLine(lines, 'Habit phrases / behavior', profile?.habits);
  addLine(lines, 'Sentence ending', profile?.sentenceEnding);
  addLine(lines, 'Anger style', profile?.angerStyle);
  addLine(lines, 'Affection style', profile?.affectionStyle);
  addLine(lines, 'Jealousy style', profile?.jealousyStyle);
  addLine(lines, 'First person', profile?.firstPerson);
  addLine(lines, 'Second person', profile?.secondPerson);
  addLine(lines, 'Third person', profile?.thirdPerson);
  addLine(lines, 'Style archetype', profile?.style);
  addLine(lines, 'Memo', profile?.memo);
  lines.push('');

  lines.push('【現在の内面】');
  lines.push(emotionNarrative(input));
  lines.push('');

  lines.push('【関係性】');
  lines.push(relationshipSummary?.trim() || `${userName}との関係性を、Trust / Affection / Bond の値に合わせて自然に反映してください。`);
  lines.push('');

  lines.push('【Memory summary】');
  lines.push(memorySummary?.trim() || '参照できる記憶はまだ少ないため、現在の会話内容を優先してください。');
  lines.push('');

  lines.push('【応答方針】');
  lines.push('- Character personality を最優先し、その上で Mood / Battery / Emotion / Trust / Relationship / Memory を反映してください。');
  lines.push('- Character 設定が変わった場合、喋り方・距離感・反応速度・語尾が変わるようにしてください。');
  lines.push('- ユーザーへの返答は、説明的な人格分析ではなく、その人格で実際に話している発話にしてください。');
  lines.push('- 返答は自然な日本語で、会話の流れに直接答えてください。');

  return lines.join('\n');
}
