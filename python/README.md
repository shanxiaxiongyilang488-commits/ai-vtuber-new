# Emotion Engine - Python API (Phase 0)

AI VTuber プロジェクトの感情解析バックエンド。

## セットアップ (Windows)

### 1. Python バージョン確認

```powershell
python --version
# 3.10 以上であればOK
```

### 2. 仮想環境を作る

```powershell
cd E:\Dev\ai-vtuber\python
python -m venv .venv
```

### 3. 仮想環境を有効化

```powershell
.venv\Scripts\activate
# プロンプトが (.venv) になればOK
```

### 4. 依存パッケージをインストール

```powershell
pip install -r requirements.txt
```

### 5. サーバー起動

```powershell
uvicorn main:app --reload --port 8000
```

ブラウザで http://localhost:8000 を開いて `{"status":"ok"}` が返ればOK。

---

## API ドキュメント

サーバー起動後: http://localhost:8000/docs (Swagger UI)

### POST /analyze

```json
// リクエスト
{
  "text": "やった！すごく嬉しい！",
  "current_emotion": "neutral",
  "trust": 65
}

// レスポンス
{
  "emotion": "joy",
  "confidence": 0.857,
  "delta_trust": 3,
  "reason": "keyword_hit:6"
}
```

### GET /health

```json
{ "status": "ok" }
```

### GET /emotions

```json
{ "emotions": ["neutral", "joy", "embarrassment", "sadness", "anger"] }
```

---

## 動作確認 (PowerShell)

```powershell
# health check
Invoke-RestMethod http://localhost:8000/health

# emotion 解析
$body = @{ text = "やった！すごく嬉しい！"; current_emotion = "neutral"; trust = 65 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8000/analyze -Body $body -ContentType "application/json"
```

---

## ファイル構成

```
python/
├── main.py          FastAPI アプリ本体 + エンドポイント定義
├── emotion.py       感情解析ロジック (キーワードベース)
├── requirements.txt 依存パッケージ
└── .venv/           仮想環境 (git管理外)
```

## Phase ロードマップ

| Phase | 内容 |
|-------|------|
| **0** (現在) | FastAPI起動 + キーワードベース感情解析 |
| 1 | SvelteKit `/api/emotion-py` proxy 追加 |
| 2 | Lab画面に Compare Mode トグル追加 |
| 3 | ML化 / trust decay / 長期記憶 |
