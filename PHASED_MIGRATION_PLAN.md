# Character / Voice / VRM 段階移行計画

## 1. 目的

`CHARACTER_LIBRARY_READONLY_DESIGN.md` を基準に、次の6 Phaseで責務を分離しながら機能を接続する。

1. Character Library ReadOnly化
2. LAB REF分離
3. Character Chat分離
4. Voice Registry追加
5. Irodori-TTS接続
6. VRM LipSync接続

各Phaseは独立してリリース・検証・ロールバックできる単位とする。後続Phaseは前Phaseの完了条件を満たしてから開始する。

## 2. 全体方針

### 2.1 最終的な責務

| ドメイン | 責務 | 永続化 |
|---|---|---|
| Character Master | キャラクターの正規プロフィール・画像・Visual YAML | 読み取り専用 |
| LAB Reference | LAB作業中の参照画像スナップショット | セッション、必要時のみ専用IndexedDB |
| Character Chat | Actor、Conversation、Message、Chat Memory | `data/character-chat` |
| Voice Registry | 利用可能な声とTTS設定の正規定義 | `data/voice-registry` |
| Voice Runtime | TTS生成、再生、再生イベント | 原則ステートレス |
| Avatar Runtime | VRM表示、表情、LipSync | セッションstate |

### 2.2 許可する依存

```text
LAB              → Character Master Reader
Character Chat   → Character Master Reader
Character Chat   → Voice Registry Reader
Character Chat   → Voice Runtime
Voice Runtime    → Irodori-TTS Adapter
Avatar Runtime   → Voice Playback Signal
```

禁止する依存:

```text
LAB              → Character Chat Memory
LAB              → Voice Registry Writer
Character Chat   → LAB referenceImages
Voice Registry   → Character Master Writer
Irodori Adapter  → Character / Chat / LAB保存領域
VRM Viewer       → TTS APIまたはRegistry API
```

### 2.3 リリース方式

各Phaseで次の順序を守る。

1. 新経路を追加
2. 新旧の読み取り結果を比較
3. Feature Flagで新経路へ切り替え
4. 旧Writerを停止
5. 安定期間後に旧経路を削除

データの二重書きは行わない。切替時点でWriterを一つに固定する。

### 2.4 推奨Feature Flag

```text
FEATURE_CHARACTER_MASTER_READONLY
FEATURE_LAB_REFERENCE_ISOLATION
FEATURE_CHARACTER_CHAT_V2
FEATURE_VOICE_REGISTRY
FEATURE_IRODORI_RUNTIME
FEATURE_VRM_AUDIO_LIPSYNC
```

Feature Flagは環境変数またはサーバー設定として扱い、Character MasterやVoice Registryのデータファイルには保存しない。

## 3. Phase依存関係

| Phase | 前提 | 次Phaseへ進む条件 |
|---|---|---|
| 1. Library ReadOnly | 現行Registryが読める | RuntimeからMasterが更新されない |
| 2. LAB REF分離 | Phase 1完了 | LAB操作でMaster/Chatが変化しない |
| 3. Chat分離 | Phase 2完了 | Chatが専用保存領域だけを更新する |
| 4. Voice Registry | Phase 3のActor ID確定 | ActorがVoice ID参照を保持できる |
| 5. Irodori-TTS | Phase 4のVoice契約確定 | Registry IDから音声生成・再生できる |
| 6. VRM LipSync | Phase 5の再生制御確定 | 実音声振幅でVRM口形が動く |

---

# Phase 1: Character Library ReadOnly化

## 4.1 目的

Character LibraryをCharacter Masterの読み取り専用ビューへ変更し、通常Runtimeからの登録・編集・画像更新・削除を停止する。

このPhaseでは保存ディレクトリを直ちに移動せず、まずWriterを止める。物理移行より先に責務境界を確立する。

## 4.2 実施内容

1. `characterMasterRepository` を新設し、読み取り処理を分離する
2. GET専用 `/api/character-master` APIを追加する
3. Character Libraryの取得先を新APIへ変更する
4. Character Libraryから作成・編集・画像変更・YAML生成UIを外す
5. 旧 `/api/characters` 更新系をFeature Flag有効時に `405` とする
6. Masterファイルのhash監視テストを追加する
7. Master更新は将来の専用CLIだけが担当する方針にする

## 4.3 影響範囲

- Character Library画面
- Character Registryサーバーモジュール
- Characterプロフィール、画像、YAMLのAPI
- LABのCharacter一覧取得
- Character Chatのプロフィール取得
- Story/YAMLからのキャラクター存在確認

