import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveIrodoriRoot, resolveVoiceModel } from '$lib/server/irodoriModels';
import { applyPronunciation } from '$lib/server/pronunciationDictionary';
import type { RequestHandler } from './$types';

type VoiceDesignerRequest = {
  characterName?: string;
  text?: string;
  displayText?: string;
  performanceCue?: string;
  caption?: string;
  model?: string;
  seed?: string | number;
  seconds?: string | number;
  steps?: string | number;
  cfgCaptionScale?: string | number;
  memo?: string;
  voiceAgeBand?: unknown;
  voiceTuning?: unknown;
  personaTuning?: unknown;
};

type VoiceAgeBand = 'jc' | 'jk' | 'jd';

type VoiceTuningProfile = {
  version: 4;
  basePitch: number;
  tempo: number;
  energy: number;
  breathiness: number;
  forwardTwang: number;
  nasality: number;
  formantShift: number;
  brightness: number;
  body: number;
  presence: number;
  dynamics: number;
  roughness: number;
  rhythmSwing: number;
  endingDrop: number;
  humanize: number;
  tension: number;
  familiarity: number;
  charaLevel: number;
  kogyaruPerformance: number;
  pitchVariation: number;
  articulation: number;
  vowelStretch: number;
  dialectStrength: number;
  dialectStyle: 'standard' | 'kansai' | 'kanazawa';
  era: 'modern' | '90s';
  paletteId?: string;
  mapColor?: string;
  mapX?: number;
  mapY?: number;
};

type LegacyVoiceTuningProfileV3 = {
  version: 3;
  basePitch: number;
  tempo: number;
  energy: number;
  breathiness: number;
  forwardTwang: number;
  nasality: number;
  pitchVariation: number;
  articulation: number;
  vowelStretch: number;
  dialectStrength: number;
  dialectStyle: 'standard' | 'kansai' | 'kanazawa';
  era: 'modern' | '90s';
  paletteId?: string;
  mapColor?: string;
  mapX?: number;
  mapY?: number;
};

type LegacyVoiceTuningProfileV2 = {
  version: 2;
  basePitch: number;
  tempo: number;
  energy: number;
  breathiness: number;
  nasality: number;
  pitchVariation: number;
  articulation: number;
  vowelStretch: number;
  dialectStrength: number;
  dialectStyle: 'standard' | 'kansai' | 'kanazawa';
  era: 'modern' | '90s';
  paletteId?: string;
  mapColor?: string;
  mapX?: number;
  mapY?: number;
};

type LegacyVoiceTuningProfileV1 = {
  version: 1;
  youth: number;
  flashy: number;
  lazy: number;
  nasal: number;
  pitchSwing: number;
  dialect: number;
  dialectStyle: 'standard' | 'kansai' | 'kanazawa';
  era: 'modern' | '90s';
  paletteId?: string;
};
type StoredVoiceTuningProfile =
  | VoiceTuningProfile
  | LegacyVoiceTuningProfileV3
  | LegacyVoiceTuningProfileV2
  | LegacyVoiceTuningProfileV1;

type PersonaTuningProfile = {
  version: 1;
  kind: 'honors' | 'neutral' | 'spontaneous';
  mapX: number;
  mapY: number;
  mapColor: string;
  articulation: number;
  rhythmStability: number;
  pausePlanning: number;
  prosodyChaos: number;
  vowelStretch: number;
  reactionIntensity: number;
  hesitation: number;
  endingControl: number;
  comparisonId?: string;
};

type VoiceLibraryEntry = {
  id: string;
  characterName: string;
  text: string;
  displayText?: string;
  performanceCue?: string;
  caption: string;
  seed: string | null;
  seconds: number | null;
  steps: number;
  cfgCaptionScale?: number;
  pitchSemitones?: number;
  tempoRate?: number;
  formantRatio?: number;
  brightnessDb?: number;
  bodyDb?: number;
  presenceDb?: number;
  compressorRatio?: number;
  roughnessAmount?: number;
  rhythmSwingAmount?: number;
  endingDropAmount?: number;
  humanizeAmount?: number;
  fileName: string;
  audioUrl: string;
  createdAt: string;
  memo: string;
  checkpoint: string;
  generationTimeMs: number;
  modelReloaded: boolean;
  voiceAgeBand?: VoiceAgeBand;
  voiceTuning?: StoredVoiceTuningProfile;
  personaTuning?: PersonaTuningProfile;
};

