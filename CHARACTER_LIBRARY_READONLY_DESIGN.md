# Character Library 読み取り専用化・データ分離設計

## 1. 目的

Character Libraryを、アプリ実行中に変更されない読み取り専用のキャラクターマスターへ変更する。

同時に、次の三つの責務と保存領域を分離する。

1. Character Library: キャラクターの正規マスター
2. LAB `referenceImages`: 生成作業中の一時的な画像参照
3. Character Chat: 会話履歴と会話によって変化する記憶

本設計では、マスターのIDを参照元として記録することは許可するが、可変データの共有、同じJSONへの書き込み、別ドメインからの更新は許可しない。

## 2. 現状の問題

### 2.1 Character Libraryがマスター兼編集画面になっている

`src/routes/characters/+page.svelte` は一覧取得だけでなく、次の更新操作を持つ。

- `POST /api/characters` による登録
- `PUT /api/characters/<id>` によるプロフィール更新
- `PUT /api/characters/<id>/reference` による画像更新
- Character YAMLの生成と保存

Character Libraryが「閲覧対象」と「登録・編集対象」の両方になっている。

### 2.2 Character Registryに異なる責務のデータが同居している

現在の保存構造では、マスターデータとChatデータが同じディレクトリにある。

```text
data/project/character-assets/<id>/
├─ profile.json       # マスター
├─ reference.png      # マスター
├─ sheet.png          # マスター
├─ chat.json          # Chatランタイム
└─ memory.json        # Chatランタイム
```

`src/lib/server/characterRegistry.ts` も、マスターの登録・更新・削除と、Chat履歴・Memoryの更新を同じモジュールで担当している。

### 2.3 LABからCharacter Registryを更新できる

LABには次の永続化処理が存在する。

- `registerReferenceImageCharacter()`
- `updateRegisteredCharacter()`
- `saveCharacterBible()`
- `handleCharacterRegistryUpload()`

これらはLABの作業状態からCharacter Registryへ書き込むため、作業用REFとマスターの境界を曖昧にしている。

### 2.4 Character ChatのMemoryがLABへ流入している

LABの `loadStoryCharacterMemories()` は `/api/characters/story-context` を呼び、Character Chatで更新されたMemoryをStory生成へ渡している。

```text
Character Chat memory.json
        ↓
getCharacterStoryContexts()
        ↓
/api/characters/story-context
        ↓
LAB Story生成
```

これはCharacter ChatデータとLABデータの完全分離に反する。

### 2.5 Character ChatがLAB用APIを利用している

Character Chatの応答生成は `/api/lab-chat` を呼んでいる。

推論処理そのものは共有可能だが、`lab-chat` というLAB所有のAPIをCharacter Chatが利用する構造は、責務と依存方向を不明確にする。

## 3. 設計原則

### 3.1 Single Writer

各データ領域の書き込み主体を一つに限定する。

| データ領域 | Writer |
|---|---|
| Character Master | オフラインの管理・インポート処理のみ |
| LAB Reference Session | LAB Reference Storeのみ |
| Character Chat | Character Chat Storeのみ |

### 3.2 Runtime Read-only Master

通常のアプリ実行中、Character MasterにはGET以外の操作を提供しない。

- UIに登録、編集、画像変更、削除を表示しない
- Runtime APIは `POST`、`PUT`、`PATCH`、`DELETE` を受け付けない
- サーバーサービスは読み取り関数だけを公開する

### 3.3 Copy on Use

LABとCharacter Chatは、Character Masterのオブジェクトを直接保持・更新しない。

マスターを使用するときは、用途ごとのスナップショットDTOへ値をコピーする。

```text
CharacterMaster
   ├─ copy → LabReference
   └─ copy → ChatActorSnapshot
```

コピー後の変更はマスターへ書き戻さない。

### 3.4 ID参照とデータ共有を区別する

`sourceMasterId` のような参照IDは、出自確認のために保持してよい。

ただし、次は禁止する。

- LABデータからCharacter Masterを更新する
- Chat MemoryからCharacter Masterを更新する
- LABがChat Memoryを読む
- ChatがLAB `referenceImages` を読む
- マスター配下へChatまたはLABのファイルを保存する

### 3.5 Stateless Inference

LLMや画像解析のプロバイダー呼び出しは、どの機能からも利用できる副作用のない推論サービスとする。

推論サービスは、Character Master、LAB、Chatのファイルを直接読み書きしない。必要なコンテキストは呼び出し側が明示的に渡す。

