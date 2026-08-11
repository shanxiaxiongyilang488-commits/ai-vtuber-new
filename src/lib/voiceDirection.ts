export const VOICE_DIRECTOR_PARAMETER_KEYS = [
	'basePitch',
	'tempo',
	'energy',
	'breathiness',
	'forwardTwang',
	'nasality',
	'formantShift',
	'brightness',
	'body',
	'presence',
	'dynamics',
	'roughness',
	'rhythmSwing',
	'endingDrop',
	'humanize',
	'tension',
	'familiarity',
	'charaLevel',
	'kogyaruPerformance',
	'pitchVariation',
	'articulation',
	'vowelStretch',
] as const;

export type VoiceDirectorParameter = (typeof VOICE_DIRECTOR_PARAMETER_KEYS)[number];
export type VoiceDirectorStylePack = 'natural' | 'gyaru' | 'idol' | 'cool' | 'narrator' | 'android';
export type VoiceAgeBand = 'jc' | 'jk' | 'jd';
export type VoiceDialectStyle = 'standard' | 'kansai' | 'kanazawa';

export type VoiceDirectorRecipe = {
	summary: string;
	stylePack: VoiceDirectorStylePack;
	voiceAgeBand: VoiceAgeBand;
	dialectStyle: VoiceDialectStyle;
	dialectStrength: number;
	parameters: Record<VoiceDirectorParameter, number>;
	performanceCue: string;
	interpretation: string[];
	cautions: string[];
};

/** A per-message VoiceLab direction. It never mutates the character's saved voice. */
export type ChatVoiceDirection = {
	instruction: string;
	caption: string;
	summary: string;
	model?: string;
	/** How long the performance request remains active. Omitted values are legacy one-shot directions. */
	scope?: 'one-shot' | 'day';
	/** Keep the saved clone/LoRA identity and alter only this utterance's delivery. */
	preserveBaseVoice?: boolean;
	/** One-shot post-generation playback speed. Never mutates the saved voice. */
	speed?: number;
	/** Deterministic post-generation pitch shift in semitones. Never mutates the saved voice. */
	pitchShiftSemitones?: number;
	/** Change only time-stretch speed; do not alter wording, prosody prompt, or vocal character. */
	speedOnly?: boolean;
};

