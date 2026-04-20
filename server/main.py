"""
avatar_server — FastAPI + WebSocket 状態配信サーバー

エンドポイント:
  WS   /ws/avatar      ← SvelteKit から接続。状態を 20Hz で受信 / 送信も可
  GET  /avatar/state   ← 現在の状態を返す（デバッグ用）
  POST /avatar/state   ← 状態を更新する（外部スクリプト・テスト用）

起動:
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import math
import random
from typing import Literal, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Avatar State Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 型 ───────────────────────────────────────────────────────────
Emotion = Literal["neutral", "happy", "thinking", "sad", "angry"]
Gaze    = Literal["center", "left", "right", "down"]


# ── 共有ステート ─────────────────────────────────────────────────
class _State:
    emotion:   Emotion = "neutral"
    gaze:      Gaze    = "center"
    speaking:  bool    = False
    breathing: float   = 0.5   # _breathing_loop が毎 tick 上書き


state = _State()


def _payload() -> dict:
    return {
        "emotion":   state.emotion,
        "breathing": round(state.breathing, 4),
        "gaze":      state.gaze,
        "speaking":  state.speaking,
    }


# ── WebSocket ハブ ────────────────────────────────────────────────
_clients: Set[WebSocket] = set()


async def _broadcast(msg: str) -> None:
    dead: Set[WebSocket] = set()
    for ws in _clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


@app.websocket("/ws/avatar")
async def ws_avatar(ws: WebSocket) -> None:
    await ws.accept()
    _clients.add(ws)
    # 接続直後に現在ステートを即送信
    await ws.send_text(json.dumps(_payload()))
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                # クライアントから emotion / gaze / speaking を受け付ける
                if "emotion"  in data: state.emotion  = data["emotion"]
                if "gaze"     in data: state.gaze      = data["gaze"]
                if "speaking" in data: state.speaking  = bool(data["speaking"])
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(ws)


# ── REST ─────────────────────────────────────────────────────────
class StateUpdate(BaseModel):
    emotion:  Emotion | None = None
    gaze:     Gaze    | None = None
    speaking: bool    | None = None


@app.post("/avatar/state")
def post_state(body: StateUpdate) -> dict:
    if body.emotion  is not None: state.emotion  = body.emotion
    if body.gaze     is not None: state.gaze      = body.gaze
    if body.speaking is not None: state.speaking  = body.speaking
    return {"ok": True}


@app.get("/avatar/state")
def get_state() -> dict:
    return _payload()


# ── 呼吸ループ ────────────────────────────────────────────────────
#
# 感情ごとのパラメータ:
#   period  … 1 呼吸の基本周期 (秒)
#   depth   … 振幅 (0〜1)
#   jitter  … period の揺らぎ係数（大きいほど不規則）
#
_BREATH: dict[str, tuple[float, float, float]] = {
    #             period  depth  jitter
    "neutral":   (4.0,   0.50,  0.08),
    "happy":     (3.2,   0.55,  0.14),   # 軽く弾んだ呼吸
    "thinking":  (5.5,   0.65,  0.04),   # 深く静かな呼吸
    "sad":       (5.0,   0.60,  0.06),
    "angry":     (3.0,   0.45,  0.18),   # 荒い呼吸
}

_TICK = 0.05  # 20 Hz


async def _breathing_loop() -> None:
    t           = 0.0
    phase_scale = 1.0   # period の揺らぎ倍率
    next_jitter = 0.0   # 次の揺らぎ更新時刻

    while True:
        period, depth, jitter = _BREATH.get(state.emotion, _BREATH["neutral"])

        # speaking 時は少し速く・深く
        if state.speaking:
            depth  = min(1.0, depth + 0.10)
            period = period * 0.85

        eff_period = max(0.5, period * phase_scale)

        # 正弦波 → 0.0〜1.0 に正規化
        raw             = math.sin(2 * math.pi * t / eff_period)
        state.breathing = 0.5 + raw * (depth / 2.0)

        # 数呼吸ごとに period を微変動（有機的なリズム感）
        if t >= next_jitter:
            phase_scale = 1.0 + (random.random() - 0.5) * jitter * 2.0
            next_jitter = t + period * (2.0 + random.random() * 2.0)

        await _broadcast(json.dumps(_payload()))
        t += _TICK
        await asyncio.sleep(_TICK)


@app.on_event("startup")
async def _startup() -> None:
    asyncio.create_task(_breathing_loop())