function sanitizeText(value: string): string {
  // Array.from は正しいサロゲートペア（絵文字など）を1文字として扱う。
  // 孤立したサロゲートだけを置換し、有効なUnicode文字を壊さない。
  return Array.from(value, (character) => {
    const codeUnit = character.charCodeAt(0);
    return character.length === 1 && codeUnit >= 0xD800 && codeUnit <= 0xDFFF
      ? '\uFFFD'
      : character;
  }).join('').trim();
}

function safeFileName(value: string): string {
  const cleaned = sanitizeText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  return cleaned || 'voice_design';
}

function parseRequiredNumber(value: string | number | undefined, field: string): number {
  const raw = typeof value === 'number' ? String(value) : sanitizeText(value ?? '');
  if (!raw) throw new Error(`${field} is required`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than 0`);
  return parsed;
}

function resolveVoiceDesignSeconds(value: string | number | undefined): number | null {
  const raw = typeof value === 'number' ? String(value) : sanitizeText(value ?? '');
  // v3 VoiceDesign は caption も参照する duration predictor を持つ。
  // 未指定時に文字数から固定尺を渡すと「早口」などの指示を打ち消すため、モデルへ任せる。
  if (!raw || raw.toLowerCase() === 'auto') return null;

  // 明示指定はそのまま尊重する (短くしたい・長くしたい両方を許す)。
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 60) {
    throw new Error('seconds must be between 1 and 60');
  }
  return parsed;
}

function parseBoundedNumber(
  value: string | number | undefined,
  field: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = typeof value === 'number' ? String(value) : sanitizeText(value ?? '');
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseVoiceTuning(value: unknown): VoiceTuningProfile | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('voiceTuning must be an object');
  }

  const source = value as Record<string, unknown>;
  const readAxis = (field: string) => {
    const parsed = Number(source[field]);
    if (!Number.isFinite(parsed)) throw new Error(`voiceTuning.${field} must be a number`);
    return Math.max(0, Math.min(100, Math.round(parsed)));
  };
  const dialectStyle = source.dialectStyle;
  const era = source.era;
  if (dialectStyle !== 'standard' && dialectStyle !== 'kansai' && dialectStyle !== 'kanazawa') {
    throw new Error('voiceTuning.dialectStyle is invalid');
  }
  if (era !== 'modern' && era !== '90s') {
    throw new Error('voiceTuning.era is invalid');
  }
  const mapColor = typeof source.mapColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.mapColor)
    ? source.mapColor.toLowerCase()
    : undefined;
  const readMapCoordinate = (field: 'mapX' | 'mapY') => {
    if (source[field] === undefined) return undefined;
    const parsed = Number(source[field]);
    if (!Number.isFinite(parsed) || parsed < -1 || parsed > 1) {
      throw new Error(`voiceTuning.${field} must be between -1 and 1`);
    }
    return parsed;
  };
  const mapX = readMapCoordinate('mapX');
  const mapY = readMapCoordinate('mapY');
  const sourceVersion = Number(source.version);
  const basePitch = readAxis('basePitch');
  const tempo = readAxis('tempo');
  const energy = readAxis('energy');
  const legacyNasality = readAxis('nasality');
  const forwardTwang = sourceVersion >= 3
    ? readAxis('forwardTwang')
    : Math.max(0, Math.min(100, Math.round(45 + legacyNasality * 0.55)));
  const nasality = sourceVersion >= 3
    ? Math.min(35, legacyNasality)
    : Math.max(0, Math.min(35, Math.round(legacyNasality * 0.35)));
  const derivedAxis = (field: string, fallback: number) => (
    sourceVersion >= 4 ? readAxis(field) : Math.max(0, Math.min(100, Math.round(fallback)))
  );

  return {
    version: 4,
    basePitch,
    tempo,
    energy,
    breathiness: readAxis('breathiness'),
    forwardTwang,
    nasality,
    formantShift: derivedAxis('formantShift', 50 + (basePitch - 50) * 0.72),
    brightness: derivedAxis('brightness', 28 + forwardTwang * 0.68),
    body: derivedAxis('body', 76 - basePitch * 0.52),
    presence: derivedAxis('presence', 25 + forwardTwang * 0.62),
    dynamics: derivedAxis('dynamics', 18 + energy * 0.62),
    roughness: source.roughness === undefined
      ? (era === '90s' ? 18 : 8)
      : readAxis('roughness'),
    rhythmSwing: source.rhythmSwing === undefined
      ? (era === '90s' ? 52 : 24)
      : readAxis('rhythmSwing'),
    endingDrop: source.endingDrop === undefined
      ? (era === '90s' ? 58 : 24)
      : readAxis('endingDrop'),
    humanize: source.humanize === undefined
      ? 72
      : readAxis('humanize'),
    tension: source.tension === undefined
      ? (era === '90s' ? 72 : 68)
      : readAxis('tension'),
    familiarity: source.familiarity === undefined
      ? (era === '90s' ? 78 : 68)
      : readAxis('familiarity'),
    charaLevel: source.charaLevel === undefined
      ? (era === '90s' ? 72 : 58)
      : readAxis('charaLevel'),
    kogyaruPerformance: source.kogyaruPerformance === undefined
      ? (era === '90s' ? 78 : 0)
      : readAxis('kogyaruPerformance'),
    pitchVariation: readAxis('pitchVariation'),
    articulation: readAxis('articulation'),
    vowelStretch: readAxis('vowelStretch'),
    dialectStrength: readAxis('dialectStrength'),
    dialectStyle,
    era,
    ...(typeof source.paletteId === 'string'
      ? { paletteId: sanitizeText(source.paletteId).slice(0, 40) }
      : {}),
    ...(mapColor ? { mapColor } : {}),
    ...(mapX !== undefined ? { mapX } : {}),
    ...(mapY !== undefined ? { mapY } : {}),
  };
}

function parsePersonaTuning(value: unknown): PersonaTuningProfile | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('personaTuning must be an object');
  }

  const source = value as Record<string, unknown>;
  const kind = source.kind;
  if (kind !== 'honors' && kind !== 'neutral' && kind !== 'spontaneous') {
    throw new Error('personaTuning.kind is invalid');
  }
  const readAxis = (field: string) => {
    const parsed = Number(source[field]);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new Error(`personaTuning.${field} must be between 0 and 100`);
    }
    return Math.round(parsed);
  };
  const readCoordinate = (field: 'mapX' | 'mapY') => {
    const parsed = Number(source[field]);
    if (!Number.isFinite(parsed) || parsed < -1 || parsed > 1) {
      throw new Error(`personaTuning.${field} must be between -1 and 1`);
    }
    return parsed;
  };
  const mapColor = typeof source.mapColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.mapColor)
    ? source.mapColor.toLowerCase()
    : '#f8fafc';

  return {
    version: 1,
    kind,
    mapX: readCoordinate('mapX'),
    mapY: readCoordinate('mapY'),
    mapColor,
    articulation: readAxis('articulation'),
    rhythmStability: readAxis('rhythmStability'),
    pausePlanning: readAxis('pausePlanning'),
    prosodyChaos: readAxis('prosodyChaos'),
    vowelStretch: readAxis('vowelStretch'),
    reactionIntensity: readAxis('reactionIntensity'),
    hesitation: readAxis('hesitation'),
    endingControl: readAxis('endingControl'),
    ...(typeof source.comparisonId === 'string'
      ? { comparisonId: sanitizeText(source.comparisonId).slice(0, 80) }
      : {}),
  };
}

const GYARU_CAPTION_DETAILS =
  '若々しく明るいギャル声。やや高めで少し鼻にかかった軽い声質。'
  + '抑揚とピッチ変化を大きく、語尾を軽く上げ、親しい友達と盛り上がるような'
  + 'くだけたノリで、笑顔と自信を感じさせながらテンポよく話す。';

const CLEAN_END_CAPTION_DETAILS =
  '入力されたセリフだけを発声する。セリフを読み終えたらすぐに無音になり、'
  + '笑い声、息声、相づち、追加の単語や繰り返しを一切付け加えない。';

const VOICE_AGE_GUARDS: Record<VoiceAgeBand, string> = {
  jc:
    '【最優先の声齢指定】13〜15歳の女子中学生年代を想定した、軽く未成熟な自然声にする。'
    + '声のサイズを小さめにし、明るい前方共鳴と細い芯を保つ。'
    + '成人女性の太い胸声、豊かな低音、艶、母性的なおばさん声、接客口調、ナレーター声には絶対にしない。'
    + '幼児声や甲高いアニメ声にもせず、実在する中学生同士の会話らしくする。'
    + 'この声齢指定は、前に書かれた年齢表現より優先する。',
  jk:
    '【最優先の声齢指定】16〜18歳の女子高校生年代を想定した、明るく軽い自然声にする。'
    + '声のサイズを小さめにし、前方共鳴、細い芯、少し不安定な若い響きを保つ。'
    + '成人女性の太い胸声、豊かな低音、艶、母性的なおばさん声、接客口調、ナレーター声には絶対にしない。'
    + '幼児声や甲高いアニメ声にもせず、実在する高校生同士の会話らしくする。'
    + 'この声齢指定は、前に書かれた年齢表現より優先する。',
  jd:
    '【最優先の声齢指定】18〜22歳の女子大学生年代を想定した、若さが明確な自然声にする。'
    + '社会人女性の落ち着きや完成された話し方ではなく、友達同士の軽い学生らしい響きにする。'
    + '胸声、低音の厚み、艶、母性的なおばさん声、接客口調、ナレーター声を避け、明るく前方へ集めた細い声を保つ。'
    + 'この声齢指定は、前に書かれた年齢表現より優先する。',
};

function parseVoiceAgeBand(value: unknown): VoiceAgeBand {
  if (value === undefined || value === null || value === '') return 'jk';
  if (value === 'jc' || value === 'jk' || value === 'jd') return value;
  throw new Error('voiceAgeBand must be jc, jk, or jd');
}

function enhanceVoiceDesignCaption(value: string): string {
  if (!/(?:ギャル|gyaru|gal voice)/iu.test(value)) return value;
  // 詳細なプリセットは意図が完成しているため、汎用の元気なギャル条件を重ねない。
  if (Array.from(value).length >= 120) return value;
  if (/語尾を.*(?:上げ|跳ね)/u.test(value) && value.includes('鼻にかかった')) return value;
  return `${value}\n${GYARU_CAPTION_DETAILS}`;
}

function finalizeVoiceDesignCaption(value: string, voiceAgeBand: VoiceAgeBand): string {
  let enhanced = enhanceVoiceDesignCaption(value);
  if (/(?:ギャル|コギャル|gyaru|gal voice)/iu.test(enhanced)) {
    enhanced = `${enhanced}\n${VOICE_AGE_GUARDS[voiceAgeBand]}`;
  }
  if (enhanced.includes('セリフを読み終えたらすぐに無音')) return enhanced;
  return `${enhanced}\n${CLEAN_END_CAPTION_DETAILS}`;
}

function buildKogyaruPerformanceCaption(profile: VoiceTuningProfile): string {
  if (profile.era !== '90s' || profile.kogyaruPerformance < 35) return '';
  return [
    `【90s KOGYARU PERFORMANCE ${profile.kogyaruPerformance}/100】発話を均一に読まず、一つのセリフ内で三段階に演じる。`,
    'PHASE 1 PICKUP: 語頭は中低めで少し気だるく入り、最初の短い句の後にごく短い間を置く。',
    'PHASE 2 HIT: 中央の強調語へ一時的に加速し、その語だけピッチと音圧を素早く跳ね上げる。全文を高音にしない。',
    'PHASE 3 DROP: 語尾の母音を少し伸ばしてから雑に落とすか、短く跳ねて切る。上昇語尾だけを反復しない。',
    '1990年代後半の仲間内のコギャル会話として、上品・丁寧・アイドル・ナレーションの均一なリズムを避ける。',
    '入力文にない笑い声、フィラー、掛け声、追加語、最後の余計な声は絶対に発声しない。',
  ].join('');
}

function parsePositiveInteger(value: string | number | undefined, field: string): number {
  const parsed = parseRequiredNumber(value, field);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be an integer`);
  return parsed;
}

