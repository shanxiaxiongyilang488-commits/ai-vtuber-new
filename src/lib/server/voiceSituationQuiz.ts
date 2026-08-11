import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOneShotDeliveryCaption, inferOneShotDeliverySpeed, inferOneShotPitchShiftSemitones, type ChatVoiceDirection } from '../voiceDirection.ts';

export type VoiceQuizChoice = {
  number: number;
  label: string;
};

type VoiceQuizScenario = {
  id: string;
  label: string;
  instruction: string;
  explanation: string;
};

type VoiceQuizPhrase = {
  id: string;
  text: string;
};

type StoredVoiceQuiz = {
  id: string;
  characterId: string;
  createdAt: string;
  status: 'active' | 'answered';
  scenarioId: string;
  choiceScenarioIds: string[];
  phraseId?: string;
  speechText?: string;
  nonce: string;
  commitment: string;
  answeredAt?: string;
  selectedNumber?: number;
};

type VoiceQuizStore = {
  version: 1;
  byCharacter: Record<string, StoredVoiceQuiz>;
  lastScenarioByCharacter: Record<string, string>;
  lastPhraseByCharacter: Record<string, string>;
};

const STORE_PATH = path.resolve(process.cwd(), 'data', 'voice-situation-quiz.json');

// 「ありがとう」は最初の検証用として卒業し、意味を変えずに演技差を
// 聞き分けやすい短文をローテーションする。新しい語句はここへ追加する。
const PHRASES: VoiceQuizPhrase[] = [
  { id: 'daijoubu', text: '大丈夫' },
  { id: 'wakatta', text: 'わかった' },
  { id: 'sou_nanda', text: 'そうなんだ' },
];

const SCENARIOS: VoiceQuizScenario[] = [
  {
    id: 'joy',
    label: 'とても嬉しい',
    instruction: '次の返事だけ声の演技実験。状況は嬉しくてたまらない時。明るい喜びで演じてください。',
    explanation: '明るく弾む声と、少し高い音程が手掛かりです。',
  },
  {
    id: 'tired',
    label: 'ひどく疲れている',
    instruction: '次の返事だけ声の演技実験。状況は疲れ切った直後。強い疲労で弱く演じてください。',
    explanation: '力の抜けた弱い声、遅いテンポ、低めの音程が手掛かりです。',
  },
  {
    id: 'anger',
    label: '怒りを抑えている',
    instruction: '次の返事だけ声の演技実験。状況は怒っている時。怒りを抑え、低い声で演じてください。',
    explanation: '低い音程、張りと緊張、短く強い発音が手掛かりです。',
  },
];

function emptyStore(): VoiceQuizStore {
  return { version: 1, byCharacter: {}, lastScenarioByCharacter: {}, lastPhraseByCharacter: {} };
}