## 4. 目標アーキテクチャ

```text
                         ┌──────────────────────────┐
                         │ Character Master         │
                         │ runtime read-only        │
                         └────────────┬─────────────┘
                                      │ GET / snapshot
                         ┌────────────┴─────────────┐
                         │                          │
              ┌──────────▼──────────┐    ┌─────────▼──────────┐
              │ LAB Reference       │    │ Character Chat     │
              │ Session/Workspace   │    │ Runtime            │
              └──────────┬──────────┘    └─────────┬──────────┘
                         │                          │
                         └────────────┬─────────────┘
                                      │ request only
                           ┌──────────▼───────────┐
                           │ Stateless Inference │
                           └──────────────────────┘
```

LABとCharacter Chatの間には、API、ストア、JSON、localStorage、IndexedDBを含む直接依存を置かない。

## 5. 保存領域

### 5.1 Character Master

推奨保存先:

```text
data/character-master/
├─ manifest.json
└─ characters/
   └─ <master-id>/
      ├─ profile.json
      ├─ reference.png
      ├─ sheet.png
      └─ visual.yaml
```

`manifest.json` は一覧の順序、公開状態、スキーマバージョンを管理する。

例:

```json
{
  "schemaVersion": 1,
  "characters": [
    {
      "id": "n-01",
      "enabled": true,
      "sortOrder": 10
    }
  ]
}
```

`profile.json` の例:

```json
{
  "schemaVersion": 1,
  "id": "n-01",
  "name": "N-01",
  "role": "主人公",
  "description": "...",
  "referenceAsset": "reference.png",
  "sheetAsset": "sheet.png",
  "visualAsset": "visual.yaml"
}
```

Runtimeではこの領域への書き込みを禁止する。

### 5.2 LAB Reference Session

LABのREF IMAGEは、Character Masterとは無関係な作業用データとして扱う。

第一段階では現状どおりブラウザメモリー上だけに保持する。

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

重要な点:

- `id` はLAB内で生成するUUIDであり、Character Master IDを主キーにしない
- `sourceMasterId` は出自情報のみ
- `name`、`role`、`description` はコピーされた値
- LAB内で編集してもCharacter Masterへ反映しない
- ×削除はLAB stateだけを更新する
- LABからMaster更新APIを呼ばない

ページ再読み込み後も復元する要件が生じた場合は、専用のIndexedDBへ保存する。

```text
IndexedDB: ai-vtuber-lab
Object Store: reference-sessions
Key: <lab-session-id>
```

Character Master、Character Chatと同じIndexedDBまたはlocalStorageキーを使わない。

### 5.3 Character Chat

推奨保存先:

```text
data/character-chat/
├─ actors/
│  └─ <actor-id>/
│     ├─ actor.json
│     └─ memory.json
└─ conversations/
   └─ <conversation-id>/
      ├─ conversation.json
      └─ messages.json
```

`actor.json` はChat開始時のマスタースナップショットを持つ。

```json
{
  "schemaVersion": 1,
  "id": "actor-...",
  "sourceMasterId": "n-01",
  "displayName": "N-01",
  "role": "主人公",
  "description": "...",
  "createdAt": "...",
  "masterRevision": "..."
}
```

`memory.json` はChatだけが更新する。

```json
{
  "schemaVersion": 1,
  "actorId": "actor-...",
  "personality": [],
  "speechStyle": [],
  "likes": [],
  "dislikes": [],
  "updatedAt": "..."
}
```

`conversation.json` の例:

```json
{
  "schemaVersion": 1,
  "id": "conversation-...",
  "actorId": "actor-...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

ChatデータはCharacter Masterのディレクトリへ保存しない。マスターが削除・差し替えされた場合も、既存Chatはスナップショットにより再現できる。

## 6. 型と所有権

### 6.1 Character Master型

```ts
type CharacterMaster = {
  id: string;
  name: string;
  role: string;
  description: string;
  hasReference: boolean;
  hasSheet: boolean;
  visualYaml: string;
  revision: string;
};
```

所有者: `characterMasterRepository`

公開操作:

- `listCharacterMasters()`
- `getCharacterMaster(id)`
- `getCharacterMasterReference(id)`

書き込み関数はRuntimeモジュールに定義しない。

### 6.2 LAB型

```ts
type LabReferenceSession = {
  id: string;
  references: LabReference[];
  createdAt: string;
  updatedAt: string;
};
```

所有者: `labReferenceStore`

公開操作:

- `addUploadedReference()`
- `addMasterSnapshot()`
- `updateReferenceMetadata()`
- `removeReference()`
- `clearSession()`

Character Master RepositoryやChat Storeへの書き込み権限を持たない。

### 6.3 Character Chat型

```ts
type ChatActor = {
  id: string;
  sourceMasterId?: string;
  profileSnapshot: {
    name: string;
    role: string;
    description: string;
    masterRevision?: string;
  };
};
```

所有者: `characterChatRepository`

公開操作:

- `createActorFromMasterSnapshot()`
- `createConversation()`
- `listMessages()`
- `appendMessage()`
- `clearConversation()`
- `getActorMemory()`
- `saveActorMemory()`

LABの型をimportしない。

## 7. API設計

### 7.1 Character Master API

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/character-master` | 一覧取得 |
| `GET` | `/api/character-master/<id>` | 詳細取得 |
| `GET` | `/api/character-master/<id>/reference` | 参照画像取得 |
| `GET` | `/api/character-master/<id>/sheet` | シート画像取得 |

