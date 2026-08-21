# Character Library / Character Chat / LAB REF 分離 実装前レポート

## 1. 結論

現在はCharacter Chat専用のキャラクター一覧が存在しない。

`/characters` のCharacter Libraryカード一覧が、そのままCharacter Chatの入口と一覧を兼ねている。カードの `Character Chat` ボタンはLibraryのキャラクターIDを `/characters/<id>/chat` へ渡し、Chat画面は表示のたびにCharacter Libraryと同じ `/api/characters/<id>` からプロフィールを読み直す。

そのため、Character Libraryの名前、役割、説明、画像を変更すると、Character Chatにも次回ロード時に自動反映される。

最小変更で分離するには、次の構成が適切である。

1. Character Libraryは現行データを使った読み取り専用画面にする
2. `data/character-chat/characters/<id>/` をChat専用データソースとして追加する
3. `/character-chat` にChat専用一覧画面を追加する
4. 既存 `/characters/<id>/chat` 画面は残し、取得APIだけChat専用APIへ切り替える
5. LibraryからChatへ追加するときは、一回限りの明示的スナップショットコピーにする
6. コピー後はLibraryからChatへ同期しない
7. LAB `referenceImages` は現在のページstateを維持し、Master/ChatへのWriterだけを撤去する

この方法なら、Chat画面の全面作り直しやConversation ID導入を後回しにできる。

## 2. 現在Character Chat一覧を生成しているコード

### 2.1 専用一覧は存在しない

`src/routes` 配下にCharacter Chat専用一覧ページは存在しない。

現在存在する関連ページは次の二つである。

```text
src/routes/characters/+page.svelte
src/routes/characters/[id]/chat/+page.svelte
```

### 2.2 実質的なChat一覧

実質的なChatキャラクター一覧は `src/routes/characters/+page.svelte` の `characters` 配列である。

処理フロー:

```text
src/routes/characters/+page.svelte
        ↓ loadCharacters()
GET /api/characters
        ↓
src/routes/api/characters/+server.ts
        ↓ listCharacters()
src/lib/server/characterRegistry.ts
        ↓
data/project/character-assets/<id>/profile.json
        ↓
CharacterLibraryCard
```

カードは `src/lib/components/characters/CharacterLibraryCard.svelte` で描画される。

同コンポーネントの `Character Chat` ボタンが `onChat` を呼ぶ。

親ページは次のURLへ遷移する。

```ts
window.location.href = `/characters/${encodeURIComponent(character.id)}/chat`
```

したがって現状では、Character Libraryに存在するキャラクターだけがChatの候補になり、Library一覧がChat一覧を兼ねている。

## 3. 現在のCharacter Chatデータフロー

Chat画面は `src/routes/characters/[id]/chat/+page.svelte` である。

初期ロード時に次の3 APIを同時に呼ぶ。

```text
GET /api/characters/<id>
GET /api/characters/<id>/chat
GET /api/characters/<id>/memory
```

画像は別途次から取得する。

```text
GET /api/characters/<id>/reference
```

### 3.1 プロフィール

```text
GET /api/characters/<id>
        ↓
getCharacter(id)
        ↓
data/project/character-assets/<id>/profile.json
```

Chat画面の名前、役割、説明、画像はCharacter Libraryと同じファイルを毎回読む。

### 3.2 Chat履歴

```text
GET/POST/DELETE /api/characters/<id>/chat
        ↓
getCharacterChat()
appendCharacterChat()
clearCharacterChat()
        ↓
data/project/character-assets/<id>/chat.json
```

### 3.3 Chat Memory

```text
GET/PUT /api/characters/<id>/memory
        ↓
getCharacterMemory()
saveCharacterMemory()
        ↓
data/project/character-assets/<id>/memory.json
```

プロフィール、画像、Chat履歴、Memoryが同じCharacter Registryディレクトリに同居している。

## 4. Character Libraryとの依存箇所

### 4.1 一覧依存

| 箇所 | 依存内容 |
|---|---|
| `src/routes/characters/+page.svelte` | `/api/characters` の一覧をChat候補として表示 |
| `CharacterLibraryCard.svelte` | LibraryカードにChat開始ボタンを内包 |
| `onChat` | Library IDをChat URLへ直接渡す |

### 4.2 プロフィール依存

`src/routes/characters/[id]/chat/+page.svelte` は `/api/characters/<id>` を呼ぶため、Libraryプロフィール変更がChatへ自動反映される。

### 4.3 画像依存

Chat画面は `/api/characters/<id>/reference` を毎回読むため、Library画像変更もChatへ自動反映される。

### 4.4 存在確認依存

`getCharacterChat()`、`getCharacterMemory()`、`saveCharacterMemory()` は処理前に `getCharacter(id)` を呼ぶ。