const VOICE_NOUN = /(?:声(?:色|質)?|ボイス|voice|トーン|口調|話し方)/iu;
const SPEAKING_REQUEST = /(?:発声|話して|喋って|しゃべって|読んで|読み上げ|言って|演じて|変えて|作る|作って|作り直して|作りなおして|再設計して|生成して|生成し直して|生成しなおして|試して|聞かせて|やってみて|してほしい|して欲しい|お願い)/iu;
const STYLE_LINK = /(?:みたいな|みたいに|のような|のように|っぽい|っぽく|風の|風に|感じの|感じで|調の|調で|キャラで|声で|声に|トーンで|口調で|話し方で)/iu;
const IMPLIED_VOICE_STYLE = /(?:妹|姉|お姉|弟|兄|お兄|少女|少年|幼女|女の子|男の子|女性|男性|大人|老人|キャラ|色気|セクシー|可愛|かわい|優し|甘|クール|落ち着|元気|明る|暗|高め|低め|囁|ささや|機械|ロボット|アンドロイド|ナレーター|アナウンサー|アイドル|ギャル|ツンデレ|無機質|早口|ゆっくり)/u;
const RESET_VOICE = /(?:いつもの|元の|普段の|通常の|デフォルトの)(?:声|ボイス|トーン|口調|話し方).{0,20}(?:戻|して|お願い)/iu;
const DELIVERY_STATUS_QUESTION = /(?:元気にして(?:る|います|た|ました)|疲れて(?:る|います)|眠そう(?:だ|です)|落ち着いて(?:る|います))(?:の|かな|かい|ですか)?[?？]?$/u;
const ONE_SHOT_DELIVERY_REQUEST = /(?:はっちゃけて(?:よ|ね|みて|ほしい|欲しい)?|テンション(?:を)?(?:上げて|下げて)(?:よ|ね|みて|ほしい|欲しい)?|(?:早口|ゆっくり|元気|明るく|勢いよく|ノリよく|落ち着いて|眠そうに|眠たげに|けだるそうに|疲れた感じで|震えた声で|動揺した感じで|興奮した感じで).{0,18}(?:話して|喋って|しゃべって|読んで|言って|演じて|して(?:よ|ね|みて|ほしい|欲しい)?))/u;
// In an active character conversation users naturally ask for a delivery change
// as a capability question ("もっとギャルっぽくできる？") without repeating
// "声で話して". Treat only an explicit style + transformation question as a
// one-turn performance request; ordinary questions about voice preferences stay
// outside this pattern.
const STYLE_CAPABILITY_REQUEST = /(?:もっと|もう少し|ちょっと|少し|やや|かなり)?\s*(?:妹|姉|お姉|弟|兄|お兄|少女|少年|幼女|女の子|男の子|女性|男性|大人|老人|アイドル|ギャル|ツンデレ|クール|可愛|かわい|優し|甘|元気|明る|暗|高め|低め|囁|ささや|機械|ロボット|アンドロイド|ナレーター|無機質|早口|ゆっくり)(?:っぽく|風に|みたいに|寄りに|な感じに|な感じで).{0,20}(?:できる|出来る|いける|してくれる|してもらえる|お願い)/u;
const SITUATION_VOICE_EXPERIMENT = /(?:(?:次の返事だけ).{0,40})?(?:声の)?演技実験|(?:次の返事だけ).{0,100}(?:状況|シチュエーション).{0,100}演じて/u;
const DAILY_DELIVERY_SCOPE = /(?:今日は|きょうは|本日は|今日一日(?:は)?|今日の間(?:は)?|今日はずっと)/u;
const DAILY_DELIVERY_REFERENCE = /(?:こんな|この|今の|さっきの)(?:感じ|調子|テンション|話し方|喋り方|しゃべり方|声)/u;
const DAILY_DELIVERY_RESET = /(?:今日は|きょうは|本日は)?.{0,12}(?:いつもの|普段の|普通の|元の)(?:声|話し方|喋り方|しゃべり方|調子|感じ)?(?:に戻して|にして|で話して|で喋って|でしゃべって|でいい)/u;
const SPEED_ONLY_DELIVERY_REQUEST = /(?:ちょっと|もう少し|少し|やや|もっと|かなり)?\s*(?:早口|早め|速め|テンポ(?:を)?速め)(?:に|で)?(?:して|話して|喋って|しゃべって|読んで|言って|する|がいい|でいい|にするだけ)?/u;
const EXPLICIT_SPEED_ONLY_REQUEST = /(?:(?:再生)?速度|話速|テンポ).{0,18}(?:だけ|のみ|[01](?:\.\d{1,2})?\s*倍)|(?:早口|早め|速め).{0,12}(?:だけ|のみ|でいい)|(?:口調|声質|テンション).{0,18}(?:変えず|変えない|そのまま).{0,24}(?:早口|早め|速め|速度)/u;
const NON_SPEED_DELIVERY_STYLE = /(?:テンション|興奮|元気|明るく|ギャル|アンドロイド|可愛|小悪魔|色気|眠|疲れ|震え|動揺|はっちゃけ)/u;
const NEGATED_DELIVERY_STYLE = /(?:テンション|興奮|元気|明るさ|ギャル感|アンドロイド感|可愛さ|小悪魔感|色気|眠気|疲れ|震え|動揺|はっちゃけ)(?:は|を|感は|て|さは)?(?:変えず|変えない|不要|なし|ない|なくて)/gu;
const BASE_VOICE_REDESIGN_REQUEST = /(?:(?:一から|ゼロから|新しい|別の).{0,30}(?:声|ボイス)|(?:声|ボイス).{0,30}(?:一から|ゼロから|作り直|再設計|新しく作)|(?:基本声|ベース声).{0,30}(?:作|設計|生成))/u;

/** A pure time-stretch request. It must not change generated wording or Irodori's voice caption. */
export function isSpeedOnlyDeliveryInstruction(value: string): boolean {
	const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
	if (!text || DELIVERY_STATUS_QUESTION.test(text)) return false;
	const hasSpeedRequest = SPEED_ONLY_DELIVERY_REQUEST.test(text) || EXPLICIT_SPEED_ONLY_REQUEST.test(text);
	if (!hasSpeedRequest) return false;
	if (EXPLICIT_SPEED_ONLY_REQUEST.test(text)) return true;
	const withoutNegatedStyles = text.replace(NEGATED_DELIVERY_STYLE, '');
	return !NON_SPEED_DELIVERY_STYLE.test(withoutNegatedStyles);
}