このPhaseではLABとChatの書き込み分離はまだ完了しない。新しいMaster Readerを導入し、後続Phaseの基盤を作る。

## 4.4 変更候補ファイル

### 新規

```text
src/lib/server/characterMasterRepository.ts
src/lib/types/characterMaster.ts
src/routes/api/character-master/+server.ts
src/routes/api/character-master/[id]/+server.ts
src/routes/api/character-master/[id]/reference/+server.ts
src/routes/api/character-master/[id]/sheet/+server.ts
scripts/character-master-validate.ts
```

### 変更

```text
src/routes/characters/+page.svelte
src/lib/components/characters/CharacterLibraryCard.svelte
src/lib/server/characterRegistry.ts
src/routes/api/characters/+server.ts
src/routes/api/characters/[id]/+server.ts
src/routes/api/characters/[id]/reference/+server.ts
src/routes/lab/+page.svelte
src/routes/characters/[id]/chat/+page.svelte
package.json
```

### データ

Phase 1では原則として現行を読み取り元にする。

```text
data/project/character-assets/
data/project/characters/
```

`data/character-master` への物理移動は、新Readerと移行検証が安定した後に別コミットで行う。

## 4.5 API変更

追加:

```text
GET /api/character-master
GET /api/character-master/<id>
GET /api/character-master/<id>/reference
GET /api/character-master/<id>/sheet
```

停止:

```text
POST   /api/characters
PUT    /api/characters/<id>
DELETE /api/characters/<id>
PUT    /api/characters/<id>/reference
```

移行期間中のGET `/api/characters` は、新Readerへの互換委譲を許可する。

## 4.6 リスク

| リスク | 影響 | 対策 |
|---|---|---|
| LABの登録処理が旧POSTを呼ぶ | LABでエラー表示 | Phase 1中はFlagで段階停止し、Phase 2でUIを撤去 |
| Character Libraryの編集機能喪失 | 運用上更新できない | 専用CLI導入まで旧データをGit/バックアップ管理 |
| `readProfile()` が読み取り時にYAMLを書き出す | ReadOnly違反 | Readerから暗黙書き込みを除去 |
| Legacy migrationが起動時にファイルをコピーする | Master hashが変化 | migrationを明示CLIへ移す |
| 旧API利用箇所の見落とし | 405エラー | `rg "/api/characters"` とネットワークE2Eで検出 |

## 4.7 検証・完了条件

- Character Libraryに編集操作が存在しない
- Master GET APIの一覧・詳細・画像取得が成功する
- 更新系APIが `405` を返す
- Character Library閲覧前後でMaster hashが変わらない
- `characterMasterRepository` が書き込み系FS APIをimportしていない
- 旧GETと新GETのID一覧が一致する

## 4.8 ロールバック

コード:

1. `FEATURE_CHARACTER_MASTER_READONLY=false`
2. Character Libraryの取得先を旧 `/api/characters` へ戻す
3. 旧POST/PUT/DELETEハンドラーを再有効化する

データ:

- Phase 1ではデータ移動を行わないため復元不要
- hash不一致時は作業前バックアップからMasterファイルだけを復元

ロールバック条件:

- 既存キャラクターが新GET APIで欠落する
- 読み取り操作だけでMasterファイルが変化する
- LABまたはChatの主要導線が新Readerで動作しない

---

# Phase 2: LAB REF分離

## 5.1 目的

LABの `referenceImages` を、Character MasterとCharacter Chatから独立したセッションデータへ変更する。

## 5.2 実施内容

1. `ReferenceImage` をLAB専用 `LabReference` 型へ変更する
2. LAB内UUIDを主キーとして付与する
3. Master IDは `sourceMasterId` として出自情報だけ保持する
4. Masterからの `USE AS REF` はスナップショットコピーにする
5. LABからCharacter登録・更新・Bible保存処理を撤去する
6. `/api/characters/story-context` とChat Memory取込を停止する
7. REF追加・更新・削除を `labReferenceStore` に集約する
8. 永続化は当初ブラウザメモリーだけとし、必要なら専用IndexedDBを追加する

## 5.3 削除対象の現行処理

```text
registerReferenceImageCharacter()
handleCharacterRegistryUpload()
updateRegisteredCharacter()
saveCharacterBible() によるMaster更新
loadStoryCharacterMemories()
/api/characters/story-context
```