同じパスへの `POST`、`PUT`、`PATCH`、`DELETE` は `405 Method Not Allowed` を返す。

旧 `/api/characters` は移行期間終了後に廃止する。

### 7.2 LAB Reference API

LAB参照をメモリーだけで管理する場合、専用の永続化APIは不要。

Character Masterから追加する処理:

1. `GET /api/character-master/<id>` を呼ぶ
2. `GET /api/character-master/<id>/reference` を呼ぶ
3. LAB側で新しい `LabReference.id` を生成する
4. 取得値を `LabReference` へコピーする
5. `referenceImages` 相当のLAB専用stateへ追加する

LABからCharacter Masterへの書き戻しは行わない。

将来サーバー保存する場合は `/api/lab/sessions/<sessionId>/references` を使用し、Character Master APIとは分ける。

### 7.3 Character Chat API

| Method | Path | 用途 |
|---|---|---|
| `POST` | `/api/character-chat/actors` | マスタースナップショットからChat Actorを作成 |
| `GET` | `/api/character-chat/actors/<actorId>` | Actor取得 |
| `GET` | `/api/character-chat/actors/<actorId>/memory` | Chat Memory取得 |
| `PUT` | `/api/character-chat/actors/<actorId>/memory` | Chat Memory更新 |
| `POST` | `/api/character-chat/conversations` | Conversation作成 |
| `GET` | `/api/character-chat/conversations/<id>/messages` | 履歴取得 |
| `POST` | `/api/character-chat/conversations/<id>/messages` | 履歴追加 |
| `DELETE` | `/api/character-chat/conversations/<id>/messages` | 履歴クリア |

Chat APIはLAB stateやLAB保存領域を参照しない。

### 7.4 共通推論API

`/api/lab-chat` を共通処理として使い続けず、機能非依存の名称と契約へ移す。

推奨:

```text
POST /api/inference/chat
POST /api/inference/vision
```

このAPIは入力から応答を生成するだけで、履歴、Memory、Master、LAB REFを保存しない。

## 8. UI設計

### 8.1 Character Library

残す機能:

- 一覧表示
- 検索
- 詳細表示
- 参照画像・シート・YAMLの閲覧
- `USE IN LAB`
- `START CHAT`

削除する機能:

- `+ NEW CHARACTER`
- プロフィール編集
- 画像変更
- YAML生成と保存
- 削除

画面上に `READ ONLY MASTER` を表示し、Masterであることを明示する。

`USE IN LAB` はマスターを変更せず、LABへスナップショットを渡す。

`START CHAT` は既存のChat Actorを選ぶか、新しいChat Actorスナップショットを作る。

### 8.2 LAB

LABから次を削除する。

- `+ CHARACTER登録`
- `registerReferenceImageCharacter()`
- `updateRegisteredCharacter()`
- `saveCharacterBible()` によるMaster更新
- Registryプロフィールのインライン更新

残すREF追加方法:

- ローカル画像の一時アップロード
- 読み取り専用Character Masterから `USE AS REF`

表示を次の二領域に明確化する。

```text
CHARACTER MASTER
  [N-01] [USE AS REF]

SESSION REFERENCES
  [uploaded-a] [N-01 snapshot] [x]
```

`SESSION REFERENCES` の変更はMasterへ影響しない旨を表示する。

### 8.3 Character Chat

画面URLはマスターIDではなく、Chat ActorまたはConversation IDを主キーにする。

推奨:

```text
/character-chat/<conversation-id>
```

画面には次を表示する。

