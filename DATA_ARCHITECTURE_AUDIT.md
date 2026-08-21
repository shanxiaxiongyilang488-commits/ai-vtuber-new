# Character Library / REF IMAGE データ構造監査

## 結論

LABの `USE AS REF` はCharacter Libraryへキャラクターを新規保存していない。

`USE AS REF` が行うのは、既にCharacter Registryへ永続化されているキャラクターの参照画像を取得し、LABページ内の一時state `referenceImages` へ追加する処理だけである。JSONファイルの更新、Character Registryへの登録、Character Libraryへの追加は行わない。

Character Libraryに残る直接の原因は、Character LibraryとCharacter Registryが同じ `/api/characters` と同じ永続ストレージを参照しているためである。さらにLABのREF IMAGE周辺には、一時参照を選ぶ `USE AS REF` と、永続登録を行う「Character登録」が同居している。このUI上の近接が、REF IMAGEへの一時追加とCharacter Libraryへの永続登録を同じ操作系に見せている。

したがって、データが `USE AS REF` によってCharacter Libraryへ混入しているのではなく、次の二つが混同されている。

- `Character登録`: Character Registryへ永続化する処理
- `USE AS REF`: Registryに存在するキャラクターをLABの一時stateへ選択する処理

## データ保存先一覧

| データ | 実体・保存先 | 永続性 | 主な更新処理 | 主な参照元 |
|---|---|---|---|---|
| Character Library | Character Registryの一覧表示。独立した保存先はない | Registryに依存 | `POST/PUT /api/characters` | `/characters` |
| Character Registryプロフィール | `data/project/character-assets/<id>/profile.json` | 永続 | `registerCharacter()`, `updateCharacter()` | Character Library、LAB、Character Chat |
| Character Registry参照画像 | `data/project/character-assets/<id>/reference.png` | 永続 | `registerCharacter()`, 画像更新API | Character Library、LABの `USE AS REF` |
| Character Registryシート画像 | `data/project/character-assets/<id>/sheet.png` | 永続、任意 | `registerCharacter()`, 更新API | キャラクター表示・生成処理 |
| Character visual YAML | `data/project/characters/<id>.yaml` | 永続 | Character Registry更新処理 | キャラクター設定参照 |
| Character Chat履歴 | `data/project/character-assets/<id>/chat.json` | 永続 | Chat API | Character Chat |
| Character Memory | `data/project/character-assets/<id>/memory.json` | 永続 | Memory API | Character Chat |
| `referenceImages` | `src/routes/lab/+page.svelte` の `$state<ReferenceImage[]>([])` | ページセッションのみ | アップロード、`USE AS REF`、削除処理 | LABのREF IMAGE描画 |

## 1. Character Libraryの保存先

Character Library専用のJSONや独立したデータベースは存在しない。

表示コンポーネントは `src/routes/characters/+page.svelte` で、`GET /api/characters` を呼び出して一覧を取得する。このAPIは `src/lib/server/characterRegistry.ts` の `listCharacters()` を使用し、Character Registryの永続ファイルを列挙する。

Character Library画面の `characters` stateは取得結果を保持する表示用stateであり、永続化の本体ではない。

つまり、Character LibraryはCharacter Registryのビューである。

## 2. Character Registryの保存先

Character Registryのサーバー実装は `src/lib/server/characterRegistry.ts` にある。

主要な保存先は次の通り。

```text
data/project/
├─ characters/
│  └─ <character-id>.yaml
└─ character-assets/
   └─ <character-id>/
      ├─ profile.json
      ├─ reference.png
      ├─ sheet.png
      ├─ chat.json
      └─ memory.json
```

`profile.json` と `reference.png` が基本登録データで、`sheet.png`、`chat.json`、`memory.json` は機能の使用状況に応じて作成される。

調査時点では、少なくとも次の永続データが存在した。

```text
data/project/character-assets/n-01/profile.json
data/project/character-assets/n-01/reference.png
data/project/character-assets/n-02/profile.json
data/project/character-assets/n-02/reference.png
data/project/characters/n-01.yaml
data/project/characters/n-02.yaml
```

そのため、N-01とN-02はLABの一時stateだけではなく、Character Registryに登録済みの永続キャラクターである。Character Libraryに表示されるのはこの登録データを一覧取得しているためである。

## 3. `referenceImages` の保存先

`referenceImages` は `src/routes/lab/+page.svelte` に次の形式で定義されたクライアントstateである。

```ts
let referenceImages = $state<ReferenceImage[]>([]);
```

このstateについて、localStorageへの保存処理やCharacter Registryへの同期処理は確認できない。ページ初期化時には空配列へ戻される。

したがって `referenceImages` は次の性質を持つ。

- LABページを表示している間だけ保持される
- REF IMAGEカードの直接の描画元である
- ブラウザを再読み込みすると再構築されず、空になる
- Character Registryのファイルとは別物である
- カードの×ボタンはこの配列から対象を除去するだけである

## 4. `USE AS REF` が更新するJSON

`USE AS REF` が更新するJSONはない。