/** True when the user explicitly asks to keep a delivery style for the local calendar day. */
export function isDailyDeliveryInstruction(value: string): boolean {
	const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
	if (!text || !DAILY_DELIVERY_SCOPE.test(text) || DAILY_DELIVERY_RESET.test(text)) return false;
	if (DELIVERY_STATUS_QUESTION.test(text)) return false;
	return DAILY_DELIVERY_REFERENCE.test(text)
		|| isSpeedOnlyDeliveryInstruction(text)
		|| SPEED_ONLY_DELIVERY_REQUEST.test(text)
		|| ONE_SHOT_DELIVERY_REQUEST.test(text)
		|| /(?:話し方|喋り方|しゃべり方|テンション|調子).{0,18}(?:で|にして|続けて|維持して)/u.test(text);
}

/** Explicitly clears a saved day-scoped delivery without touching the base voice. */
export function isDailyDeliveryResetInstruction(value: string): boolean {
	return DAILY_DELIVERY_RESET.test(value.normalize('NFKC').replace(/\s+/g, ' ').trim());
}

/** Whether a day request refers to the last heard performance rather than spelling it out again. */
export function referencesRecentDelivery(value: string): boolean {
	return DAILY_DELIVERY_REFERENCE.test(value.normalize('NFKC').replace(/\s+/g, ' ').trim());
}

/** True for an ephemeral performance adjustment, not a new character voice. */
export function isOneShotDeliveryInstruction(value: string): boolean {
	const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
	if (!text || RESET_VOICE.test(text)) return false;
	if (BASE_VOICE_REDESIGN_REQUEST.test(text)) return false;
	if (DELIVERY_STATUS_QUESTION.test(text)) return false;
	if (isDailyDeliveryInstruction(text)) return false;
	return SITUATION_VOICE_EXPERIMENT.test(text)
		|| isSpeedOnlyDeliveryInstruction(text)
		|| ONE_SHOT_DELIVERY_REQUEST.test(text)
		|| STYLE_CAPABILITY_REQUEST.test(text);
}

/** Extract an exact quoted audition line such as: 返事は「ありがとう」だけ. */
export function extractExactSpokenLine(value: string): string | null {
	const text = value.normalize('NFKC');
	const match = text.match(/(?:返事|セリフ|台詞|読み上げる(?:セリフ|台詞)?)(?:は|を|:|：)?[^「」『』\r\n]{0,40}[「『]([^」』\r\n]{1,80})[」』](?:だけ|のみ)/u);
	return match?.[1]?.trim() || null;
}

/** Reduce a verbose situation prompt to cues that Irodori can express acoustically. */
function situationPerformanceCues(value: string): string[] {
	const text = value.normalize('NFKC');
	const cues: string[] = [];
	const add = (cue: string): void => {
		if (!cues.includes(cue)) cues.push(cue);
	};

	if (/(?:寝起き|眠い|眠く|眠そう|眠た)/u.test(text)) {
		add('強い眠気。低いエネルギー。柔らかく少し息混じり。ゆっくり。語尾は弱く落とす');
	}
	if (/(?:疲れ|疲労|限界|へとへと|ぐったり)/u.test(text)) {
		add('強い疲労。声に力がなく弱い。呼吸を浅くし、ゆっくり話す');
	}
	if (/(?:久しぶり|再会|帰ってき|会えな)/u.test(text)) {
		add('最初に息をのみ、驚きから温かい安堵と喜びへ変化する。感情が込み上げて声がわずかに震える');
	}
	if (/(?:安心|安堵|救われ|ほっと)/u.test(text)) {
		add('張り詰めた力が抜ける。温かい安堵を声にはっきり出す');
	}
	if (/(?:驚き|驚いた|びっくり|突然)/u.test(text)) {
		add('反応の速い明確な驚き。声が一瞬跳ね上がる');
	}
	if (/(?:嬉し|喜び|喜ん)/u.test(text)) {
		add('明るい喜び。声を軽く弾ませる');
	}
	if (/(?:悲し|寂し|つらい|切ない)/u.test(text)) {
		add('抑えた悲しみ。声を細く弱め、語尾を落とす');
	}
	if (/(?:泣き|涙|泣い)/u.test(text)) {
		add('涙をこらえた震えを少しだけ含める。泣き声や嗚咽は足さない');
	}
	if (/(?:怒り|怒った|腹が立|苛立)/u.test(text)) {
		add('抑えた怒り。声に張りと緊張を加え、短く強く発音する');
	}
	if (/(?:緊張|不安|怖い|怯え)/u.test(text)) {
		add('緊張で息が浅い。声に小さな震えを加える');
	}
	if (/(?:焦り|焦って|慌て|急い)/u.test(text)) {
		add('焦り。テンポを速め、息継ぎを短くする');
	}
	if (/(?:照れ|恥ずかし)/u.test(text)) {
		add('照れ。声を少し柔らかく小さくし、語尾を控えめにする');
	}
	if (/(?:興奮|はっちゃけ|ハイテンション)/u.test(text)) {
		add('高い興奮。明るく勢いよく、速い反応で話す');
	}
	if (/(?:ギャル|ギャルっぽ)/u.test(text)) {
		add('明るく軽快なギャル風の会話。テンポよくリズミカルに話し、語尾を軽く弾ませる。低い胸声や大人びた重さは加えない');
	}
	if (/(?:妹|妹っぽ|かわい|可愛)/u.test(text)) {
		add('親しみやすく軽い可愛さ。高めで明瞭に、過度な幼児声にはしない');
	}
	if (/(?:落ち着|冷静)/u.test(text)) {
		add('落ち着いた低いエネルギー。一定のテンポで滑らかに話す');
	}
	if (/(?:囁|ささや)/u.test(text)) {
		add('近い距離の小さな声。息を多めにして優しく話す');
	}

	return cues.slice(0, 3);
}

