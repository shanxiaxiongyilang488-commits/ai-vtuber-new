import { error, json } from '@sveltejs/kit';
import { chatOpenAIWithModel, OPENAI_DEFAULT_MODEL } from '$lib/providers/openai';
import { readSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

type VoiceAgeBand = 'jc' | 'jk' | 'jd';
type PersonaKind = 'honors' | 'neutral' | 'spontaneous';
type GyaruEra = 'modern' | '90s';
type DialogueDraft = {
  displayText: string;
  speechText: string;
  performanceCue: string;
};

function cleanInput(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? Array.from(value.trim()).slice(0, maxLength).join('')
    : '';
}

function parseChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}

function cleanDialogue(value: string): string {
  const line = value
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^(?:セリフ|台詞|発話|回答)\s*[:：]\s*/u, '')
    .replace(/^「|」$/gu, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return Array.from(line).slice(0, 180).join('');
}

function displayTextToSpeech(value: string): string {
  return cleanDialogue(value)
    .replace(/[（(](?:ｗ+|w+|笑+|爆)[）)]/giu, '……')
    .replace(/(?:←|→)?(?:ｗ+|w+|笑+)/giu, '……')
    .replace(/[←→]+/gu, '')
    .replace(/[☆★♡♥]+/gu, '')
    .replace(/\.{3,}/g, '……')
    .replace(/\s*……\s*/g, '……')
    .replace(/……{2,}/g, '……')
    .trim();
}

function cleanPerformanceCue(value: unknown): string {
  return typeof value === 'string'
    ? Array.from(value.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()).slice(0, 240).join('')
    : '';
}

