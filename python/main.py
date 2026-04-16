"""
AI VTuber - Emotion Engine API (Phase 0)
FastAPI サーバー: http://localhost:8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from emotion import analyze, EMOTIONS

app = FastAPI(
    title="AI VTuber Emotion Engine",
    version="0.1.0",
    description="感情解析API - Phase 0 (キーワードベース)",
)

# SvelteKit dev server (localhost:5173) からの呼び出しを許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------- リクエスト / レスポンス ----------

class AnalyzeRequest(BaseModel):
    text: str = Field(..., description="解析対象テキスト (AIの応答 or ユーザー発言)")
    current_emotion: str = Field("neutral", description="現在の感情状態")
    trust: int = Field(50, ge=0, le=100, description="現在のtrustスコア")


class AnalyzeResponse(BaseModel):
    emotion: str = Field(..., description="推定感情: neutral|joy|embarrassment|sadness|anger")
    confidence: float = Field(..., description="信頼度 0.0-1.0")
    delta_trust: int = Field(..., description="trust変化量 (例: +3, -4)")
    reason: str = Field(..., description="推定根拠")


# ---------- エンドポイント ----------

@app.get("/")
def root():
    return {"status": "ok", "service": "emotion-engine", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_emotion(req: AnalyzeRequest):
    """
    テキストから感情を解析して返す。

    - **text**: 解析するテキスト
    - **current_emotion**: 現在の感情 (文脈補正に使用)
    - **trust**: 現在のtrust値 (0-100)
    """
    result = analyze(req.text, req.current_emotion, req.trust)
    return AnalyzeResponse(
        emotion=result.emotion,
        confidence=result.confidence,
        delta_trust=result.delta_trust,
        reason=result.reason,
    )


@app.get("/emotions")
def list_emotions():
    """利用可能な感情タイプ一覧"""
    return {"emotions": list(EMOTIONS)}
