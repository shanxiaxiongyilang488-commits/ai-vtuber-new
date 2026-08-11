/**
 * Voice Design コスト計算 (純関数)。
 * 実APIを呼ばずにテストできるよう、計算ロジックをここへ分離する。
 * 重要: voice-design系APIは preview文字料金に加えて
 *       「voice 1作成ごとの固定費 (perVoiceCreationUsd)」が発生しうる。
 */

export type VoiceDesignPricingInfo = {
	provider: string;
	model: string;
	currency: 'USD';
	/** voice 1作成ごとの固定費 (例: fal minimax = $3/voice)。 */
	perVoiceCreationUsd: number;
	/** プレビュー音声1文字あたりの単価。 */
	perPreviewCharUsd: number;
	/** 公表ページ等で確認済みの価格か。falseの場合UIで警告する。 */
	pricingConfirmed: boolean;
	source: string;
	note?: string;
};

export type VoiceDesignEstimate = {
	voiceCount: number;
	previewChars: number;
	creationFeeUsd: number;
	previewFeeUsd: number;
	totalUsd: number;
};

export function countPreviewCharsForCost(value: string): number {
	return Array.from(value.replace(/\s+/g, '')).length;
}

/** 生成前の推定総額。voiceCount = 作成されるvoice数 (候補数 / 再設計は1)。 */
export function estimateVoiceDesignCost(
	pricing: Pick<VoiceDesignPricingInfo, 'perVoiceCreationUsd' | 'perPreviewCharUsd'>,
	previewCharsPerVoice: number,
	voiceCount: number,
): VoiceDesignEstimate {
	const safeCount = Math.max(0, Math.floor(voiceCount));
	const safeChars = Math.max(0, Math.floor(previewCharsPerVoice));
	const creationFeeUsd = Number((safeCount * pricing.perVoiceCreationUsd).toFixed(6));
	const previewFeeUsd = Number((safeCount * safeChars * pricing.perPreviewCharUsd).toFixed(6));
	return {
		voiceCount: safeCount,
		previewChars: safeChars * safeCount,
		creationFeeUsd,
		previewFeeUsd,
		totalUsd: Number((creationFeeUsd + previewFeeUsd).toFixed(6)),
	};
}

export type VoiceDesignBudget = {
	limitUsd: number;
	usedUsd: number;
	remainingUsd: number;
};

/** 予算チェック: 今回の推定額を加えて上限を超えるなら false。 */
export function isWithinBudget(budget: Pick<VoiceDesignBudget, 'limitUsd' | 'usedUsd'>, estimateTotalUsd: number): boolean {
	return budget.usedUsd + estimateTotalUsd <= budget.limitUsd;
}