function parseDialogueDraft(raw: string): DialogueDraft | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
      const displayText = cleanDialogue(String(parsed.displayText ?? ''));
      const suppliedSpeech = cleanDialogue(String(parsed.speechText ?? ''));
      const speechText = displayTextToSpeech(suppliedSpeech || displayText);
      const performanceCue = cleanPerformanceCue(parsed.performanceCue);
      if (displayText && speechText) {
        return {
          displayText,
          speechText,
          performanceCue: performanceCue || '冒頭を軽く跳ね、自己ツッコミの前で短く間を置き、語尾は伸ばして少し落とす。',
        };
      }
    } catch {
      // Fall through to the legacy one-line response parser.
    }
  }

  const displayText = cleanDialogue(stripped);
  const speechText = displayTextToSpeech(displayText);
  if (!displayText || !speechText) return null;
  return {
    displayText,
    speechText,
    performanceCue: '冒頭を軽く跳ね、自己ツッコミの前で短く間を置き、語尾は伸ばして少し落とす。',
  };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const characterName = cleanInput(body.characterName, 60) || 'ギャル系AI VTuber';
  const characterRole = cleanInput(body.characterRole, 120);
  const instruction = cleanInput(body.instruction, 500);
  const voiceCaption = cleanInput(body.voiceCaption, 1000);
  const voiceAgeBand = parseChoice(body.voiceAgeBand, ['jc', 'jk', 'jd'] as const, 'jk');
  const personaKind = parseChoice(
    body.personaKind,
    ['honors', 'neutral', 'spontaneous'] as const,
    'neutral',
  );
  const era = parseChoice(body.era, ['modern', '90s'] as const, 'modern');
  const rawCharaLevel = Number(body.charaLevel);
  const charaLevel = Number.isFinite(rawCharaLevel)
    ? Math.max(0, Math.min(100, Math.round(rawCharaLevel)))
    : 58;
  const rawKogyaruPerformance = Number(body.kogyaruPerformance);
  const kogyaruPerformance = Number.isFinite(rawKogyaruPerformance)
    ? Math.max(0, Math.min(100, Math.round(rawKogyaruPerformance)))
    : (era === '90s' ? 78 : 0);
  const rawTension = Number(body.tension);
  const tension = Number.isFinite(rawTension)
    ? Math.max(0, Math.min(100, Math.round(rawTension)))
    : 68;
  const rawFamiliarity = Number(body.familiarity);
  const familiarity = Number.isFinite(rawFamiliarity)
    ? Math.max(0, Math.min(100, Math.round(rawFamiliarity)))
    : 68;

  const ageDescription: Record<VoiceAgeBand, string> = {
    jc: '女子中学生年代。年齢相応の日常的で健全な内容',
    jk: '女子高校生年代。友達へ自然に話す内容',
    jd: '女子大学生年代。学生らしい軽い日常会話',
  };
  const personaDescription: Record<PersonaKind, string> = {
    honors: '優等生ギャル。語彙は自然で筋道が通り、明るいが落ち着きもある',
    neutral: '親しみやすいギャル。自然な会話調',
    spontaneous: 'おバカで直感的なギャル。リアクションは大きいが意味は通じる',
  };
  const attitudeDescription = charaLevel >= 72
    ? '可愛いアイドル系ではなく、少し気だるくチャラいストリート系。短い間、崩した口語、語尾の上げ下げを使う'
    : charaLevel <= 35
      ? '親しみやすく可愛いギャル。明るく素直だが、幼いアニメ調にはしない'
      : '可愛さとチャラさが半々の自然なギャル会話';
  const performanceDescription = era === '90s' && kogyaruPerformance >= 35
    ? [
        `90sコギャル発話シーケンス ${kogyaruPerformance}/100。`,
        'セリフを「気だるい短い入り、中央の強調語、伸ばすか切る語尾」の三つの句で構成し、読点で区切る。',
        '中央の句は加速して読みやすい短さにする。',
        '当時の語彙は一語まで自然に使ってよいが、チョベリバなど有名語の毎回使用や時代語の羅列は禁止。',
        '文章にない笑い声、えー・あのー等のフィラー、最後の余計な掛け声は追加しない。',
      ].join('')
    : '自然な現代会話として、一文内の句を増やしすぎない。';
  const tensionDescription = tension >= 85
    ? 'テンション爆上げ。冒頭の「ねぇねぇ！」を高く強く畳みかけ、相手の返答を待たずに食い気味で続ける。強引だが楽しそうに誘い、整ったアイドル口調ではなく距離感の近いチャラい会話にする。'
    : tension >= 60
      ? 'テンションは高め。反応を速くし、強調語でピッチが跳ねる短い文にする。'
      : 'テンションは控えめ。反応を急がず、間を取る落ち着いた文にする。';
  const familiarityDescription = familiarity >= 85
    ? '妙に馴れ馴れしくする。初対面でも昔からの友達扱いし、「ねぇ」「てかさ」、相手の名前、勝手な同意、軽い品評を差し込み、返答を待たず会話へ巻き込む。意地悪や威圧ではなく、陽気だが少し鼻につく距離感にする。'
    : familiarity >= 60
      ? '親しい友達の距離感にし、呼びかけと相づちを自然に増やす。'
      : '相手との距離を保ち、決めつけや割り込みを控える。';

  const settings = await readSettings();
  if (!settings.openai.key) throw error(500, 'OpenAI API key 未設定');

  const systemPrompt = [
    'あなたはAI VTuberが実際に発話する短い日本語セリフを書く脚本家です。',
    'ユーザーは条件だけを指定します。具体的なセリフの内容はあなたが毎回新しく考えてください。',
    '出力は発話するセリフ本文1本だけ。説明、候補一覧、話者名、引用符、Markdownを付けません。',
    '長さは原則35〜70文字、1〜2文。音声比較に使えるよう、極端に短い文や同じ母音・語尾の反復を避けます。',
    '絵文字、顔文字、括弧書き、ト書き、笑い声、咳、息、無意味なフィラーを追加しません。',
    '「！」「？」は合計2個まで。「〜」の連続や過剰な小文字表記を避けます。',
    '方言はユーザーが明示した場合だけ使い、指定された地域以外の方言を混ぜません。',
    '音声の声齢・声質を安定させるため、過度な叫び、ささやき、泣き声、長い母音伸ばしを避けます。',
    '未成年年代では、年齢相応で健全な日常会話だけを書きます。',
  ].join('\n');
  const dialogueOutputContract = [
    '出力は必ずJSONオブジェクト1個だけにしてください。Markdownコードフェンスや説明文は禁止です。',
    '{"displayText":"配信画面へ表示するセリフ","speechText":"TTSが読み上げるセリフ","performanceCue":"声の演技指示"}',
    'displayTextは「てゆうかさぁ←ｗ」のようなチャットギャル的な自己ツッコミ、脱線、後付け笑いを自然に使えます。',
    familiarity >= 85
      ? 'displayTextとspeechTextには、直接の呼びかけ、勝手な同意、軽い品評、返答を待たない誘いのうち最低2つを自然に入れてください。相手を侮辱したり怖がらせたりはしません。'
      : '馴れ馴れしさは指定された心理的距離に合わせてください。',
    'ただし記号を毎回使わず、←ｗ、（笑）、ｗのいずれかは最大1回だけにしてください。',
    'speechTextはdisplayTextと同じ意味にし、←ｗ、矢印、ｗ、（笑）、絵文字など読み上げ不要の表記を除去してください。',
    'speechTextでは自己ツッコミ位置を「……」へ変換し、読点と長音で、跳ね・短い間・母音伸ばし・現在のテンションに合う語尾処理が伝わる自然な日本語にしてください。',
    tension >= 85
      ? 'performanceCueは一文で、冒頭を高く畳みかける位置、加速する位置、最後の語尾を上げるか短く切って次へ押す位置を具体的に書いてください。語尾を落ち着いて下げないでください。'
      : 'performanceCueは一文で、どこを跳ねるか、どこで間を置くか、どの語尾を伸ばして落とすかを具体的に書いてください。',
    '表示文と発話文は35〜90文字程度にし、極端な叫び、フィラーの連発、同じ語尾の反復は避けてください。',
  ].join('\n');

  const userMessage = [
    `キャラクター名: ${characterName}`,
    `役割: ${characterRole || '指定なし'}`,
    `声齢: ${ageDescription[voiceAgeBand]}`,
    `演技: ${personaDescription[personaKind]}`,
    `態度: CUTE-CHARA ${charaLevel}/100。${attitudeDescription}`,
    `テンション: ${tension}/100。${tensionDescription}`,
    `心理的距離: ${familiarity}/100。${familiarityDescription}`,
    `90s発話構造: ${performanceDescription}`,
    `時代感: ${era === '90s' ? '1990年代後半のコギャル風' : '現代のギャル風'}`,
    `声・話し方の参考: ${voiceCaption || '明るく若々しい自然なギャル声'}`,
    `ユーザーからの任意指示: ${instruction || 'なし。日常の小さな出来事を自分で選ぶ'}`,
    '上記を踏まえ、音声テストにも実際の配信にも使える自然なセリフを1本だけ作成してください。',
  ].join('\n');

  try {
    const primaryModel = settings.openai.model || OPENAI_DEFAULT_MODEL;
    const requestDialogue = (model: string, maxTokens: number, retry = false) => (
      chatOpenAIWithModel({
        apiKey: settings.openai.key,
        model,
        systemPrompt: retry
          ? `${systemPrompt}\n${dialogueOutputContract}\n前回は有効なJSONが得られませんでした。今回は必ず指定された3フィールドを持つJSONだけを出力してください。`
          : `${systemPrompt}\n${dialogueOutputContract}`,
        userMessage,
        // reasoningモデルでは内部処理も出力枠を使い得るため、短文でも十分な余裕を持たせる。
        maxTokens,
      })
    );

    let result = await requestDialogue(primaryModel, 1024);
    let draft = parseDialogueDraft(result.text);
    let retried = false;

    if (!draft) {
      retried = true;
      const retryModel = primaryModel === OPENAI_DEFAULT_MODEL
        ? primaryModel
        : OPENAI_DEFAULT_MODEL;
      result = await requestDialogue(retryModel, 1536, true);
      draft = parseDialogueDraft(result.text);
    }

    if (!draft) throw new Error('有効なセリフ構造が返されませんでした');
    return json({
      ...draft,
      // Keep the former field for callers that have not migrated yet.
      text: draft.speechText,
      model: result.model,
      retried,
    });
  } catch (caught) {
    throw error(502, caught instanceof Error ? caught.message : 'セリフ生成に失敗しました');
  }
};
