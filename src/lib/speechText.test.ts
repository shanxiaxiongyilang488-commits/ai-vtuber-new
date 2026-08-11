import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeChatSpeechText, sanitizeSpeechText } from './speechText.ts';

test('removes display-only Japanese angle-bracket voice directions', () => {
  assert.equal(
    sanitizeSpeechText('〈控えめな電子ボイス・エフェクト〉\nこんにちは、るーつっち！ シロだよ〜、にゃっ！'),
    'こんにちは、るーつっち！ シロだよ〜、にゃっ！',
  );
});

test('removes ASCII and full-width Voice FX tags', () => {
  assert.equal(
    sanitizeSpeechText('<VOICE_FX: soft digital shimmer> ＜cyan notification tone＞ こんにちは。'),
    'こんにちは。',
  );
});

test('preserves ordinary speech and applies a Unicode-safe limit', () => {
  assert.equal(sanitizeSpeechText('  こんにちは。\nまたね。  '), 'こんにちは。 またね。');
  assert.equal(sanitizeSpeechText('あいうえお', 3), 'あいう');
});

test('chat speech keeps all ordinary sentences within its safety limit', () => {
  assert.equal(
    sanitizeChatSpeechText('ふふ、おはよう。こんな朝早くに声をかけてくれるなんて嬉しいわ。'),
    'ふふ、おはよう。こんな朝早くに声をかけてくれるなんて嬉しいわ。',
  );
  assert.equal(sanitizeChatSpeechText('句点がない長い文章です', 8), '句点がない長い文');
});

test('chat speech never silently truncates the displayed reply', () => {
  const displayedReply = '長いセリフです。'.repeat(80);
  assert.equal(sanitizeChatSpeechText(displayedReply), displayedReply);
  assert.equal(sanitizeSpeechText(displayedReply), displayedReply);
});