`loadCharacterBible()` は、Masterからの読み取り専用スナップショット取得へ変更するか、LAB内解析結果だけを使う。

## 5.4 影響範囲

- LABのCharacter Registryパネル
- REF IMAGE追加、編集、削除
- Character Bible生成
- Manga/Story/YAML生成コンテキスト
- Chat MemoryをStoryへ反映していた処理
- LAB初期化と再読み込み時の挙動

## 5.5 変更候補ファイル

### 新規

```text
src/lib/lab/types/labReference.ts
src/lib/lab/stores/labReferenceStore.svelte.ts
src/lib/lab/services/characterMasterSnapshot.ts
src/lib/lab/persistence/labReferenceSession.ts
```

`labReferenceSession.ts` はIndexedDB採用時のみ作成する。

### 変更

```text
src/routes/lab/+page.svelte
src/routes/api/yaml-image/+server.ts
src/routes/api/lab-chat/+server.ts
src/lib/server/characterRegistry.ts
src/routes/api/characters/story-context/+server.ts
```

### 削除候補

```text
src/routes/api/characters/story-context/+server.ts
```

## 5.6 データ契約

```ts
type LabReference = {
  id: string;
  source: 'upload' | 'character-master';
  sourceMasterId?: string;
  name: string;
  role: string;
  description: string;
  imageDataUrl: string;
  createdAt: string;
};
```

LAB生成APIへ渡す際も `sourceMasterId` は識別情報としてのみ利用し、MasterやChatの再ロードキーにはしない。

## 5.7 リスク

| リスク | 影響 | 対策 |
|---|---|---|
| Chat Memory反映停止でStoryの人格が変わる | 生成結果差分 | LABスナップショットに必要な説明を明示保持 |
| `characterId` 前提コードが残る | REF判定・重複判定が壊れる | `id` と `sourceMasterId` の用途を分けて型エラー化 |
| `bind:value={ref.name}` の直接変更 | Store更新が追跡されない | Storeのupdate操作へ統一 |
| Data URLのメモリー使用量 | 大画像でブラウザ負荷 | 既存サムネイル処理維持、原本は必要時だけ保持 |
| 再読み込みでREF消失 | 利用者混乱 | セッション仕様をUI表示、必要ならIndexedDBを後付け |

## 5.8 検証・完了条件

- `USE AS REF` でLAB UUIDを持つコピーが追加される
- REFの名前・役割変更でMasterファイルが変化しない
- ×削除でLAB stateだけが一件減る
- LABから更新系Character APIが呼ばれない
- LABからCharacter Chat APIが呼ばれない
- Story生成がChat `memory.json` を参照しない
- Master、Chat保存領域のhash/mtimeがLAB操作前後で不変

## 5.9 ロールバック

コード:

1. `FEATURE_LAB_REFERENCE_ISOLATION=false`
2. 旧 `referenceImages` 更新経路へ戻す
3. 必要なら `/api/characters/story-context` の読み取りだけを再有効化

データ:

- セッションstateのみなら復元不要
- IndexedDBを導入した場合も削除せず、旧経路から無視する

注意:

Masterへの書き込み処理はPhase 1で停止済みのため、ロールバックでもLABからMaster Writerを再開しない。問題時はREF機能を一時無効化する。

---

# Phase 3: Character Chat分離

## 6.1 目的

Character ChatのActor、Conversation、Message、MemoryをCharacter MasterとLABから物理・API・型の三層で分離する。

## 6.2 実施内容

1. `characterChatRepository` を新設する
2. Chat ActorをMasterのプロフィールスナップショットとして作成する
3. Chat履歴とMemoryを `data/character-chat` へ移す
4. Character Chat専用APIを追加する
5. URL主キーをMaster IDからConversation IDへ変更する
6. `/api/lab-chat` 依存を副作用のない共通推論APIへ変更する
7. 旧Chat/Memory APIを互換Reader経由にした後、廃止する

## 6.3 保存構造

```text
data/character-chat/
├─ actors/<actor-id>/
│  ├─ actor.json
│  └─ memory.json
├─ conversations/<conversation-id>/
│  ├─ conversation.json
│  └─ messages.json
└─ migration-map.json
```

## 6.4 影響範囲

- Character Libraryの `START CHAT`
- Character Chat画面とURL
- Chat履歴・Memory API
- Story Context旧API
- 共通LLM推論API
- 既存Chatデータの移行
- 将来のVoice Registry紐付け先

## 6.5 変更候補ファイル

### 新規

