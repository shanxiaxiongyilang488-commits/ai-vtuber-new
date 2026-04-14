/**
 * sessionStore — アクティブなAIプロバイダー/モデルの一元管理
 *
 * 優先度（高→低）:
 *   1. セッション内で明示的に選択した値 (session_provider / session_model)
 *   2. 設定画面で保存したプロバイダーごとのデフォルト (api_{provider}_model)
 *   3. PROVIDER_MODELS の先頭値 (DEFAULT_MODELS)
 *
 * 将来拡張: キャラクターごとに aiProvider/aiModel を持たせる際、
 *   このストアをセッションレベルのフォールバックとして使う。
 */

import { writable } from 'svelte/store';
import { DEFAULT_MODELS, type AIProvider } from '$lib/config/models';

const KEY_PROVIDER = 'session_provider';
const KEY_MODEL    = 'session_model';

/** 設定画面が保存したプロバイダーごとのデフォルトモデルを読む（SSR安全） */
function settingsModel(provider: AIProvider): string {
  if (typeof localStorage === 'undefined') return DEFAULT_MODELS[provider];
  return localStorage.getItem(`api_${provider}_model`) || DEFAULT_MODELS[provider];
}

function createSessionStore() {
  const { subscribe, set, update } = writable({
    provider: 'claude' as AIProvider,
    model:    DEFAULT_MODELS.claude,
  });

  return {
    subscribe,

    /**
     * onMount から呼ぶ。localStorage を読んで状態を初期化する。
     * SSR 環境では localStorage が存在しないため onMount 限定。
     */
    init() {
      if (typeof localStorage === 'undefined') return;
      const savedProvider = localStorage.getItem(KEY_PROVIDER) as AIProvider | null;
      const savedModel    = localStorage.getItem(KEY_MODEL);
      const provider      = savedProvider ?? 'claude';
      const model         = savedModel    ?? settingsModel(provider);
      set({ provider, model });
    },

    /** プロバイダーを切り替える。モデルは新プロバイダーのデフォルトにリセット */
    setProvider(provider: AIProvider) {
      const model = settingsModel(provider);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(KEY_PROVIDER, provider);
        localStorage.setItem(KEY_MODEL,    model);
      }
      set({ provider, model });
    },

    /** モデルだけを変更する */
    setModel(model: string) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(KEY_MODEL, model);
      }
      update(s => ({ ...s, model }));
    },
  };
}

export const sessionStore = createSessionStore();
