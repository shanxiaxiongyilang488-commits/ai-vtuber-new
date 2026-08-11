import type { VoiceProvider } from './types';

/**
 * デフォルトは固定作成費のないQwen。
 * ⚠️ MiniMax voice-design は $3/voice の固定費があるため、
 *    明示的に指定された場合のみ使用する (デフォルト禁止)。
 */
export const DEFAULT_VOICE_DESIGN_PROVIDER = 'disabled';

export async function getVoiceDesignProvider(name?: string): Promise<VoiceProvider> {
	void name;
	throw new Error('FAL voice generation is disabled. Use Honoka or Irodori local TTS.');
}

/** Provider比較用: 全プロバイダの価格情報一覧 (APIは呼ばない)。 */
export async function listVoiceDesignProviders(): Promise<VoiceProvider[]> {
	return [];
}