このため、Library側のキャラクターが削除されると、同じディレクトリにChatデータが残っていてもChat APIは `character not found` になる。

### 4.5 物理保存依存

`deleteCharacter()` は次をまとめて削除する。

```text
data/project/character-assets/<id>/
data/project/characters/<id>.yaml
```

Chat履歴とMemoryも同じ `<id>` ディレクトリ内にあるため、Library削除がChatデータ削除になる。

### 4.6 LABへの逆依存

LABの `loadStoryCharacterMemories()` は `/api/characters/story-context` を通じ、Character Chat MemoryをStory生成へ渡している。

```text
Chat memory.json
        ↓
getCharacterStoryContexts()
        ↓
/api/characters/story-context
        ↓
LAB Story生成
```

これはLAB REFをセッション専用にする方針と矛盾する。

## 5. LAB REFの現状

`referenceImages` 自体は既に `src/routes/lab/+page.svelte` のページstateである。

```ts
let referenceImages = $state<ReferenceImage[]>([]);
```

通常のREF追加と削除はセッション内で完結している。

しかし同じ画面に次のCharacter Library Writerが存在する。

```text
registerReferenceImageCharacter()
handleCharacterRegistryUpload()
updateRegisteredCharacter()
saveCharacterBible()
```

さらにChat Memory Readerも存在する。

```text
loadStoryCharacterMemories()
/api/characters/story-context
```

したがってLAB REF分離で必要なのは、新しい永続ストアの導入ではなく、Master WriterとChat Readerの撤去である。

## 6. 最小変更の目標構造

```text
data/project/character-assets/       Character Library Master
data/project/characters/             Character Library Visual YAML

data/character-chat/characters/      Character Chat専用
└─ <chat-character-id>/
   ├─ profile.json
   ├─ reference.png
   ├─ chat.json
   └─ memory.json

LAB referenceImages                  ブラウザメモリーのみ
```

### 6.1 Chatプロフィール

Chat専用 `profile.json` はLibraryから初回追加時にコピーする。

例:

