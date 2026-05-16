# リセア Mobile Chat

スマホ向けの記憶付きAIパートナーPWAです。会話履歴と長期記憶はブラウザの IndexedDB / localStorage に保存します。

## 起動

```powershell
npm install
npm run dev
```

既定URLは `http://127.0.0.1:5174/` です。

## Ollama接続

1. Ollamaを起動します。
2. アプリの「設定」タブでローカルLLMを有効化します。
3. エンドポイントとモデル名を設定します。
4. 「接続テスト」で確認します。

ブラウザからOllamaへ直接接続するため、環境によってはOllama側でアクセス元の許可が必要です。

```powershell
$env:OLLAMA_ORIGINS="http://127.0.0.1:5174,http://localhost:5174"
ollama serve
```

モデル例:

```powershell
ollama pull llama3.1
```

将来別のローカルLLMやIrodori-TTSへ接続する場合は、`src/lib/chat/types.ts` の `ChatEngine` / `SpeechEngine` を実装して差し替えます。
