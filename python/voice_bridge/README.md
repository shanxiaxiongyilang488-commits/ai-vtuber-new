# Voice Bridge API

[Voice-Design-Cloner](https://github.com/reinehonoka/Voice-Design-Cloner) (VDC) を
SvelteKit から HTTP で使うための独立 API サーバー。VDC の Gradio UI には依存せず、
`modules/*` (ModelManager / voice_design / lora_pipeline) を直接 import して合成する。

```
チャット画面 → POST /api/voice/speak (SvelteKit)
             → POST http://127.0.0.1:8791/speak (Voice Bridge)
             → VDC modules (Irodori worker / Qwen3-TTS)
             → wav を static/voice-output/<characterId>/ に保存 → 吹き出しで再生
```

## 起動

VDC 本体の venv をそのまま使う (gradio 依存で fastapi / uvicorn は導入済み)。

```bat
set VDC_ROOT=E:\Dev\Voice-Design-Cloner
python\voice_bridge\run_voice_bridge.bat
```

または:

```bat
"%VDC_ROOT%\.venv\Scripts\python.exe" python\voice_bridge\server.py
```

環境変数:

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `VDC_ROOT` | `../Voice-Design-Cloner` (リポジトリ隣) | VDC のチェックアウト先 |
| `VOICE_BRIDGE_PORT` | `8791` | 待ち受けポート |

SvelteKit 側は `.env` の `VOICE_BRIDGE_URL` (既定 `http://127.0.0.1:8791`) で参照する。

## API

### GET /health

バックエンド (`irodori` / `standard` / `faster`)、デバイス、利用可能な LoRA 一覧を返す。

### POST /speak

```json
{
  "text": "おはよう。今日はちょっと早いんだね。",
  "mode": "lora",
  "model": "shiro",
  "caption": null,
  "speed": 1.15,
  "seed": null
}
```

- `mode: "lora"` — VDC で学習した LoRA (`output/lora/<model>/`) で合成。Irodori バックエンド必須
- `mode: "clone"` — 保存済みボイス (`output/voice_design/<model>.wav`) を参照音声にしてクローン合成
- `mode: "design"` — `caption` の声質記述から合成 (Voice Design)

レスポンスは `audio/wav` バイナリ。`X-Duration` (秒) / `X-Sample-Rate` ヘッダ付き。
同時生成は常に 1 件 (後続は順番待ち)。GPU が LoRA 学習等で使用中の場合は 503。

## キャラクターへの voice 設定

`data/project/character-assets/<id>/profile.json` に `voice` を追加する:

```json
{
  "id": "shiro",
  "name": "シロ",
  "voice": {
    "engine": "irodori",
    "mode": "lora",
    "model": "shiro",
    "speed": 1.15,
    "autoSpeak": false
  }
}
```

`autoSpeak: true` にすると AI 返信直後に自動で音声再生する (false なら吹き出しの 🔊 ボタンで手動再生)。