```text
src/lib/server/characterChatRepository.ts
src/lib/types/characterChat.ts
src/lib/server/inference/chatInference.ts
src/routes/api/character-chat/actors/+server.ts
src/routes/api/character-chat/actors/[actorId]/+server.ts
src/routes/api/character-chat/actors/[actorId]/memory/+server.ts
src/routes/api/character-chat/conversations/+server.ts
src/routes/api/character-chat/conversations/[id]/messages/+server.ts
src/routes/api/inference/chat/+server.ts
src/routes/character-chat/[conversationId]/+page.svelte
scripts/migrate-character-chat.ts
```

### 変更

```text
src/routes/characters/+page.svelte
src/lib/components/characters/CharacterLibraryCard.svelte
src/routes/characters/[id]/chat/+page.svelte
src/lib/server/characterRegistry.ts
src/routes/api/lab-chat/+server.ts
src/routes/api/characters/[id]/chat/+server.ts
src/routes/api/characters/[id]/memory/+server.ts
```

### データ

```text
data/project/character-assets/<id>/chat.json
data/project/character-assets/<id>/memory.json
data/character-chat/
```

## 6.6 移行手順

1. dry-runで旧Chat/Memoryを列挙する
2. Master IDごとにLegacy Actor IDを生成する
3. ActorへMasterプロフィールをスナップショットする
4. 旧 `chat.json` をConversationの `messages.json` へコピーする
5. 旧 `memory.json` をActorの `memory.json` へコピーする
6. 件数とhashを比較する
7. 新APIへ切り替える
8. 安定期間後に旧ファイルを削除する

移行中は旧ファイルを読み取り専用で保持し、二重書きしない。

## 6.7 リスク

| リスク | 影響 | 対策 |
|---|---|---|
| Master IDとActor IDの混同 | 誤った会話を表示 | ID型とAPIパスを分離 |
| URL変更でブックマーク切れ | 404 | 旧URLからLegacy Conversationへリダイレクト |
| 移行時の履歴欠落 | 会話データ損失 | dry-run、件数・hash検証、旧ファイル保持 |
| 共通推論API移行で応答差分 | Chat品質差分 | 同じプロンプトとprovider設定で比較 |
| Chat MemoryがLABへ再流入 | 分離違反 | 静的依存テストとAPIネットワークテスト |

## 6.8 検証・完了条件

- Chat送信で `data/character-chat` だけが更新される
- MasterとLAB保存領域が変化しない
- 旧履歴件数と新履歴件数が一致する
- Chat Memory更新がLAB生成結果へ自動流入しない
- Character Chatから `/api/lab-chat` が呼ばれない
- 旧URLが新Conversationへ正しく遷移する

## 6.9 ロールバック

コード:

1. `FEATURE_CHARACTER_CHAT_V2=false`
2. 旧Character Chat画面・APIへルーティングを戻す
3. 新Chat Writerを停止する

データ:

- 新Chat領域は削除せず隔離する
- 旧 `chat.json`、`memory.json` は安定期間終了まで保持する
- ロールバック後は旧ファイルを唯一のWriterに戻す

禁止事項:

- 新旧両方へ履歴をマージしながら運用しない
- ロールバック時に新データを自動で旧形式へ上書きしない

新Chat期間中の会話を戻す必要がある場合は、明示的な逆移行ツールで実施する。

---

# Phase 4: Voice Registry追加

## 7.1 目的

現在、`data/settings.json`、Voice画面state、localStorage、Character型、`static/voice_library/index.json` に分散しているVoice定義を、独立したVoice Registryへ集約する。

Character MasterへVoice設定を書き込まない。Character Chat Actorは `voiceProfileId` を参照する。

## 7.2 Voice Registryの責務

- Voice Profile一覧
- TTS provider
- provider固有設定
- Irodoriモデル・caption・voice seed/参照
- サンプル音声
- 有効・無効状態
- スキーマバージョン

エンドポイントURL、API keyなどの環境設定はRegistryへ保存しない。これらは `settings.json` または環境変数で管理する。

## 7.3 保存構造

```text
data/voice-registry/
├─ manifest.json
├─ profiles/
│  └─ <voice-profile-id>.json
└─ samples/
   └─ <sample-id>.wav
```

Voice Profile例:

```json
{
  "schemaVersion": 1,
  "id": "voice-risea-primary",
  "displayName": "リセア Primary",
  "provider": "irodori-tts",
  "enabled": true,
  "config": {
    "model": "Aratako/Irodori-TTS-500M-v3",
    "caption": "透明感のある若い女性の声...",
    "voice": ""
  },
  "sampleAsset": "samples/sample-risea.wav",
  "updatedAt": "..."
}
```

