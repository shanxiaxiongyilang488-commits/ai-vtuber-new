/**
 * avatarSocket — Python 状態サーバーへの WebSocket クライアント
 *
 * 使い方（コンポーネント内）:
 *   import { avatarState, initAvatarWs, sendAvatarPatch } from '$lib/ws/avatarSocket';
 *
 *   onMount(() => {
 *     const stop = initAvatarWs();
 *     return stop;   // onDestroy 相当
 *   });
 *
 *   // テンプレートで読む
 *   {$avatarState.breathing}   // 0.0〜1.0
 *   {$avatarState.emotion}     // 'neutral' | 'happy' | ...
 *
 *   // サーバーへ感情・視線・会話状態を送信
 *   sendAvatarPatch({ emotion: 'happy', speaking: true });
 */

import { writable, readonly } from 'svelte/store';

// ── 型 ──────────────────────────────────────────────────────────
export type AvatarEmotion = 'neutral' | 'happy' | 'thinking' | 'sad' | 'angry';
export type AvatarGaze    = 'center'  | 'left'  | 'right'    | 'down';

export interface AvatarStateMsg {
  emotion:   AvatarEmotion;
  breathing: number;        // 0.0〜1.0  サーバーが呼吸ループで更新
  gaze:      AvatarGaze;
  speaking:  boolean;
}

// ── デフォルト ───────────────────────────────────────────────────
const DEFAULT: AvatarStateMsg = {
  emotion:   'neutral',
  breathing: 0.5,
  gaze:      'center',
  speaking:  false,
};

// ── ストア ───────────────────────────────────────────────────────
const _state = writable<AvatarStateMsg>({ ...DEFAULT });

/** 読み取り専用の公開ストア */
export const avatarState = readonly(_state);

// ── WS 管理 ──────────────────────────────────────────────────────
let _ws:      WebSocket | null                      = null;
let _timer:   ReturnType<typeof setTimeout> | null  = null;
let _url      = 'ws://localhost:8000/ws/avatar';
let _running  = false;

function _connect(): void {
  if (!_running) return;

  _ws = new WebSocket(_url);

  _ws.onopen = () => {
    console.debug('[avatarSocket] connected to', _url);
  };

  _ws.onmessage = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data) as Partial<AvatarStateMsg>;
      _state.update(cur => ({ ...cur, ...data }));
    } catch {
      // malformed frame — ignore
    }
  };

  _ws.onclose = () => {
    if (!_running) return;
    console.debug('[avatarSocket] closed — retry in 2 s');
    _timer = setTimeout(_connect, 2000);
  };

  _ws.onerror = () => _ws?.close();
}

/**
 * WebSocket 接続を開始する。
 * 返値をそのまま onDestroy / onMount の cleanup として使える。
 */
export function initAvatarWs(url = 'ws://localhost:8000/ws/avatar'): () => void {
  _url     = url;
  _running = true;
  _connect();

  return () => {
    _running = false;
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
    _ws?.close();
    _ws = null;
    // ストアをデフォルトに戻す
    _state.set({ ...DEFAULT });
  };
}

/**
 * サーバーへ状態の一部を送信する。
 * 送れない場合（未接続 / サーバー落ち）は静かに無視。
 */
export function sendAvatarPatch(
  patch: Partial<Pick<AvatarStateMsg, 'emotion' | 'gaze' | 'speaking'>>
): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(patch));
  }
}