function parseOptionalInteger(value: string | number | undefined, field: string): string | null {
  const raw = typeof value === 'number' ? String(Math.trunc(value)) : sanitizeText(value ?? '');
  if (!raw) return null;
  if (!/^-?\d+$/.test(raw)) throw new Error(`${field} must be an integer`);
  return raw;
}

function resolveIrodoriPython(irodoriRoot: string): string {
  const venvPython = path.join(irodoriRoot, '.venv', 'Scripts', 'python.exe');
  if (!existsSync(venvPython)) {
    throw new Error(`Irodori python not found: ${venvPython}`);
  }
  return venvPython;
}

function voiceLibraryPaths(root: string) {
  const outputDir = path.join(root, 'static', 'voice_library');
  return {
    outputDir,
    indexPath: path.join(outputDir, 'index.json'),
  };
}

async function readVoiceLibrary(indexPath: string): Promise<VoiceLibraryEntry[]> {
  try {
    const raw = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as VoiceLibraryEntry[]) : [];
  } catch {
    return [];
  }
}

async function registerVoiceLibraryEntry(indexPath: string, entry: VoiceLibraryEntry) {
  const current = await readVoiceLibrary(indexPath);
  const next = [entry, ...current].slice(0, 300);
  await writeFile(indexPath, JSON.stringify(next, null, 2), 'utf8');
}