## 7.4 実施内容

1. Voice Registry型・Repository・APIを追加する
2. Voice画面の `voiceProfiles` をRegistryへ移す
3. `static/voice_library/index.json` をサンプル履歴として移行する
4. Character Chat Actorへ任意の `voiceProfileId` を追加する
5. Voice Profile選択UIをCharacter Chat側へ追加する
6. LABのVoice Configはセッション選択としてRegistryを読むだけにする
7. `Character.voiceEngine/voice/voiceId` の旧契約を段階廃止する

## 7.5 影響範囲

- Voice Lab画面
- `data/settings.json` の `irodori.voiceProfiles`
- `static/voice_library`
- Character Chat Actor
- LABのVoice Config
- `createVoiceEngine()`
- Chat、Discussion、AI Chatなど旧Character型利用箇所

## 7.6 変更候補ファイル

### 新規

```text
src/lib/types/voiceRegistry.ts
src/lib/server/voiceRegistryRepository.ts
src/routes/api/voice-registry/+server.ts
src/routes/api/voice-registry/[id]/+server.ts
src/routes/api/voice-registry/[id]/sample/+server.ts
src/lib/voice/voiceProfileResolver.ts
scripts/migrate-voice-registry.ts
```

### 変更

```text
src/routes/voice/+page.svelte
src/routes/api/voice/designer/+server.ts
src/lib/server/settings.ts
src/lib/types/character.ts
src/lib/api/voiceEngine.ts
src/routes/lab/+page.svelte
src/routes/character-chat/[conversationId]/+page.svelte
src/lib/server/characterChatRepository.ts
src/routes/chat/+page.svelte
src/routes/ai-chat/+page.svelte
src/routes/discussion/+page.svelte
src/lib/components/CharacterCard.svelte
src/lib/components/CharacterSettingsModal.svelte
```

### データ

```text
data/settings.json
static/voice_library/index.json
static/voice_library/*.wav
data/voice-registry/
```

## 7.7 API案

```text
GET    /api/voice-registry
GET    /api/voice-registry/<id>
POST   /api/voice-registry
PUT    /api/voice-registry/<id>
DELETE /api/voice-registry/<id>
GET    /api/voice-registry/<id>/sample
```

Voice RegistryはCharacter Masterとは異なり、Voice管理画面から更新可能な独立Registryとする。

## 7.8 リスク

| リスク | 影響 | 対策 |
|---|---|---|
| Character名をキーにしたProfile移行 | 同名・改名で誤紐付け | UUID/安定IDを発行し移行マップを保存 |
| provider固有項目の肥大化 | 型が複雑化 | discriminated unionで定義 |
| サンプルWAV移動でURL切れ | 再生不能 | 旧URL互換ルートまたはコピー期間を設ける |
| 旧Character型利用箇所が多い | 広範囲の型エラー | Adapterで旧型をVoice Profileへ変換 |
| API keyをRegistryへ混入 | 情報漏えい | Registry Schemaで秘密情報フィールドを拒否 |

## 7.9 検証・完了条件

- Voice Profileが安定IDで取得できる
- Character Chat Actorが `voiceProfileId` を保持できる
- LABはRegistryを読み取るが更新しない
- Voice画面からの変更がCharacter Masterへ影響しない
- 旧サンプル数と移行後サンプル数が一致する
- Registry JSONにAPI key、backend URLが含まれない

## 7.10 ロールバック

コード:

1. `FEATURE_VOICE_REGISTRY=false`
2. `settings.irodori.voiceProfiles` と旧localStorage選択へ戻す
3. Actorの `voiceProfileId` は無視し、旧Voice設定Adapterを使う

データ:

- `data/settings.json` と `static/voice_library` を移行完了まで保持
- `data/voice-registry` は削除せず読み取り停止
- Registry更新期間中のデータはJSONとしてエクスポートして保全

---

# Phase 5: Irodori-TTS接続

## 8.1 目的

Voice Registryの `voiceProfileId` からIrodori-TTS設定を解決し、Character Chatと必要なUIで一貫した音声生成・再生を行う。

現行の `/api/speak` と `/api/voice/generate` の重複を解消し、TTS Runtime契約を一本化する。

## 8.2 現行の接続点

既存実装:

