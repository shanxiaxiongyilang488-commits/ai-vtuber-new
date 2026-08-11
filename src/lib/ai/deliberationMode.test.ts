import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationReasoningMode, isDeliberationRequest } from './deliberationMode.ts';

test('明示的な熟考依頼だけ deliberate にする', () => {
	for (const text of [
		'この件を熟考して答えて',
		'じっくり考えて返事してほしい',
		'時間をかけて検討して',
		'Think carefully before you answer.',
	]) {
		assert.equal(conversationReasoningMode(text), 'deliberate', text);
		assert.equal(isDeliberationRequest(text), true, text);
	}
});

test('日常会話や考え事への質問は fast のままにする', () => {
	for (const text of [
		'おはよう、シロ',
		'今日は何してたの？',
		'何を考えてるの？',
		'これどう思う？',
	]) {
		assert.equal(conversationReasoningMode(text), 'fast', text);
		assert.equal(isDeliberationRequest(text), false, text);
	}
});