function runVoiceDesign(root: string, irodoriRoot: string, inputPath: string, outputPath: string): Promise<void> {
  const pythonExe = resolveIrodoriPython(irodoriRoot);
  const scriptPath = path.join(root, 'python', 'irodori_voice_design.py');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExe, [scriptPath, inputPath, outputPath], {
      cwd: irodoriRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8:replace',
        PYTHONUTF8: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const outputs: string[] = [];
    const errors: string[] = [];

    child.stdout.on('data', (chunk: string) => outputs.push(chunk));
    child.stderr.on('data', (chunk: string) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = errors.join('').trim();
      const stdout = outputs.join('').trim();
      const details = [
        `Irodori VoiceDesign exited with code ${code}`,
        stderr ? `stderr:\n${stderr}` : '',
        stdout ? `stdout:\n${stdout}` : '',
      ].filter(Boolean).join('\n\n');
      reject(new Error(details));
    });
  });
}

function inferModelReloaded(current: VoiceLibraryEntry[], checkpoint: string): boolean {
  const latest = current[0];
  return !latest || latest.checkpoint !== checkpoint;
}

export const GET: RequestHandler = async () => {
  const paths = voiceLibraryPaths(process.cwd());
  const items = await readVoiceLibrary(paths.indexPath);
  return json({ items }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: VoiceDesignerRequest;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let steps: number;
  let cfgCaptionScale: number;
  let seed: string | null;
  let voiceTuning: VoiceTuningProfile | undefined;
  let personaTuning: PersonaTuningProfile | undefined;
  const characterName = sanitizeText(body.characterName ?? '');
  const text = sanitizeText(body.text ?? '');
  const displayText = Array.from(sanitizeText(body.displayText ?? '')).slice(0, 240).join('');
  const performanceCue = Array.from(sanitizeText(body.performanceCue ?? '')).slice(0, 300).join('');
  let voiceAgeBand: VoiceAgeBand;
  try {
    voiceAgeBand = parseVoiceAgeBand(body.voiceAgeBand);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid voice age' }, { status: 400 });
  }
  const inputCaption = sanitizeText(body.caption ?? '');
  let caption = inputCaption ? finalizeVoiceDesignCaption(inputCaption, voiceAgeBand) : '';
  const memo = sanitizeText(body.memo ?? '');

  if (!characterName) return json({ error: 'characterName is required' }, { status: 400 });
  if (!text) return json({ error: 'text is required' }, { status: 400 });
  if (!caption) return json({ error: 'caption is required' }, { status: 400 });

  // 発音辞書は合成テキストにのみ適用し、ライブラリの表示テキストは原文のまま残す
  const speechText = applyPronunciation(text);
  let seconds: number | null;

  try {
    seconds = resolveVoiceDesignSeconds(body.seconds);
    steps = parsePositiveInteger(body.steps, 'steps');
    cfgCaptionScale = parseBoundedNumber(body.cfgCaptionScale, 'cfgCaptionScale', 4, 0, 10);
    seed = parseOptionalInteger(body.seed, 'seed');
    voiceTuning = parseVoiceTuning(body.voiceTuning);
    personaTuning = parsePersonaTuning(body.personaTuning);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid parameters' }, { status: 400 });
  }
  if (voiceTuning) {
    const performanceCaption = buildKogyaruPerformanceCaption(voiceTuning);
    if (performanceCaption && !caption.includes('90s KOGYARU PERFORMANCE')) {
      caption = `${caption}\n${performanceCaption}`;
    }
  }
  const normalizedPitch = voiceTuning ? (voiceTuning.basePitch - 50) / 50 : 0;
  const charaBalance = voiceTuning ? (voiceTuning.charaLevel - 50) / 50 : 0;
  const tensionBalance = voiceTuning ? (voiceTuning.tension - 50) / 50 : 0;
  const hyperTension = Math.max(0, tensionBalance);
  const familiarityBalance = voiceTuning ? (voiceTuning.familiarity - 50) / 50 : 0;
  const tooClose = Math.max(0, familiarityBalance);
  // 高域側は金属的な後処理音が出やすいため +2.0st、低域側は -2.5st に制限する。
  const basePitchSemitones = normalizedPitch >= 0
    ? normalizedPitch * 2
    : normalizedPitch * 2.5;
  const rawPitchSemitones = basePitchSemitones
    - Math.max(0, charaBalance) * 0.45
    + Math.max(0, -charaBalance) * 0.25
    + hyperTension * 0.3
    + tooClose * 0.12;
  const rawTempoRate = voiceTuning
    ? (0.78 + (voiceTuning.tempo / 100) * 0.5)
      * (1 - Math.max(0, charaBalance) * 0.025)
      * (1 + hyperTension * 0.06)
      * (1 + tooClose * 0.015)
    : 1;
  const rawFormantRatio = voiceTuning
    ? 0.94 + (voiceTuning.formantShift / 100) * 0.12
      - Math.max(0, charaBalance) * 0.006
      + Math.max(0, -charaBalance) * 0.004
    : 1;
  const rawBrightnessDb = voiceTuning
    ? ((voiceTuning.brightness - 50) / 50) * 6 - charaBalance * 0.5
    : 0;
  const bodyDb = voiceTuning
    ? ((voiceTuning.body - 50) / 50) * 4 + charaBalance * 0.35
    : 0;
  const rawPresenceDb = voiceTuning
    ? ((voiceTuning.presence - 50) / 50) * 4
      + Math.max(0, charaBalance) * 0.35
      + hyperTension * 0.45
      + tooClose * 0.3
    : 0;
  const compressorRatio = voiceTuning
    ? 1 + (voiceTuning.dynamics / 100) * 2.5
      + Math.max(0, charaBalance) * 0.15
      + hyperTension * 0.1
    : 1;
  const humanizeAmount = voiceTuning ? voiceTuning.humanize / 100 : 0;
  // HUMANIZE preserves the intended direction while reducing artifact-prone DSP depth.
  // Formant and saturation are attenuated most because they create the strongest metallic residue.
  const pitchSemitones = rawPitchSemitones * (1 - humanizeAmount * 0.22);
  const tempoRate = 1 + (rawTempoRate - 1) * (1 - humanizeAmount * 0.12);
  const formantRatio = 1 + (rawFormantRatio - 1) * (1 - humanizeAmount * 0.6);
  const brightnessDb = rawBrightnessDb * (1 - humanizeAmount * 0.35);
  const presenceDb = rawPresenceDb * (1 - humanizeAmount * 0.25);
  const roughnessAmount = (voiceTuning ? voiceTuning.roughness / 100 : 0)
    * (1 - humanizeAmount * 0.75);
  const rhythmSwingAmount = voiceTuning
    ? Math.max(voiceTuning.rhythmSwing / 100, hyperTension * 0.7)
      * (1 - humanizeAmount * 0.25)
    : 0;
  const endingDropAmount = voiceTuning
    ? (voiceTuning.endingDrop / 100) * (1 - hyperTension * 0.75)
    : 0;

  const { env } = await import('$env/dynamic/private');
  const root = process.cwd();
  const irodoriRoot = resolveIrodoriRoot(env);
  const irodoriDesignUrl = env.IRODORI_DESIGN_URL || 'http://127.0.0.1:7861';
  let checkpoint: string;

  try {
    checkpoint = resolveVoiceModel(env, 'kizuna-voice-designer', body.model);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid model' }, { status: 400 });
  }
  const paths = voiceLibraryPaths(root);
  const tmpDir = path.join(root, '.tmp', 'voice-designer');
  const requestId = randomUUID();
  const inputPath = path.join(tmpDir, `${requestId}.json`);
  const fileName = `${safeFileName(characterName)}_${requestId}.wav`;
  const outputPath = path.join(paths.outputDir, fileName);

  try {
    await mkdir(tmpDir, { recursive: true });
    await mkdir(paths.outputDir, { recursive: true });
    await writeFile(
      inputPath,
      JSON.stringify(
        {
          irodoriRoot,
          irodoriDesignUrl,
          checkpoint,
          characterName,
          text: speechText,
          caption,
          seed,
          seconds,
          steps,
          cfgCaptionScale,
          postPitchSemitones: pitchSemitones,
          postTempoRate: tempoRate,
          postFormantRatio: formantRatio,
          postBrightnessDb: brightnessDb,
          postBodyDb: bodyDb,
          postPresenceDb: presenceDb,
          postCompressorRatio: compressorRatio,
          postRoughnessAmount: roughnessAmount,
          postHumanizeAmount: humanizeAmount,
          postRhythmSwingAmount: rhythmSwingAmount,
          postEndingDropAmount: endingDropAmount,
        },
        null,
        2,
      ),
      'utf8',
    );

    const existingEntries = await readVoiceLibrary(paths.indexPath);
    const modelReloaded = inferModelReloaded(existingEntries, checkpoint);
    const startedAt = Date.now();
    await runVoiceDesign(root, irodoriRoot, inputPath, outputPath);
    const generationTimeMs = Date.now() - startedAt;

    const outputStat = await stat(outputPath);
    if (outputStat.size === 0) throw new Error('empty wav output');

    const entry: VoiceLibraryEntry = {
      id: requestId,
      characterName,
      text,
      ...(displayText ? { displayText } : {}),
      ...(performanceCue ? { performanceCue } : {}),
      caption,
      seed,
      seconds,
      steps,
      cfgCaptionScale,
      pitchSemitones,
      tempoRate,
      formantRatio,
      brightnessDb,
      bodyDb,
      presenceDb,
      compressorRatio,
      roughnessAmount,
      humanizeAmount,
      rhythmSwingAmount,
      endingDropAmount,
      fileName,
      audioUrl: `/voice_library/${fileName}`,
      createdAt: new Date().toISOString(),
      memo,
      checkpoint,
      generationTimeMs,
      modelReloaded,
      voiceAgeBand,
      ...(voiceTuning ? { voiceTuning } : {}),
      ...(personaTuning ? { personaTuning } : {}),
    };
    await registerVoiceLibraryEntry(paths.indexPath, entry);

    return json(
      {
        audioUrl: entry.audioUrl,
        fileName,
        libraryEntry: entry,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[api/voice/designer] failed:', e);
    return json(
      {
        error: 'voice designer generation failed',
        detail: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 502 },
    );
  } finally {
    await unlink(inputPath).catch(() => {});
  }
};
