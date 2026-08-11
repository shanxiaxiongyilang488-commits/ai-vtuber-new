export type ConversationReasoningMode = 'fast' | 'deliberate';

const DELIBERATION_PATTERNS: RegExp[] = [
	/(?:熟考|熟慮)(?:して|しよう|したい|をお願い)?/u,
	/(?:じっくり|よく|深く|慎重に|本気で)\s*(?:考え|検討し|分析し)/u,
	/(?:時間をかけて|徹底的に)\s*(?:考え|検討し|分析し)/u,
	/(?:考え抜いて|掘り下げて考えて|詳しく分析して)/u,
	/\b(?:think\s+(?:carefully|deeply)|reason\s+carefully|analy[sz]e\s+thoroughly|take\s+your\s+time\s+(?:to\s+)?think|deliberate)\b/iu,
];

/**
 * 明示的に時間をかけた回答を求められたターンだけ熟考へ切り替える。
 * 「何を考えてる？」のような通常会話は高速モードのままにする。
 */
export function conversationReasoningMode(text: string): ConversationReasoningMode {
	const normalized = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
	return DELIBERATION_PATTERNS.some((pattern) => pattern.test(normalized))
		? 'deliberate'
		: 'fast';
}

export function isDeliberationRequest(text: string): boolean {
	return conversationReasoningMode(text) === 'deliberate';
}
