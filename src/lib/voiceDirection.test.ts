import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildChatVoiceCaption,
	buildDailyDeliveryCaption,
	buildFallbackChatVoiceCaption,
	buildVoiceAuditionLine,
	buildOneShotDeliveryCaption,
	detectChatVoiceInstruction,
	extractExactSpokenLine,
	inferOneShotDeliverySpeed,
	inferOneShotPitchShiftSemitones,
	isDailyDeliveryInstruction,
	isDailyDeliveryResetInstruction,
	isOneShotDeliveryInstruction,
	isSpeedOnlyDeliveryInstruction,
	normalizeChatVoiceDirection,
	referencesRecentDelivery,
	type VoiceDirectorRecipe,
} from './voiceDirection.ts';

test('detects an explicit VoiceLab-style speaking request', () => {
	assert.equal(
		detectChatVoiceInstruction('優しいお姉さんみたいな声で発声してほしい'),
		'優しいお姉さんみたいな声で発声してほしい',
	);
	assert.equal(detectChatVoiceInstruction('ロボットっぽい声で話して'), 'ロボットっぽい声で話して');
	assert.equal(
		detectChatVoiceInstruction('おはよう、シロ。ちょっと可愛い妹系キャラで「るーつさん」と言って欲しいんだけど'),
		'おはよう、シロ。ちょっと可愛い妹系キャラで「るーつさん」と言って欲しいんだけど',
	);
	assert.equal(
		detectChatVoiceInstruction('よし、次はお姉さんみたいに色気っぽく「るーつさん。おはようございます」と言ってごらん'),
		'よし、次はお姉さんみたいに色気っぽく「るーつさん。おはようございます」と言ってごらん',
	);
	assert.equal(detectChatVoiceInstruction('明るいギャル声を試して'), '明るいギャル声を試して');
});

test('does not treat ordinary discussion about voices as a direction', () => {
	assert.equal(detectChatVoiceInstruction('どんな声が好き？'), null);
	assert.equal(detectChatVoiceInstruction('いつもの声に戻して'), null);
	assert.equal(detectChatVoiceInstruction('今日の予定を話して'), null);
	assert.equal(detectChatVoiceInstruction('可愛い服で今日の予定を話して'), null);
	assert.equal(detectChatVoiceInstruction('妹キャラの設定について話して'), null);
});

test('detects a natural one-shot delivery request without changing the base voice', () => {
	const instruction = 'シロ、寝起きですか。もっとはっちゃけてよ';
	assert.equal(detectChatVoiceInstruction(instruction), instruction);
	assert.equal(isOneShotDeliveryInstruction(instruction), true);
	assert.equal(inferOneShotDeliverySpeed(instruction), 1.12);
	assert.equal(inferOneShotPitchShiftSemitones('興奮気味の早口ギャルで話して'), 0);
	assert.match(buildOneShotDeliveryCaption(instruction), /Preserve the exact speaker identity/);
	assert.equal(detectChatVoiceInstruction('今日は元気にしてる？'), null);
	assert.equal(detectChatVoiceInstruction('はっちゃけたギャルってどう思う？'), null);
	assert.equal(detectChatVoiceInstruction('今日は疲れた'), null);
});