function loadStore(): VoiceQuizStore {
  try {
    if (!existsSync(STORE_PATH)) return emptyStore();
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<VoiceQuizStore>;
    return {
      version: 1,
      byCharacter: parsed.byCharacter && typeof parsed.byCharacter === 'object' ? parsed.byCharacter : {},
      lastScenarioByCharacter: parsed.lastScenarioByCharacter && typeof parsed.lastScenarioByCharacter === 'object'
        ? parsed.lastScenarioByCharacter
        : {},
      lastPhraseByCharacter: parsed.lastPhraseByCharacter && typeof parsed.lastPhraseByCharacter === 'object'
        ? parsed.lastPhraseByCharacter
        : {},
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: VoiceQuizStore): void {
  mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function scenarioById(id: string): VoiceQuizScenario {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown voice quiz scenario: ${id}`);
  return scenario;
}

function shuffledScenarioIds(): string[] {
  const ids = SCENARIOS.map((scenario) => scenario.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return ids;
}

function selectPhrase(store: VoiceQuizStore, characterId: string, requestedSpeechText?: string): VoiceQuizPhrase {
  const requested = requestedSpeechText?.normalize('NFKC').trim().replace(/^[「『"']|[」』"']$/gu, '');
  if (requested) {
    const phrase = PHRASES.find((item) => item.text === requested);
    if (!phrase) {
      throw new Error(`出題に使えるセリフは「${PHRASES.map((item) => item.text).join('」「')}」です。`);
    }
    return phrase;
  }
  const previousId = store.lastPhraseByCharacter[characterId];
  const selectable = PHRASES.filter((phrase) => phrase.id !== previousId);
  return selectable[randomInt(selectable.length)];
}

function speechTextFor(quiz: StoredVoiceQuiz): string {
  // 変更前に作成済みの問題は、そのまま「ありがとう」で採点できる。
  return quiz.speechText?.trim() || 'ありがとう';
}

function commitmentFor(quizId: string, scenarioId: string, nonce: string): string {
  return createHash('sha256').update(`${quizId}:${scenarioId}:${nonce}`, 'utf8').digest('hex');
}

function publicChoices(quiz: StoredVoiceQuiz): VoiceQuizChoice[] {
  return quiz.choiceScenarioIds.map((id, index) => ({
    number: index + 1,
    label: scenarioById(id).label,
  }));
}

export function parseVoiceQuizAnswer(value: string): number | null {
  const text = value.normalize('NFKC');
  const candidates: Array<{ index: number; number: number }> = [];
  for (const match of text.matchAll(/([123])(?:\s*番)?/gu)) {
    candidates.push({ index: match.index ?? 0, number: Number(match[1]) });
  }
  for (const match of text.matchAll(/([一二三])\s*番/gu)) {
    candidates.push({ index: match.index ?? 0, number: ({ 一: 1, 二: 2, 三: 3 } as const)[match[1] as '一' | '二' | '三'] });
  }
  candidates.sort((left, right) => left.index - right.index);
  return candidates.at(-1)?.number ?? null;
}

export function createVoiceSituationQuiz(characterId: string, requestedSpeechText?: string): {
  quizId: string;
  choices: VoiceQuizChoice[];
  commitment: string;
  speechText: string;
  voiceDirection: ChatVoiceDirection;
} {
  const store = loadStore();
  const previousId = store.lastScenarioByCharacter[characterId];
  const selectable = SCENARIOS.filter((scenario) => scenario.id !== previousId);
  const scenario = selectable[randomInt(selectable.length)];
  const phrase = selectPhrase(store, characterId, requestedSpeechText);
  const quizId = randomUUID();
  const nonce = randomBytes(18).toString('hex');
  const quiz: StoredVoiceQuiz = {
    id: quizId,
    characterId,
    createdAt: new Date().toISOString(),
    status: 'active',
    scenarioId: scenario.id,
    choiceScenarioIds: shuffledScenarioIds(),
    phraseId: phrase.id,
    speechText: phrase.text,
    nonce,
    commitment: commitmentFor(quizId, scenario.id, nonce),
  };
  store.byCharacter[characterId] = quiz;
  store.lastScenarioByCharacter[characterId] = scenario.id;
  store.lastPhraseByCharacter[characterId] = phrase.id;
  saveStore(store);

  return {
    quizId,
    choices: publicChoices(quiz),
    commitment: quiz.commitment,
    speechText: phrase.text,
    voiceDirection: {
      instruction: `${scenario.instruction} 返事は「${phrase.text}」だけ。説明や前置きは発声しないでください。`,
      caption: buildOneShotDeliveryCaption(scenario.instruction),
      summary: 'サーバー事前固定済み・声当てクイズ',
      model: 'local-irodori-performance',
      scope: 'one-shot',
      preserveBaseVoice: true,
      speed: inferOneShotDeliverySpeed(scenario.instruction),
      pitchShiftSemitones: inferOneShotPitchShiftSemitones(scenario.instruction),
    },
  };
}

export function getActiveVoiceSituationQuiz(characterId: string): {
  quizId: string;
  choices: VoiceQuizChoice[];
  commitment: string;
  createdAt: string;
  speechText: string;
} | null {
  const quiz = loadStore().byCharacter[characterId];
  if (!quiz || quiz.status !== 'active') return null;
  return {
    quizId: quiz.id,
    choices: publicChoices(quiz),
    commitment: quiz.commitment,
    createdAt: quiz.createdAt,
    speechText: speechTextFor(quiz),
  };
}

export function answerVoiceSituationQuiz(characterId: string, answerText: string): {
  correct: boolean;
  selectedNumber: number;
  correctNumber: number;
  correctLabel: string;
  explanation: string;
  commitment: string;
  nonce: string;
  verified: boolean;
} | null {
  const selectedNumber = parseVoiceQuizAnswer(answerText);
  if (selectedNumber === null) throw new Error('回答は1番・2番・3番のいずれかで指定してください。');
  const store = loadStore();
  const quiz = store.byCharacter[characterId];
  if (!quiz || quiz.status !== 'active') return null;
  const correctNumber = quiz.choiceScenarioIds.indexOf(quiz.scenarioId) + 1;
  const scenario = scenarioById(quiz.scenarioId);
  const verified = commitmentFor(quiz.id, quiz.scenarioId, quiz.nonce) === quiz.commitment;
  quiz.status = 'answered';
  quiz.answeredAt = new Date().toISOString();
  quiz.selectedNumber = selectedNumber;
  saveStore(store);
  return {
    correct: selectedNumber === correctNumber,
    selectedNumber,
    correctNumber,
    correctLabel: scenario.label,
    explanation: scenario.explanation,
    commitment: quiz.commitment,
    nonce: quiz.nonce,
    verified,
  };
}
