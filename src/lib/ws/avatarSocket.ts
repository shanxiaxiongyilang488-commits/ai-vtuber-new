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
const MAX_RETRIES = 5;
// 指数バックオフ: 3s → 6s → 12s → 24s → 30s（上限）
const retryDelay  = (attempt: number) => Math.min(3000 * (1 << (attempt - 1)), 30_000);

let _ws:         WebSocket | null                     = null;
let _timer:      ReturnType<typeof setTimeout> | null = null;
let _url         = 'ws://localhost:8000/ws/avatar';
let _running     = false;
let _retries     = 0;
let _failLogged  = false;

function _connect(): void {
  if (!_running) return;

  _ws = new WebSocket(_url);

  _ws.onopen = () => {
    console.debug('[avatarSocket] connected to', _url);
    _retries    = 0;
    _failLogged = false;
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
    _retries++;

    if (_retries > MAX_RETRIES) {
      if (!_failLogged) {
        console.warn(`[avatarSocket] Python server unreachable — gave up after ${MAX_RETRIES} attempts. Avatar sync disabled.`);
        _failLogged = true;
      }
      return;
    }

    const delay = retryDelay(_retries);
    _timer = setTimeout(_connect, delay);
  };

  // onerror は onclose を誘発するだけ — ここでは何もログしない
  _ws.onerror = () => _ws?.close();
}

/**
 * WebSocket 接続を開始する。
 * 返値をそのまま onDestroy / onMount の cleanup として使える。
 */
export function initAvatarWs(url = 'ws://localhost:8000/ws/avatar'): () => void {
  _url        = url;
  _running    = true;
  _retries    = 0;
  _failLogged = false;
  _connect();

  return () => {
    _running    = false;
    _retries    = 0;
    _failLogged = false;
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
    _ws?.close();
    _ws = null;
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