```text
src/lib/server/irodoriGradio.ts
src/lib/server/irodoriModels.ts
src/routes/api/voice/generate/+server.ts
src/routes/api/voice/models/+server.ts
src/routes/api/voice/ping/+server.ts
src/routes/api/speak/+server.ts
src/lib/tts/irodori.ts
src/lib/api/voiceEngine.ts
```

既存接続は再利用できるが、`voice`、`voiceId`、`characterName` から暗黙解決する処理を `voiceProfileId` に置き換える。

## 8.3 実施内容

1. `VoiceSynthesisRequest` と `VoiceSynthesisResult` を定義する
2. Voice RegistryからProfileを解決する
3. Irodori Adapterがprovider固有payloadを生成する
4. TTS APIを `/api/voice/synthesize` に統一する
5. 戻り値を音声Blobまたはstreamへ統一する
6. クライアント再生を `voicePlaybackController` に集約する
7. `onStart`、`onEnd`、`onError`、音量解析用Audio要素を公開する
8. Character ChatのAI応答をTTS再生へ接続する
9. LAB、Chat、Discussionの旧 `/api/speak` 呼び出しを段階移行する

## 8.4 API契約

Request:

```json
{
  "text": "こんにちは",
  "voiceProfileId": "voice-risea-primary",
  "format": "wav"
}
```

Response:

```text
Content-Type: audio/wav
X-Voice-Profile-Id: voice-risea-primary
X-Voice-Provider: irodori-tts
```

Irodori backend URL、checkpoint path、captionはクライアントから直接送らない。

## 8.5 影響範囲

- Voice Registry
- Irodori Gradio Adapter
- `/api/speak`
- `/api/voice/generate`
- Character Chat送信後の再生
- LAB、Chat、Discussion、AI Chatの音声再生
- Voice backend設定
- 生成音声一時ファイル

## 8.6 変更候補ファイル

### 新規

```text
src/lib/types/voiceSynthesis.ts
src/lib/server/voice/voiceSynthesisService.ts
src/lib/server/voice/providers/irodoriProvider.ts
src/lib/client/voice/voicePlaybackController.ts
src/routes/api/voice/synthesize/+server.ts
```

### 変更

```text
src/lib/server/irodoriGradio.ts
src/lib/server/irodoriModels.ts
src/routes/api/voice/generate/+server.ts
src/routes/api/speak/+server.ts
src/lib/tts/irodori.ts
src/lib/api/voiceEngine.ts
src/routes/voice/+page.svelte
src/routes/character-chat/[conversationId]/+page.svelte
src/routes/lab/+page.svelte
src/routes/chat/+page.svelte
src/routes/ai-chat/+page.svelte
src/routes/discussion/+page.svelte
src/lib/server/settings.ts
```

### データ・生成物

```text
static/generated/voice/
static/audio/
data/voice-registry/
```

生成音声はRegistryのマスターサンプルと分離し、TTL付き一時ファイルまたはレスポンスstreamとして扱う。

## 8.7 リスク

| リスク | 影響 | 対策 |
|---|---|---|
| Irodori backend停止 | 音声なし・待ち時間 | timeout、キャンセル、テキストChat継続 |
| Gradio API payload変更 | 502 | Adapter内に閉じ込め、contract test追加 |
| 長い生成時間 | UI固着 | AbortController、進行表示、再生キュー |
| `/api/speak` と新APIの応答形式差 | 既存再生破損 | AdapterとFeature Flagで段階移行 |
| 生成WAV蓄積 | ディスク圧迫 | TTL cleanup、最大件数、stream優先 |
| 複数発話の競合 | 音声重複 | 単一Playback Controllerとcancel policy |

## 8.8 検証・完了条件

- `voiceProfileId` だけでIrodori音声が生成できる
- 無効・存在しないVoice Profileが明確な4xxになる
- backend停止時もChat本文は表示される
- 再生開始・終了・エラーイベントが一度ずつ発火する
- 同時発話時のキャンセルまたはキュー動作が仕様どおり
- Character Master、LAB REF、Chat MemoryにTTS設定が書き込まれない

## 8.9 ロールバック

コード:

1. `FEATURE_IRODORI_RUNTIME=false`
2. 新 `/api/voice/synthesize` 呼び出しを停止
3. 旧 `/api/speak` または音声なしモードへ戻す

データ:

- Voice RegistryはPhase 4のまま維持可能
- 一時生成音声は削除可能
- settingsのbackend URLは変更前バックアップへ戻す

サービス障害時の運用ロールバック:

