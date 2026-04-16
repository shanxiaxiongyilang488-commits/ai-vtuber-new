"""
Emotion Engine - キーワードベース感情解析 (Phase 0)
後でML化する際もこのインターフェースは維持する
"""

from dataclasses import dataclass

# 感情タイプ (SvelteKit側の CharacterState.emotion と対応)
EMOTIONS = ("neutral", "joy", "embarrassment", "sadness", "anger")

# 各感情のキーワード辞書 (日本語 + 英語)
EMOTION_KEYWORDS: dict[str, list[str]] = {
    "joy": [
        "嬉しい", "楽しい", "最高", "好き", "ありがとう", "すごい",
        "やった", "わーい", "幸せ", "笑", "ｗ", "！！",
        "happy", "great", "love", "thanks", "amazing", "yay",
    ],
    "sadness": [
        "悲しい", "つらい", "寂しい", "泣", "辛い", "落ち込",
        "残念", "失望", "もう無理",
        "sad", "lonely", "miss", "hurt", "cry",
    ],
    "anger": [
        "怒", "むかつく", "うざい", "ふざけ", "許せ", "最悪",
        "イライラ", "うるさい",
        "angry", "hate", "annoying", "stupid", "ridiculous",
    ],
    "embarrassment": [
        "恥ずかし", "照れ", "やだ", "もう", "ちょっと",
        "えっ", "えー", "うぅ", "//", "///",
        "embarrass", "blush", "stop",
    ],
}

# trust 変化量マッピング
TRUST_DELTA: dict[str, int] = {
    "joy": +3,
    "sadness": -1,
    "anger": -4,
    "embarrassment": +1,
    "neutral": 0,
}


@dataclass
class EmotionResult:
    emotion: str
    confidence: float  # 0.0-1.0
    delta_trust: int
    reason: str


def analyze(text: str, current_emotion: str = "neutral", trust: int = 50) -> EmotionResult:
    """
    テキストから感情を推定する。
    現段階: キーワードヒット数ベースのスコアリング。
    """
    text_lower = text.lower()
    scores: dict[str, int] = {e: 0 for e in EMOTIONS if e != "neutral"}

    for emotion, keywords in EMOTION_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                scores[emotion] += 1

    if not any(scores.values()):
        # ヒットなし → neutral 維持
        return EmotionResult(
            emotion="neutral",
            confidence=1.0,
            delta_trust=0,
            reason="no_keyword_match",
        )

    top_emotion = max(scores, key=lambda e: scores[e])
    top_score = scores[top_emotion]
    total = sum(scores.values())
    confidence = round(top_score / total, 3) if total > 0 else 0.0

    # trust が低いと anger/sadness が増幅しやすい
    if trust < 30 and top_emotion in ("anger", "sadness"):
        confidence = min(1.0, confidence + 0.15)

    return EmotionResult(
        emotion=top_emotion,
        confidence=confidence,
        delta_trust=TRUST_DELTA[top_emotion],
        reason=f"keyword_hit:{top_score}",
    )