/** A conservative speed nudge that complements (but does not replace) Irodori prosody. */
export function inferOneShotDeliverySpeed(value: string): number {
	const text = value.normalize('NFKC');
	const explicitMultiplier = text.match(/(?:再生)?速度(?:だけ|のみ)?(?:を)?\s*(0\.\d{1,2}|1(?:\.\d{1,2})?)\s*倍/u)?.[1];
	if (explicitMultiplier) return Math.min(1.35, Math.max(0.75, Number(explicitMultiplier)));
	if (/(?:もっと|かなり).{0,8}(?:早口|早め|速め|テンポ)/u.test(text)) return 1.24;
	if (/(?:ちょっと|もう少し|少し|やや).{0,8}(?:早口|早め|速め|テンポ)/u.test(text)) return 1.16;
	if (/(?:早口|早め|速め|テンポ(?:を)?速め)/u.test(text)) return 1.18;
	if (/(?:はっちゃけ|テンション(?:を)?上げ|早口|勢いよく|ノリよく|元気|明るく|興奮)/u.test(text)) return 1.12;
	if (/(?:ギャル|ギャルっぽ)/u.test(text)) return 1.1;
	if (/(?:テンション(?:を)?下げ|ゆっくり|落ち着|眠そう|眠たげ|けだる|疲れ)/u.test(text)) return 0.92;
	return 1;
}

/** Make broad situation contrasts audible even when caption conditioning is subtle. */
export function inferOneShotPitchShiftSemitones(value: string): number {
	const text = value.normalize('NFKC');
	if (/(?:かなり|もっと).{0,8}(?:低い声|声を低く|低め)/u.test(text)) return -3.5;
	if (/(?:低い声|声を低く|低め)/u.test(text)) return -2.5;
	if (/(?:かなり|もっと).{0,8}(?:高い声|声を高く|高め)/u.test(text)) return 3.5;
	if (/(?:高い声|声を高く|高め)/u.test(text)) return 2.5;
	if (/(?:怒り|怒って|腹が立|苛立)/u.test(text)) return -2.5;
	if (/(?:寝起き|眠い|眠く|眠そう|眠た)/u.test(text)) return -1.25;
	if (/(?:悲し|寂し|つらい|切ない|疲れ|疲労|限界)/u.test(text)) return -1;
	if (/(?:驚き|驚いた|びっくり|突然)/u.test(text)) return 2;
	// Excitement should come from prosody and tempo, not a global pitch shifter.
	// Even a small automatic shift can add chorus/metallic residue to a clean clone.
	if (/(?:嬉し|喜び|喜ん|興奮|はっちゃけ|ハイテンション)/u.test(text)) return 0;
	return 0;
}

/**
 * Detect only explicit performance requests. Questions merely discussing a voice
 * (for example, "どんな声が好き？") intentionally do not match.
 */