- `Based on Character Master: N-01`
- Master snapshot revision
- Chat専用Memory
- Chat専用会話履歴

Chat MemoryがMasterやLABへ反映されないことを明記する。

## 9. 禁止依存

次の依存を静的ルールとして禁止する。

| 呼び出し元 | 禁止対象 |
|---|---|
| LAB | `characterChatRepository` |
| LAB | `/api/character-chat/*` |
| LAB | Masterの更新API |
| Character Chat | `labReferenceStore` |
| Character Chat | `/api/lab/*` |
| Character Chat | `referenceImages` 型 |
| Character Master | LABまたはChatのストア |

許可する依存:

```text
LAB             → Character Master Reader
Character Chat  → Character Master Reader
LAB             → Stateless Inference
Character Chat  → Stateless Inference
```

## 10. `/api/characters/story-context` の扱い

現行APIはCharacter MasterプロフィールとCharacter Chat Memoryを結合してLABへ返すため、廃止する。

LABがStory生成でキャラクター情報を必要とする場合は、次のどちらかに限定する。

1. 現在の `LabReference` スナップショットを使用する
2. 読み取り専用Character Masterプロフィールを取得する

Character Chatの `memory.json` は使用しない。

Chatで育った人格をStoryへ明示的に持ち込みたい将来要件がある場合は、自動共有ではなくユーザー操作によるエクスポート・インポート機能として設計する。

```text
Chat Memory
  ↓ explicit export
portable-chat-profile.json
  ↓ explicit import
LAB session-local context
```

この場合もMasterは更新しない。

## 11. Character Masterの更新方法

読み取り専用は「更新不能」ではなく、「通常Runtimeから更新しない」という意味とする。

更新方法はアプリ本体から分離する。

候補:

1. Git管理されたファイルを直接レビューして更新
2. 専用CLIで検証・インポート
3. 別権限の管理アプリを将来追加

推奨は専用CLIである。

```text
npm run character-master:validate
npm run character-master:import -- <source-directory>
```

CLIは次を検証する。

- ID形式と重複
- JSON Schema
- 必須画像の存在
- YAML構造
- アセットパスのディレクトリ外参照
- manifestとの整合性

通常の `npm run dev` からCLIの書き込み処理は呼ばない。

## 12. 移行設計

### Phase 0: バックアップと棚卸し

- `data/project/character-assets` と `data/project/characters` をバックアップ
- 各IDについてMaster、Chat、Memoryの存在を一覧化
- 重複ID、欠損画像、壊れたJSONを検出

### Phase 1: Master Readerを分離

- `characterRegistry.ts` から読み取り処理を `characterMasterRepository.ts` へ分離
- 新しい `/api/character-master` GET APIを追加
- Character LibraryとLABの一覧取得を新APIへ切り替え
- この段階では旧APIを互換用に残す

### Phase 2: Character Libraryを読み取り専用化

- Character Libraryから作成・編集・画像更新UIを削除
- RuntimeのMaster更新APIを `405` に変更
- LABからMaster登録・更新処理を削除

### Phase 3: Chatデータを物理分離

次を移動する。

```text
旧:
data/project/character-assets/<id>/chat.json
data/project/character-assets/<id>/memory.json

新:
data/character-chat/actors/<actor-id>/memory.json
data/character-chat/conversations/<conversation-id>/messages.json
```

既存の `<id>` ごとにChat Actorと既定Conversationを一つ生成する。

移行マッピングを保存する。

```json
{
  "n-01": {
    "actorId": "actor-n-01-legacy",
    "conversationId": "conversation-n-01-legacy"
  }
}
```

### Phase 4: Chat APIを分離

- `/api/characters/<id>/chat` を `/api/character-chat/conversations/...` へ移行
- `/api/characters/<id>/memory` を `/api/character-chat/actors/...` へ移行
- Character Chat画面の主キーをConversation IDへ変更
- `/api/lab-chat` を共通推論APIへ置き換え

### Phase 5: LABとChatの結合を除去

- `/api/characters/story-context` を廃止
- `loadStoryCharacterMemories()` を削除
- LAB Story生成からChat Memory文脈を除去
- LABの型、API、保存処理にChat関連importがないことを確認

### Phase 6: 旧APIと旧ファイルを廃止

- 旧 `/api/characters` 更新系を削除
- 旧Chat/Memory APIを削除
- 移行確認後、Master配下の `chat.json` と `memory.json` を削除
- 互換コードとlegacy migrationを削除

## 13. 互換性と削除ポリシー

