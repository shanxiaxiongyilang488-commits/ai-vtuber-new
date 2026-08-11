import type { VoiceDesignPricingInfo } from '$lib/voiceDesignCost';

/**
 * クラウドVoice Design TTSのProvider Adapterインターフェース。
 * UIコンポーネントは具体的なプロバイダへ依存せず、APIルート経由でのみ利用する。
 *
 * 重要: 価格は「preview文字単価」と「voice 1作成ごとの固定費」の両方を必ず持つ。
 * (fal minimax voice-design は $3/voice の固定費がある — 2026-07-11 の課金事故の教訓)
 */

export type VoiceProviderPricing = VoiceDesignPricingInfo;

export type VoiceGenerationInput = {
	/** 声のテキスト記述 (Voice Design Prompt)。 */
	designPrompt: string;
	/** 試聴用テキスト。 */
	previewText: string;
};

export type VoiceGenerationResult = {
	/** プロバイダが返す音声URL (この時点ではリモートURL)。 */
	audioUrl: string;
	/** プロバイダ側で再利用可能な voice id (あれば)。 */
	voiceId?: string;
};

export interface VoiceProvider {
	getProviderName(): string;
	getModelId(): string;
	getPricing(): VoiceProviderPricing;
	testConnection(): Promise<{ ok: boolean; message: string }>;
	generateVoice(input: VoiceGenerationInput): Promise<VoiceGenerationResult>;
}