test('detects and clears a local-day delivery request', () => {
	const explicit = '今日はもっとはっちゃけて話して';
	const referenced = '今日はこんな喋り方でいこう';
	assert.equal(detectChatVoiceInstruction(explicit), explicit);
	assert.equal(isDailyDeliveryInstruction(explicit), true);
	assert.equal(isOneShotDeliveryInstruction(explicit), false);
	assert.equal(detectChatVoiceInstruction(referenced), referenced);
	assert.equal(isDailyDeliveryInstruction(referenced), true);
	assert.equal(referencesRecentDelivery(referenced), true);
	assert.match(buildDailyDeliveryCaption(explicit), /TODAY'S CHAT SESSION/);
	assert.equal(isDailyDeliveryResetInstruction('今日はいつもの話し方に戻して'), true);
	assert.equal(detectChatVoiceInstruction('今日はいつもの話し方に戻して'), null);
});

test('treats a slight faster request as time-stretch only', () => {
	const instruction = '口調は変えず、ちょっと早口にするだけでいい';
	assert.equal(detectChatVoiceInstruction(instruction), instruction);
	assert.equal(isSpeedOnlyDeliveryInstruction(instruction), true);
	assert.equal(inferOneShotDeliverySpeed(instruction), 1.16);
	assert.equal(isSpeedOnlyDeliveryInstruction('もっとハイテンションで早口にして'), false);
	assert.equal(isSpeedOnlyDeliveryInstruction('まだはっちゃけてないな。今日は少し早口で話して'), true);
	assert.equal(isSpeedOnlyDeliveryInstruction('口調は変えず、今日は再生速度だけ1.2倍にして'), true);
	assert.equal(inferOneShotDeliverySpeed('今日は再生速度だけ1.2倍にして'), 1.2);
	assert.deepEqual(normalizeChatVoiceDirection({
		instruction,
		caption: '',
		summary: '速度だけ変更',
		model: 'local-time-stretch',
		scope: 'day',
		preserveBaseVoice: true,
		speed: 1.16,
		speedOnly: true,
	}), {
		instruction,
		caption: '',
		summary: '速度だけ変更',
		model: 'local-time-stretch',
		scope: 'day',
		preserveBaseVoice: true,
		speed: 1.16,
		speedOnly: true,
	});
});

test('recognizes a natural style capability question as a one-shot voice change', () => {
	const instruction = 'もっとギャルっぽくできる？';
	assert.equal(detectChatVoiceInstruction(instruction), 'もっとギャルっぽくできる?');
	assert.equal(isOneShotDeliveryInstruction(instruction), true);
	assert.equal(inferOneShotDeliverySpeed(instruction), 1.1);
	assert.match(buildOneShotDeliveryCaption(instruction), /明るく軽快なギャル風の会話/u);
	assert.match(buildOneShotDeliveryCaption(instruction), /Preserve the exact speaker identity/u);
});

test('treats an explicitly new fast base voice as redesign rather than time stretch', () => {
	const instruction = 'ミケ、一から新しい基本声として、生成時からテンポの速いギャル声を作って。再生速度加工は使わないで。';
	assert.equal(detectChatVoiceInstruction(instruction), instruction);
	assert.equal(isOneShotDeliveryInstruction(instruction), false);
	assert.equal(isSpeedOnlyDeliveryInstruction(instruction), false);
	const caption = buildFallbackChatVoiceCaption('キャラクター名: ミケ。役割: 姉。', instruction);
	assert.match(caption, /GYARU DELIVERY — REQUIRED/u);
	assert.match(caption, /速めの会話テンポ/u);
	assert.match(caption, /DRY CLEAN VOCAL — REQUIRED/u);
});

test('routes a natural regenerate-from-scratch phrase to VoiceLab', () => {
	const instruction = 'もう少し早口の今どきギャルっぽくしようか。声を作るときは一から生成しなおしてね';
	assert.equal(detectChatVoiceInstruction(instruction), instruction);
	assert.equal(isOneShotDeliveryInstruction(instruction), false);
});

test('routes a detailed young gyaru base-voice audition to VoiceLab instead of creative generation', () => {
	const instruction = 'ミケ、一から新しい基本声候補として、15〜16歳くらいの高校生年代に聞こえるギャル声を作って。成人女性の落ち着き、太い共鳴、低い胸声、大人っぽい艶や色気は完全になくす。明るく軽い高音寄りで、声の響きを口元の前へ集め、少し鼻に抜ける親しみやすい声にする。生成時から自然にテンポよく話し、再生速度変更、ピッチ変更、エコー、コーラス、二重声、金属加工は使わない。試聴セリフは「ねえ聞いて！ 今日めっちゃいいことあったんだけど！」だけ。';
	const detected = detectChatVoiceInstruction(instruction);
	assert.ok(detected);
	assert.equal(isOneShotDeliveryInstruction(instruction), false);
	assert.equal(extractExactSpokenLine(detected), 'ねえ聞いて! 今日めっちゃいいことあったんだけど!');
});

test('keeps a situation audition one-shot and extracts the exact spoken line', () => {
	const instruction = 'シロ、次の返事だけ声の演技実験です。状況は久しぶりの再会。安心した感じで演じてください。返事は句読点なしの「ありがとう」だけ。余計な言葉は言わないでください。';
	assert.equal(detectChatVoiceInstruction(instruction), instruction);
	assert.equal(isOneShotDeliveryInstruction(instruction), true);
	assert.equal(extractExactSpokenLine(instruction), 'ありがとう');
	assert.equal(extractExactSpokenLine('普通にありがとうと言って'), null);
	const caption = buildOneShotDeliveryCaption('シロ、次の返事だけ声の演技実験。状況は寝起き直後。眠そうに演じてください。返事は「ありがとう」だけ。');
	assert.match(caption, /^SITUATION PERFORMANCE/u);
	assert.match(caption, /強い眠気/u);
	assert.doesNotMatch(caption, /返事は/u);
	assert.ok(caption.length < 300);
	assert.equal(inferOneShotPitchShiftSemitones('状況は怒っている時。怒りを抑えて演じて'), -2.5);
	assert.equal(inferOneShotPitchShiftSemitones('状況は突然びっくりした直後'), 2);
	assert.equal(inferOneShotPitchShiftSemitones('状況は寝起き直後。眠そうに演じて'), -1.25);
});

test('builds a per-utterance caption while preserving the base identity', () => {
	const parameters = Object.fromEntries([
		'basePitch', 'tempo', 'energy', 'breathiness', 'forwardTwang', 'nasality', 'formantShift',
		'brightness', 'body', 'presence', 'dynamics', 'roughness', 'rhythmSwing', 'endingDrop',
		'humanize', 'tension', 'familiarity', 'charaLevel', 'kogyaruPerformance', 'pitchVariation',
		'articulation', 'vowelStretch',
	].map((key) => [key, 50])) as VoiceDirectorRecipe['parameters'];
	parameters.basePitch = 80;

	const caption = buildChatVoiceCaption('シロの基本声', {
		summary: '高く明るい声',
		stylePack: 'natural',
		voiceAgeBand: 'jk',
		dialectStyle: 'standard',
		dialectStrength: 0,
		parameters,
		performanceCue: '柔らかく語りかける',
		interpretation: [],
		cautions: [],
	}, '高い声で話して');

	assert.match(caption, /シロの基本声/);
	assert.match(caption, /THIS UTTERANCE ONLY/);
	assert.match(caption, /声の高さは高め/);
});

test('builds a local draft caption without forcing an existing identity', () => {
	const caption = buildFallbackChatVoiceCaption('', '明るいギャル声で話して');
	assert.match(caption, /LOCAL VOICE DESIGN/);
	assert.match(caption, /明るいギャル声/);
	assert.doesNotMatch(caption, /BASE VOICE IDENTITY/);
});

test('locks an adult-sister voice request to a natural female identity', () => {
	const caption = buildFallbackChatVoiceCaption(
		'キャラクター名: ミケ。役割: 姉。設定: ネコ型アンドロイド姉妹の姉。',
		'男っぽいから、もうちょっと色気のあるお姉さんでお願い',
	);
	assert.match(caption, /明確な日本語の成人女性声/u);
	assert.match(caption, /男性声、少年声/u);
	assert.match(caption, /過度な吐息/u);
	assert.match(caption, /キャラクター名: ミケ/u);
});

test('keeps a sister character female even when the tweak only asks for pitch', () => {
	const caption = buildFallbackChatVoiceCaption(
		'キャラクター名: ミケ。役割: 姉。設定: ネコ型アンドロイド姉妹の姉。',
		'もう少し低くして',
	);
	assert.match(caption, /明確な日本語の成人女性声/u);
});

test('uses a short neutral line for a base-voice audition', () => {
	assert.equal(buildVoiceAuditionLine('ミケ'), 'ミケです。おはよう。今日もよろしくね。');
	assert.equal(buildVoiceAuditionLine('ミケ', 'おはよう、るーつさん。'), 'おはよう、るーつさん。');
});

test('turns a gyaru redesign into an explicitly young feminine voice', () => {
	const caption = buildFallbackChatVoiceCaption(
		'キャラクター名: ミケ。役割: 姉。設定: ネコ型アンドロイド姉妹の姉。',
		'なんか男っぽいからギャルっぽく女性らしくしゃべってほしいな',
	);
	assert.match(caption, /明確な日本語の若い女性声/u);
	assert.match(caption, /GYARU DELIVERY — REQUIRED/u);
	assert.match(caption, /DRY CLEAN VOCAL — REQUIRED/u);
	assert.match(caption, /エコー、リバーブ、コーラス、二重声/u);
	assert.match(caption, /外見語を音声エフェクトへ変換しない/u);
	assert.match(caption, /「男っぽい」は現在の問題点/u);
	assert.doesNotMatch(caption, /自然なお姉さんの声域/u);
	assert.equal(
		buildVoiceAuditionLine('ミケ', null, 'ギャルっぽく話して'),
		'ミケだよ。おはよ！ 今日も楽しくいこっ！',
	);
});