export function detectChatVoiceInstruction(value: string): string | null {
	const text = Array.from(value.normalize('NFKC').replace(/\s+/g, ' ').trim()).slice(0, 500).join('');
	if (!text || RESET_VOICE.test(text)) return null;
	if (isDailyDeliveryResetInstruction(text)) return null;
	if (isDailyDeliveryInstruction(text)) return text;
	if (isOneShotDeliveryInstruction(text)) return text;
	if (!SPEAKING_REQUEST.test(text)) return null;
	const hasVoiceNoun = VOICE_NOUN.test(text);
	const hasStyle = IMPLIED_VOICE_STYLE.test(text);
	const hasStyleLink = STYLE_LINK.test(text);
	// Natural requests often omit the word "voice": e.g. "妹キャラで言って".
	// Require both a performance style and a linking expression in that case so
	// ordinary requests such as "今日の予定を話して" are not misclassified.
	if (!hasVoiceNoun && !(hasStyle && hasStyleLink)) return null;
	if (hasVoiceNoun && !hasStyleLink && !hasStyle) {
		return null;
	}
	return text;
}

function clampParameter(value: unknown): number {
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50;
}

function cleanText(value: unknown, max: number): string {
	return typeof value === 'string'
		? Array.from(value.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()).slice(0, max).join('')
		: '';
}

function level(value: number, low: string, middle: string, high: string): string {
	return value >= 68 ? high : value <= 32 ? low : middle;
}

function styleDescription(style: VoiceDirectorStylePack): string {
	return {
		natural: '自然な会話声',
		gyaru: '明るくリズミカルなギャル系の発声',
		idol: '明るく整った、聞き取りやすいアイドル系の発声',
		cool: '抑制があり、芯の通ったクールな会話声',
		narrator: '情報を明瞭に届ける、安定したナレーション発声',
		android: '均整の取れたタイミングを持つ、無機質寄りのアンドロイド発声',
	}[style];
}

function ageDescription(age: VoiceAgeBand): string {
	return {
		jc: '中学生年代を想定した若い声域',
		jk: '高校生年代を想定した若く自然な声域',
		jd: '大学生年代を想定した少し大人びた声域',
	}[age];
}

/** Convert the same Voice Director recipe used by VoiceLab into an Irodori caption. */
export function buildChatVoiceCaption(
	baseCaption: string,
	recipe: VoiceDirectorRecipe,
	instruction: string,
): string {
	const parameters = Object.fromEntries(
		VOICE_DIRECTOR_PARAMETER_KEYS.map((key) => [key, clampParameter(recipe.parameters?.[key])]),
	) as Record<VoiceDirectorParameter, number>;
	const base = cleanText(baseCaption, 1000);
	const summary = cleanText(recipe.summary, 240) || cleanText(instruction, 300);
	const performanceCue = cleanText(recipe.performanceCue, 300);

	return [
		base ? `BASE VOICE IDENTITY (preserve recognizability): ${base}` : '',
		`THIS UTTERANCE ONLY: ${styleDescription(recipe.stylePack)}。${ageDescription(recipe.voiceAgeBand)}。`,
		`VOICE DIRECTOR: ${summary}`,
		[
			`声の高さは${level(parameters.basePitch, '低め', '中程度', '高め')}`,
			`話速は${level(parameters.tempo, 'ゆっくり', '自然', '速め')}`,
			`勢いは${level(parameters.energy, '控えめ', '自然', '強め')}`,
			`明るさは${level(parameters.brightness, '暗め', '自然', '明るめ')}`,
			`声の太さは${level(parameters.body, '細め', '中程度', '太め')}`,
			`抑揚は${level(parameters.pitchVariation, '小さく', '自然に', '大きく')}`,
		].join('。') + '。',
		`息感 ${parameters.breathiness}/100、鼻声 ${parameters.nasality}/100、滑舌 ${parameters.articulation}/100。`,
		performanceCue ? `PERFORMANCE: ${performanceCue}` : '',
		'入力されたセリフの内容は変えず、文章にない笑い声、フィラー、掛け声、余分な言葉を追加しない。',
	].filter(Boolean).join('\n').slice(0, 2000);
}

