import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExplicitVideoActionRequest } from './intentSafety.ts';

test('requires an explicit video medium before allowing a video action', () => {
	assert.equal(hasExplicitVideoActionRequest('この画像から15秒の動画を作って'), true);
	assert.equal(hasExplicitVideoActionRequest('さっきの動画を短くして'), true);
	assert.equal(hasExplicitVideoActionRequest('動画は作らないで'), false);
});

test('does not route a detailed VoiceLab audition to video generation', () => {
	assert.equal(hasExplicitVideoActionRequest(
		'ミケ、一から新しい基本声候補として、15〜16歳くらいの高校生年代に聞こえるギャル声を作って。生成時から自然にテンポよく話し、試聴セリフは「ねえ聞いて！」だけ。',
	), false);
});