処理は `src/routes/lab/+page.svelte` の `useCharacterRegistryImage()` で、流れは次の通り。

1. LABが `GET /api/characters/<id>/reference` を呼ぶ
2. Registryに保存済みの `reference.png` を取得する
3. 画像をData URLへ変換する
4. 同一 `characterId` が `referenceImages` に存在するか確認する
5. `referenceImages` に `ReferenceImage` オブジェクトを追加する
6. REF IMAGE領域がstate更新によって再描画される

この処理には `POST`、`PUT`、ファイル書き込み、localStorage更新がない。

一方、LAB内のCharacter登録処理は別系統である。

1. `handleCharacterRegistryUpload()` が入力を受け取る
2. `registerReferenceImageCharacter()` を呼ぶ
3. `POST /api/characters` を実行する
4. `registerCharacter()` が `profile.json` と `reference.png` を保存する
5. `/api/characters` の一覧へ現れる
6. 同じ一覧を使うCharacter Libraryにも表示される

Character Libraryに新しいキャラクターを残すのは、この永続登録経路である。

## 5. Character Chatが参照するJSON

Character Chat画面は `src/routes/characters/[id]/chat/+page.svelte` にあり、主に次のAPIを参照する。

| API | 参照データ |
|---|---|
| `GET /api/characters/<id>` | `profile.json` を含むRegistry情報 |
| `GET /api/characters/<id>/chat` | `chat.json` |
| `GET /api/characters/<id>/memory` | `memory.json` |

会話追加時はCharacter Registryサーバーの `appendCharacterChat()` が `chat.json` を更新する。メモリー保存時は `saveCharacterMemory()` が `memory.json` を更新する。

Character Chatは `referenceImages` を参照しない。Character Registryの同じキャラクターIDを起点に、プロフィール、チャット履歴、メモリーを取得する。

## N-01 / N-02の表示経路

N-01とN-02は次の経路でCharacter Libraryへ表示される。

```text
data/project/character-assets/n-01/profile.json
data/project/character-assets/n-02/profile.json
                    ↓
characterRegistry.listCharacters()
                    ↓
GET /api/characters
                    ↓
src/routes/characters/+page.svelte
                    ↓
Character Libraryカード
```

LABで `USE AS REF` を押した場合は、同じRegistryエントリーから別の一時経路へ入る。

```text
GET /api/characters
        ↓
LABのCharacter Registry一覧
        ↓ USE AS REF
GET /api/characters/<id>/reference
        ↓
referenceImages（クライアント一時state）
        ↓
REF IMAGEカード
```

×ボタンで削除されるのは後者の `referenceImages` 要素だけである。前者のRegistryファイルは削除されないため、Character Libraryには引き続き表示される。

## 永続データとセッションデータの境界

### 永続データ

- `profile.json`
- `reference.png`
- `sheet.png`
- `<id>.yaml`
- `chat.json`
- `memory.json`

これらはサーバー側の `data/project` 以下へ保存され、アプリやページを再起動しても残る。

### セッション用データ

- LABの `referenceImages`
- Character Library画面の取得済み `characters` state
- LABの取得済みCharacter Registry一覧state

これらはクライアントメモリー上の表示・選択状態であり、ページ再読み込み後にAPIから再取得されるか、初期値へ戻る。

## 汚染と見える原因

データ層では、`USE AS REF` からCharacter Libraryへの書き込みは確認できない。現象は主に次の設計上の要因による。

1. Character LibraryとCharacter Registryが同じ永続データを別名で表示している
2. LABの同じ領域に永続登録と一時参照選択が配置されている
3. `USE AS REF` はRegistryから一時参照を作るが、元のRegistry登録を消費・移動しない
4. REF IMAGEの×削除は一時stateだけを削除し、Registry登録には触れない
5. 「Library」「Registry」「REF IMAGE」のUI用語から、保存範囲の違いが判別しにくい

## データフロー判定

| 操作 | `referenceImages` | Registryファイル | Character Library | Chat JSON |
|---|---:|---:|---:|---:|
| LABでCharacter登録 | 間接的に追加される場合あり | 作成・更新 | 表示対象になる | 変更なし |
| `USE AS REF` | 追加 | 変更なし | 変更なし | 変更なし |
| REF IMAGEの×削除 | 削除 | 変更なし | 引き続き表示 | 変更なし |
| Character Libraryで削除 | 対象外 | 削除APIの対象 | 一覧から消える | キャラクターディレクトリとともに削除対象 |
| Character Chat送信 | 変更なし | `chat.json` 等を更新 | 登録自体は維持 | 更新 |

## 監査結果

「LABで `USE AS REF` したためCharacter Libraryへ残った」という因果関係は、実装上は成立しない。N-01とN-02がCharacter Libraryへ表示される根拠は、両者が既にCharacter Registryの永続ファイルとして存在することである。

責務の混在はデータ書き込みの混線ではなく、同じRegistryデータを複数の名称と用途で扱い、永続登録UIと一時選択UIを近接配置していることにある。

本監査ではアプリケーションコードを変更していない。