function fallbackVoiceIdentityConstraints(instruction: string): string[] {
	const normalized = cleanText(instruction, 500).normalize('NFKC');
	const requestsGyaru = /(?:ギャル|ぎゃる)/u.test(normalized);
	const requestsAdultFemale = /(?:お姉さん|姉御|役割:\s*姉(?:[。\s]|$)|大人の女性|成人女性)/u.test(normalized);
	const requestsFemale = requestsAdultFemale
		|| /(?:女性|女声|女性らし|少女|女の子|妹|ギャル|ぎゃる|アイドル|可愛|かわい)/u.test(normalized);
	const requestsMale = !requestsFemale && /(?:男性|男声|少年|お兄さん|兄貴)/u.test(normalized);
	const requestsElegantSensuality = /(?:色気|セクシー|艶|艶っぽ)/u.test(normalized);
	const constraints: string[] = [];

	if (requestsGyaru) {
		constraints.push('VOICE IDENTITY — HIGHEST PRIORITY: 明確な日本語の若い女性声。成熟したお姉さん声、男性声、少年声、低い胸声、太く重い声へ変化させない。');
		constraints.push('GYARU DELIVERY — REQUIRED: 声を少し高めで明るくし、響きを口元の前方へ置く。軽く細い声質、速めの会話テンポ、歯切れのよい子音、弾む抑揚、軽く上向きの語尾で、現代的で親しみやすいギャル感を明確に出す。色っぽい溜め、低く落とす語尾、ゆっくりしたお姉さん演技は避ける。');
		constraints.push('DRY CLEAN VOCAL — REQUIRED: 一人の声だけを中央で近く明瞭に録った自然な生声。エコー、リバーブ、コーラス、二重声、ダブリング、フランジャー、位相揺れ、金属的共鳴、ロボット加工を一切加えない。');
	} else if (requestsAdultFemale) {
		constraints.push('VOICE IDENTITY — REQUIRED: 明確な日本語の成人女性声。自然なお姉さんの声域と共鳴を使い、男性声、少年声、低すぎる胸声、幼すぎる少女声へ変化させない。');
	} else if (requestsFemale) {
		constraints.push('VOICE IDENTITY — REQUIRED: 明確な日本語の女性声。男性声、少年声、低すぎる胸声へ変化させない。');
	} else if (requestsMale) {
		constraints.push('VOICE IDENTITY — REQUIRED: 明確な日本語の男性声。女性声へ変化させない。');
	}

	if (requestsElegantSensuality) {
		constraints.push('色気は上品で自然な声の艶として表現する。過度な吐息、囁き、媚び、誘惑的な演技、喘ぎ声を避け、日常会話として聞ける発声にする。');
	}
	if (/男っぽ/u.test(normalized)) {
		constraints.push('NEGATIVE CORRECTION: ユーザー文中の「男っぽい」は現在の問題点であり、目標の声ではない。男性的な低さ、太さ、胸声、重い共鳴を取り除く。');
	}

	return constraints;
}

export function buildVoiceAuditionLine(characterName: string, exactLine?: string | null, instruction = ''): string {
	const requestedLine = cleanText(exactLine ?? '', 160);
	if (requestedLine) return requestedLine;
	const name = cleanText(characterName, 40) || 'キャラクター';
	if (/(?:ギャル|ぎゃる)/u.test(instruction.normalize('NFKC'))) {
		return `${name}だよ。おはよ！ 今日も楽しくいこっ！`;
	}
	return `${name}です。おはよう。今日もよろしくね。`;
}

export function buildFallbackChatVoiceCaption(baseCaption: string, instruction: string): string {
	const explicitlyRequestsMechanicalAudio = /(?:アンドロイド|ロボット|機械)(?:声|ボイス|音声|っぽい声)|(?:声|ボイス|音声).{0,12}(?:アンドロイド|ロボット|機械)|(?:エコー|コーラス|リバーブ|電子音|音声エフェクト)/u
		.test(instruction.normalize('NFKC'));
	return [
		...fallbackVoiceIdentityConstraints(`${instruction}\n${baseCaption}`),
		`LOCAL VOICE DESIGN — HIGHEST PRIORITY: ${cleanText(instruction, 500)}`,
		!explicitlyRequestsMechanicalAudio
			? 'AUDIO CLEANLINESS — REQUIRED: 加工感のない単独のドライな生声。エコー、残響、コーラス、二重声、位相揺れ、金属音を加えない。'
			: '',
		cleanText(baseCaption, 1000) ? `CHARACTER CONTEXT (外見・役割の参考情報のみ。アンドロイド、ロボット、機械などの外見語を音声エフェクトへ変換しない。指示と競合する場合は上の指示を優先): ${cleanText(baseCaption, 1000)}` : '',
		'指定された年齢感、声の高さ、声質、テンポ、息感、抑揚を明確に反映して新しい声を設計する。入力されたセリフの内容は変えない。文章にない笑い声、フィラー、掛け声、余分な言葉を追加しない。',
	].filter(Boolean).join('\n').slice(0, 2000);
}