移行中にデータを二重書きしない。

二重書きは不整合時にどちらが正か判定できなくなるため、PhaseごとにWriterを一つへ切り替える。

旧APIの扱い:

- 読み取りAPIは移行期間中のみ新APIへ委譲可能
- 更新APIは早期に `410 Gone` または `405 Method Not Allowed` とする
- レスポンスに廃止予定ヘッダーを付与する

Master削除時のChat:

- Chat Actorはスナップショットを保持するため継続可能
- `sourceMasterId` は履歴情報として残す
- 新しいMaster画像の自動同期はしない

## 14. セキュリティと整合性

- Masterのファイルパスは固定ルート内に解決する
- Master DTOを `Readonly` として扱う
- APIレスポンスのオブジェクトをそのまま可変stateに入れず、用途別DTOへ変換する
- ChatとLABのID名前空間を分ける
- JSONに `schemaVersion` を持たせる
- すべての書き込みは一時ファイルからのatomic renameを推奨する
- 移行処理はdry-runと結果レポートを提供する

## 15. テスト方針

### 15.1 Character Master

- 一覧・詳細・画像のGETが成功する
- `POST/PUT/PATCH/DELETE` が `405` になる
- Character Library操作後にMasterファイルのmtimeとhashが変わらない
- LAB操作後にMasterファイルのmtimeとhashが変わらない
- Chat操作後にMasterファイルのmtimeとhashが変わらない

### 15.2 LAB

- Masterの `USE AS REF` で `LabReference` が一件追加される
- 追加時に新しいLAB UUIDが発行される
- LABで名前や役割を変更してもMaster DTOとファイルが変わらない
- ×削除でLAB stateからだけ消える
- ページ再読み込み時の仕様が、メモリーのみなら空、IndexedDB採用時なら同一セッションだけ復元となる
- LABからChat APIへのリクエストが一件も発生しない

### 15.3 Character Chat

- MasterからActorを作成するとプロフィールがスナップショットされる
- 会話追加でChat領域だけが変更される
- Memory更新でChat領域だけが変更される
- LABのREF追加・削除がChat履歴とMemoryに影響しない
- Chat Actor作成後にMasterが変化しても既存Chatのプロフィールは自動変更されない

### 15.4 依存境界

静的テストで次を検査する。

```text
src/routes/lab        → characterChatRepository importなし
src/routes/character-chat → labReferenceStore importなし
characterMasterRepository → writeFile/rm/mkdir importなし
```

E2Eではネットワークログを確認し、LABから `/api/character-chat`、Chatから `/api/lab` が呼ばれないことを検証する。

## 16. 受け入れ条件

以下をすべて満たした時点で分離完了とする。

1. Character Libraryに登録・編集・削除操作がない
2. RuntimeからCharacter Masterを更新するAPIがない
3. Masterディレクトリに `chat.json` と `memory.json` がない
4. LABにCharacter Masterの登録・更新処理がない
5. LAB `referenceImages` はLAB専用IDと型を使用する
6. Character ChatはChat専用Actor、Conversation、Memoryを使用する
7. LABがCharacter Chat Memoryを参照しない
8. Character ChatがLAB APIまたはLAB stateを参照しない
9. 共通推論サービスに永続化の副作用がない
10. LAB・Chatの操作前後でCharacter Masterのhashが変化しない

## 17. 推奨実装順

最初に物理ファイルを移動するのではなく、依存方向を変えてからデータを移行する。

推奨順:

1. 読み取り専用 `characterMasterRepository` とGET APIを追加
2. Character LibraryとLABの読み取りを新APIへ変更
3. LABのMaster書き込み機能を撤去
4. Character Libraryの編集機能を撤去
5. Chat RepositoryとChat APIを新設
6. Chatデータを移行
7. LABへのChat Memory流入を停止
8. 共通推論APIへ移行
9. 旧APIと旧保存ファイルを削除

この順序なら、各段階でWriterが明確になり、既存データを失わずに分離できる。

## 18. 設計判断

本設計では次を採用する。

- Character LibraryはCharacter Masterの読み取り専用ビュー
- LAB REFはセッション用コピー
- Character ChatはMasterから作られた独立Actor
- Master、LAB、Chatで保存ディレクトリ、API、型、Repositoryを分離
- 共通化するのは副作用のない推論処理のみ
- Chat MemoryをLABへ自動共有しない
- Master更新はRuntime外の管理フローに限定

本書は設計案であり、アプリケーションコードおよび既存データは変更していない。