- Voice Profileを一時無効化
- Character ChatをText-onlyへフォールバック
- Irodori backend復旧後に再有効化

---

# Phase 6: VRM LipSync接続

## 9.1 目的

Irodori-TTSの実際の再生音量を解析し、VRMの口形へ反映する。

現行 `AvatarViewer.svelte` の `isSpeaking` 中ランダム開閉を、音声振幅ベースのLipSyncへ置き換える。

## 9.2 現行状態

現行VRM Viewer:

- `isSpeaking` booleanを受け取る
- 発話中にランダムな `mouthTarget` を生成する
- VRM 1.0 `aa` / VRM 0.x `A` を更新する
- TTS再生Audio要素とは接続されていない

したがってPhase 6ではTTS生成ではなく、Phase 5で統一した再生コントローラーとの接続だけを担当する。

## 9.3 実施内容

1. `voicePlaybackController` のAudio要素をWeb Audio APIへ接続する
2. `AnalyserNode` からRMSまたは平均振幅を算出する
3. ノイズゲート、gain、attack、releaseを適用する
4. `LipSyncFrame` をAvatar Runtimeへ配信する
5. `AvatarViewer` に `mouthOpen` またはviseme入力を追加する
6. 実振幅がある場合はランダム口パクを停止する
7. 音声解析不可時だけbooleanフォールバックを使用する
8. 再生終了・停止・エラー時に口を必ず閉じる

## 9.4 データ契約

第一段階は単一母音ではなく開口量だけを扱う。

```ts
type LipSyncFrame = {
  speaking: boolean;
  amplitude: number;
  mouthOpen: number;
  timestamp: number;
};
```

`mouthOpen` は `0.0` から `1.0`。

将来visemeを追加する場合:

```ts
type VrmViseme = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
```

Phase 6初期実装では `aa` の開口量制御に限定し、音素推定は別Phaseとする。

## 9.5 影響範囲

- Voice Playback Controller
- VRM Viewer
- LABのVRM表示
- Character ChatのVRM表示を追加する場合のAvatar Stage
- Web Audio API
- `isSpeaking` とAvatar WebSocket同期
- 再生キャンセル・エラー処理

## 9.6 変更候補ファイル

### 新規

```text
src/lib/client/audio/audioAmplitudeAnalyzer.ts
src/lib/avatar/lipSyncController.ts
src/lib/types/lipSync.ts
src/lib/stores/avatarRuntimeStore.svelte.ts
```

### 変更

```text
src/lib/client/voice/voicePlaybackController.ts
src/lib/components/AvatarViewer.svelte
src/routes/lab/+page.svelte
src/routes/character-chat/[conversationId]/+page.svelte
src/lib/ws/avatarSocket.ts
```

必要に応じて:

```text
src/lib/components/Avatar.svelte
src/lib/components/PNGTuberViewer.svelte
```

PNG TuberとVRMでAnalyzerは共有してよいが、描画ロジックは共有しない。

## 9.7 VRM制御仕様

推奨初期値:

```text
FFT size:       1024
Noise gate:     0.02
Gain:           2.5
Attack:         0.35
Release:        0.18
Update rate:    requestAnimationFrame
Mouth range:    0.0 - 0.9
```

計算例:

```text
normalized = clamp((rms - noiseGate) * gain, 0, 1)
mouthOpen  = lerp(previous, normalized, normalized > previous ? attack : release)
```

値は定数直書きではなく、LipSync設定として一箇所に集約する。

## 9.8 リスク

| リスク | 影響 | 対策 |
|---|---|---|
| AudioContextがautoplay制限で停止 | 口が動かない | ユーザー操作時にresume、boolean fallback |
| 同じAudio要素を複数回Source化 | Web Audio例外 | SourceNodeをControllerで一度だけ生成 |
| 小音量・無音区間で口が震える | 不自然 | noise gate、release smoothing |
| VRMごとにExpression名が異なる | 口が動かない | `aa/A` fallbackとロード時検出 |
| 再生停止後も口が開く | 表示不整合 | finallyで0へリセット |
| 毎フレームSvelte state更新 | 描画負荷 | Viewer内部または専用storeで最小更新 |
| WebSocket speakingとローカル振幅の競合 | 状態が揺れる | 振幅を正、WSはboolean状態通知だけに限定 |

## 9.9 検証・完了条件