/** Build a clone-safe performance caption that never redesigns speaker identity. */
export function buildOneShotDeliveryCaption(instruction: string): string {
	if (SITUATION_VOICE_EXPERIMENT.test(instruction.normalize('NFKC'))) {
		const cues = situationPerformanceCues(instruction);
		const fallback = cleanText(
			instruction
				.replace(/(?:返事|セリフ|台詞)(?:は|を|:|：)?[^。！？\r\n]{0,100}[。！？]?/gu, '')
				.replace(/(?:余計な言葉|説明|状況文)[^。！？\r\n]{0,100}[。！？]?/gu, ''),
			180,
		);
		return [
			'SITUATION PERFORMANCE — STRONG EMOTION.',
			'保存済み話者の声質と年齢感は保つ。',
			`演技: ${cues.join('。') || fallback || '指定された感情を声に明確に出す'}。`,
			'感情は最初の音から明確に出す。セリフ以外の声や言葉は追加しない。',
		].join('\n').slice(0, 700);
	}
	const cues = situationPerformanceCues(instruction);
	return [
		'THIS UTTERANCE ONLY — PERFORMANCE OVERRIDE.',
		'Preserve the exact speaker identity, age, vocal timbre, and recognizability of the saved reference voice.',
		`DELIVERY: ${cleanText(instruction, 500)}`,
		...(cues.length > 0 ? [`ACOUSTIC CUES: ${cues.join('。')}。`] : []),
		'Change only energy, tempo, rhythm, pauses, and emotional delivery for this utterance. Do not redesign the voice.',
		'入力されたセリフの内容は変えず、文章にない笑い声、フィラー、掛け声、余分な言葉を追加しない。',
	].join('\n').slice(0, 2000);
}

/** Build the reusable per-utterance caption for a local-calendar-day performance mode. */
export function buildDailyDeliveryCaption(instruction: string): string {
	return [
		"TODAY'S CHAT SESSION — REUSABLE PERFORMANCE DIRECTION.",
		'Preserve the exact speaker identity, age, vocal timbre, and recognizability of the saved reference voice.',
		`DELIVERY: ${cleanText(instruction, 500)}`,
		'Apply this delivery consistently to the current utterance. Change only energy, tempo, rhythm, pauses, and emotion. Do not redesign the voice.',
		'入力されたセリフの内容は変えず、文章にない掛け声、フィラー、笑い声、余分な言葉を追加しない。',
	].join('\n').slice(0, 2000);
}

export function normalizeChatVoiceDirection(value: unknown): ChatVoiceDirection | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const item = value as Partial<ChatVoiceDirection>;
	const instruction = cleanText(item.instruction, 500);
	const caption = cleanText(item.caption, 2000);
	const summary = cleanText(item.summary, 240);
	const model = cleanText(item.model, 120);
	const speedValue = Number(item.speed);
	const speed = Number.isFinite(speedValue) ? Math.min(1.35, Math.max(0.75, speedValue)) : undefined;
	const pitchValue = Number(item.pitchShiftSemitones);
	const pitchShiftSemitones = Number.isFinite(pitchValue)
		? Math.min(6, Math.max(-6, pitchValue))
		: undefined;
	const speedOnly = item.speedOnly === true && item.preserveBaseVoice === true && speed !== undefined;
	if (!instruction || !summary || (!caption && !speedOnly)) return undefined;
	return {
		instruction,
		caption,
		summary,
		...(model ? { model } : {}),
		...(item.scope === 'day' || item.scope === 'one-shot' ? { scope: item.scope } : {}),
		...(item.preserveBaseVoice === true ? { preserveBaseVoice: true } : {}),
		...(speed !== undefined ? { speed } : {}),
		...(pitchShiftSemitones !== undefined ? { pitchShiftSemitones } : {}),
		...(speedOnly ? { speedOnly: true } : {}),
	};
}