```json
{
  "schemaVersion": 1,
  "id": "n-01",
  "sourceCharacterId": "n-01",
  "name": "N-01",
  "role": "主人公",
  "description": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`sourceCharacterId` は出自表示用であり、再同期キーとして使わない。

### 6.2 Chat画像

LibraryからChatへ追加するときに `reference.png` をコピーする。

Chat画面は以後 `data/character-chat/characters/<id>/reference.png` だけを読む。

Library画像が変更されてもChat画像は変化しない。

### 6.3 Chat一覧

Chat専用一覧は次から生成する。

```text
data/character-chat/characters/*/profile.json
        ↓
listChatCharacters()
        ↓
GET /api/chat-characters
        ↓
src/routes/character-chat/+page.svelte
```

### 6.4 LibraryからChatへの追加

同期ではなく明示的な一回コピーとする。

```text
Character Library
        ↓ ADD TO CHAT
POST /api/chat-characters
  { sourceCharacterId: "n-01" }
        ↓
profile.json と reference.png をコピー
        ↓
以後は独立
```

既に同じIDがChatへ存在する場合は `409 Conflict` とし、自動上書きしない。

Library変更をChatへ反映したい場合も自動同期は行わない。将来必要なら、確認付きの「スナップショットを再作成」操作を別機能として追加する。

## 7. 最小変更で実現する方法

## Step 1: Chat専用Repositoryを追加

新しい `characterChatRepository.ts` に次だけを移す。

```text
listChatCharacters()
getChatCharacter()
createChatCharacterFromLibrary()
getChatReferenceDataUrl()
getCharacterChat()
appendCharacterChat()
clearCharacterChat()
getCharacterMemory()
saveCharacterMemory()
```

既存関数名は可能な範囲で維持し、呼び出し側の変更量を抑える。

保存ルートだけを次へ変更する。

```text
data/character-chat/characters/<id>/
```

## Step 2: Chat専用APIを追加

追加するAPI:

```text
GET  /api/chat-characters
POST /api/chat-characters
GET  /api/chat-characters/<id>
GET  /api/chat-characters/<id>/reference
GET/POST/DELETE /api/chat-characters/<id>/chat
GET/PUT /api/chat-characters/<id>/memory
```

既存Chat画面のAPIパスを置換するだけで、画面構造は維持できる。

## Step 3: Chat専用一覧を追加

新規ページ:

```text
src/routes/character-chat/+page.svelte
```

このページは `GET /api/chat-characters` だけを使用する。

カード操作:

- Chatを開く
- Chat専用プロフィールを編集する場合は将来追加
- Chatから削除する場合もLibraryには影響させない

最初の実装では一覧とChat開始だけに限定する。

## Step 4: 既存Chat画面の取得先だけ変更

URLは最小変更のため当面維持する。

```text
/characters/<id>/chat
```

変更するのはAPIだけである。

```text
/api/characters/<id>            → /api/chat-characters/<id>
/api/characters/<id>/reference  → /api/chat-characters/<id>/reference
/api/characters/<id>/chat       → /api/chat-characters/<id>/chat
/api/characters/<id>/memory     → /api/chat-characters/<id>/memory
```

戻るリンクは `/characters` から `/character-chat` へ変更する。

将来、URLを `/character-chat/<id>` へ移すことはできるが、今回の分離には必須ではない。

## Step 5: 既存データを一回移行

現在の調査時点では `data/project/character-assets` 配下に `chat.json` と `memory.json` は確認できない。

ただし移行スクリプトは、存在する場合を考慮して次をコピーする。

```text
profile.json   → profile.json
reference.png → reference.png
chat.json      → chat.json
memory.json    → memory.json
```

移行はコピーのみとし、元データを削除しない。

新APIの動作確認後に旧Chat/Memory Writerを停止する。

## Step 6: Character LibraryをReadOnly化

Library画面から次を撤去する。

```text
+ NEW CHARACTER
編集
画像変更
YAML生成と保存
```

Libraryカードには次だけを残す。

```text
プロフィール表示
画像・YAML表示
ADD TO CHAT
USE IN LAB またはLABへの導線
```

Runtimeの更新APIは `405 Method Not Allowed` にする。

## Step 7: LAB REFをセッション専用化

LABから次を撤去する。

```text
+ CHARACTER登録 UI
registerReferenceImageCharacter()
handleCharacterRegistryUpload()
updateRegisteredCharacter()
saveCharacterBible() のMaster書き込み
loadStoryCharacterMemories()
```

`referenceImages` はページstateのまま維持する。

`USE AS REF` はCharacter Libraryの画像をコピーする読み取り処理だけ残す。

LAB Story生成では、現在の `referenceImages` にコピー済みの名前、役割、説明だけを使い、Chat Memoryを取得しない。

## 8. 分離に必要な変更ファイル

### 8.1 新規ファイル

```text
src/lib/server/characterChatRepository.ts
src/lib/types/chatCharacter.ts
src/routes/character-chat/+page.svelte
src/routes/api/chat-characters/+server.ts
src/routes/api/chat-characters/[id]/+server.ts
src/routes/api/chat-characters/[id]/reference/+server.ts
src/routes/api/chat-characters/[id]/chat/+server.ts
src/routes/api/chat-characters/[id]/memory/+server.ts
scripts/migrate-chat-characters.ts
```

### 8.2 必須変更ファイル

```text
src/routes/characters/+page.svelte
src/lib/components/characters/CharacterLibraryCard.svelte
src/routes/characters/[id]/chat/+page.svelte
src/routes/lab/+page.svelte
src/lib/server/characterRegistry.ts
src/routes/api/characters/+server.ts
src/routes/api/characters/[id]/+server.ts
src/routes/api/characters/[id]/reference/+server.ts
```

### 8.3 廃止または互換化するファイル

```text
src/routes/api/characters/[id]/chat/+server.ts
src/routes/api/characters/[id]/memory/+server.ts
src/routes/api/characters/story-context/+server.ts
```

最初のリリースでは旧Chat/Memory APIを新Repositoryへ委譲する互換APIとして残してもよい。

ただし、LABからの `story-context` は完全分離のため削除する。

### 8.4 データ

```text
data/character-chat/characters/
```

Character Libraryの既存保存場所は最小変更のため維持する。

```text
data/project/character-assets/
data/project/characters/
```

## 9. `characterRegistry.ts` の分割

最小変更では、Character Master側の関数をすぐ全面改名しない。

`characterRegistry.ts` に残すもの:

```text
listCharacters()
getCharacter()
getCharacterReferenceDataUrl()
searchCharacters()
Character Bible/YAML読み取り
```

Runtime ReadOnly化後に使用停止するWriter:

```text
registerCharacter()
updateCharacter()
saveCharacterReferenceImage()
deleteCharacter()
```

`characterChatRepository.ts` へ移すもの:

```text
getCharacterChat()
appendCharacterChat()
clearCharacterChat()
getCharacterMemory()
saveCharacterMemory()
```

`getCharacterStoryContexts()` は削除する。これはMasterとChat Memoryを結合する関数だからである。

## 10. 実装順序

### Phase A: 新Chatデータソースを追加

1. Chat型とRepositoryを追加
2. Chat専用APIを追加
3. 移行スクリプトをdry-run
4. 既存データをコピー

この時点では既存画面をまだ切り替えない。

### Phase B: Chat画面を切り替え

1. Chat専用一覧を追加
2. 既存Chat画面のAPIを `/api/chat-characters` へ変更
3. 戻るリンクをChat一覧へ変更
4. Library変更がChatへ反映されないことを確認

### Phase C: LibraryをReadOnly化

1. 作成・編集・画像変更・YAML更新UIを撤去
2. `ADD TO CHAT` を明示的なスナップショット操作として追加
3. 更新APIを `405` にする

### Phase D: LABを分離

1. Character登録UIとWriterを撤去
2. Chat Memory取得を撤去
3. `referenceImages` の追加・削除・生成入力だけを残す

### Phase E: 旧依存を廃止

1. 旧Chat/Memory API呼び出しがないことを確認
2. 旧APIを削除
3. `characterRegistry.ts` からChat関数を削除
4. Master配下の旧 `chat.json`、`memory.json` はバックアップ後に削除

## 11. リスク

| リスク | 影響 | 対策 |
|---|---|---|
| Chat専用一覧が初期状態で空 | Chatへ入れない | 既存Libraryを一回スナップショット移行 |
| LibraryとChatで同じIDを使うため誤参照 | 旧APIを呼ぶ可能性 | API prefixを `/api/chat-characters` に完全分離 |
| Library更新停止で管理手段がなくなる | Masterを追加できない | Runtime外のファイル管理または後続CLI |
| Chat画像コピーでディスク使用量増加 | 重複アセット | 分離の代償として許容。後でcontent hash化可能 |
| Story品質がChat Memory非参照で変化 | 生成差分 | LAB REFスナップショットの説明を明示利用 |
| 移行後に旧Chatへ書き込むコードが残る | データ分岐 | APIアクセスログと`rg`で旧呼び出しを検出 |
| Library削除とChat削除の意味が変わる | UI混乱 | それぞれ独立データであることを表示 |

## 12. 受け入れテスト

### 12.1 Character Library

1. Library一覧が表示される
2. 作成・編集・画像変更・削除操作がない
3. Runtimeの更新APIが `405` を返す
4. Library閲覧前後でMasterファイルhashが変化しない

### 12.2 Character Chat一覧

1. `/character-chat` が `/api/chat-characters` から一覧を表示する
2. Libraryにしか存在しないキャラクターはChat一覧へ自動表示されない
3. `ADD TO CHAT` 後にだけChat一覧へ追加される
4. 同じキャラクターの再追加は `409` になる

### 12.3 Character Chat独立性

1. ChatへN-01を追加する
2. Chat専用プロフィールと画像が作成される
3. Library側のN-01ファイルをテスト用に変更する
4. Chatを再ロードする
5. Chatの名前、役割、説明、画像が変わらない
6. Chat送信で `data/character-chat` だけが更新される

### 12.4 LAB REF

1. `USE AS REF` で `referenceImages.length` が増える
2. ×削除で `referenceImages.length` が減る
3. LAB操作でCharacter Masterファイルが変わらない
4. LAB操作でCharacter Chatファイルが変わらない
5. LABから `/api/chat-characters` が呼ばれない
6. LABから `/api/characters/story-context` が呼ばれない

## 13. ロールバック

### コード

1. Chat画面のAPIを旧 `/api/characters/<id>` 系へ戻す
2. `/characters` のLibraryカードをChat入口として再利用する
3. LABの新しいセッション処理を無効化する

### データ

- 移行はコピーで実施し、旧データを削除しない
- `data/character-chat` はロールバック時に削除せず隔離する
- 安定確認まではMaster配下の旧 `chat.json`、`memory.json` を保持する

### 注意

新Chatへ切り替えた後に作成された会話は、旧データへ自動で戻さない。必要な場合のみ明示的な逆移行スクリプトを使う。

## 14. 最小変更案の変更規模

必須の中核変更は次に限定できる。

1. Chat Repositoryを1ファイル追加
2. Chat専用APIを5系統追加
3. Chat専用一覧を1ページ追加
4. 既存Chat画面のAPI URLを置換
5. Library UIをReadOnly化し `ADD TO CHAT` を追加
6. LABからMaster WriterとChat Memory Readerを削除

Conversation ID、Actor ID、Voice Registry、VRM連携は今回の分離に必須ではない。

ChatキャラクターIDは当面Library IDと同じ値を使える。ただし保存場所とAPIを分けることで、データソースは独立する。

## 15. 最終判定

今回の問題の中心はREF IMAGE削除処理ではない。

根本原因は、Character Libraryの一覧・プロフィール・画像・保存ディレクトリを、Character Chatが直接マスターとして利用していることである。

最小変更での解決策は次の通り。

```text
Character Library
  読み取り専用Master
        │
        ├─ explicit snapshot → Character Chat専用データ
        │
        └─ copy on use       → LAB referenceImages

Character Chat専用データとLAB referenceImagesの間に依存なし
```

本レポートは実装計画であり、アプリケーションコードおよび既存データは変更していない。