- Irodori音声の強弱に応じてVRM開口量が変化する
- 無音区間で口が閉じる
- 再生終了、停止、エラーで `mouthOpen=0`
- VRM未ロードでもTTS再生が失敗しない
- AudioContext利用不可時は従来boolean口パクへ戻る
- 連続10発話でAudioContext/SourceNodeリークがない
- VRM ViewerがVoice RegistryやTTS APIを直接参照しない

## 9.10 ロールバック

コード:

1. `FEATURE_VRM_AUDIO_LIPSYNC=false`
2. `AvatarViewer` を従来の `isSpeaking` ランダム口パクへ戻す
3. Audio Analyzerの購読を停止する

データ:

- Phase 6は永続データを変更しないため復元不要
- Voice RegistryとIrodori接続はそのまま利用可能

障害時:

- Analyzerだけ停止し、TTS再生を継続する
- `mouthOpen` を0へリセットする
- VRM表示自体は継続する

---

# 10. 横断的な変更ファイル一覧

## Character系

```text
src/lib/server/characterRegistry.ts
src/lib/server/characterMasterRepository.ts
src/lib/server/characterChatRepository.ts
src/lib/types/characterMaster.ts
src/lib/types/characterChat.ts
src/routes/characters/+page.svelte
src/routes/characters/[id]/chat/+page.svelte
src/routes/character-chat/[conversationId]/+page.svelte
src/routes/api/characters/**
src/routes/api/character-master/**
src/routes/api/character-chat/**
```

## LAB系

```text
src/routes/lab/+page.svelte
src/lib/lab/types/labReference.ts
src/lib/lab/stores/labReferenceStore.svelte.ts
src/routes/api/yaml-image/+server.ts
src/routes/api/lab-chat/+server.ts
```

## Voice系

```text
src/routes/voice/+page.svelte
src/lib/types/voiceRegistry.ts
src/lib/server/voiceRegistryRepository.ts
src/lib/server/irodoriGradio.ts
src/lib/server/irodoriModels.ts
src/lib/server/settings.ts
src/lib/api/voiceEngine.ts
src/lib/tts/irodori.ts
src/routes/api/speak/+server.ts
src/routes/api/voice/**
src/routes/api/voice-registry/**
```

## VRM系

```text
src/lib/components/AvatarViewer.svelte
src/lib/ws/avatarSocket.ts
src/lib/client/voice/voicePlaybackController.ts
src/lib/client/audio/audioAmplitudeAnalyzer.ts
src/lib/avatar/lipSyncController.ts
src/lib/types/lipSync.ts
```

# 11. バックアップ計画

各Phase開始前に次を保存する。

```text
data/project/character-assets/
data/project/characters/
data/character-chat/
data/settings.json
data/voice-registry/
static/voice_library/
```

推奨バックアップ単位:

```text
backups/migration/<timestamp>/phase-<n>/
├─ manifest.json
├─ file-hashes.json
└─ data/
```

`file-hashes.json` には相対パス、サイズ、SHA-256を記録する。

API keyを含む `settings.json` はリポジトリへコミットせず、アクセス制限された場所へ保存する。

# 12. 各Phase共通のリリースゲート

1. `npm run check` が成功する
2. 対象ドメインの単体テストが成功する
3. データ移行dry-runが成功する
4. 移行前後の件数・hash検証が成功する
5. Feature Flag OFFで旧動作が維持される
6. Feature Flag ONで新動作が受け入れ条件を満たす
7. ブラウザE2Eで不要なクロスドメインAPI呼び出しがない
8. ロールバック手順をステージング環境で一度実行する

# 13. 推奨コミット分割

各Phaseを一つの巨大コミットにしない。

```text
1. types-and-contracts
2. repository-and-api
3. migration-script
4. UI-switch
5. old-writer-disable
6. tests-and-docs
7. legacy-removal
```

データ移行コミットとアプリコード変更コミットを分ける。これにより、コードだけのロールバックとデータだけの復元を独立して行える。

# 14. 最終受け入れ条件

- Character LibraryはRuntime読み取り専用
- LAB REFはLABセッションに閉じている
- Character Chatは独立Actor/Conversation/Memoryを持つ
- Voice Profileは独立Voice Registryにある
- Character Chat ActorはVoice Registry IDを参照する
- Irodori-TTSは統一Voice Runtime経由で呼ばれる
- VRMは実際の再生音量でLipSyncする
- Master、LAB、Chat、Voice、Avatar間に禁止依存がない
- 各PhaseをFeature Flagで独立ロールバックできる

本書は段階移行計画であり、アプリケーションコードおよび既存データは変更していない。
