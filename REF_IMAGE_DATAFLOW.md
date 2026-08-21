# REF IMAGE Data Flow

調査日: 2026-06-13

対象:

- Lab画面の `CHARACTER REGISTRY`
- Lab画面の `REF IMAGE`
- `USE AS REF`
- Character Library / Character Registry
- Character Chat
- N-01 / N-02

コード変更は行っていない。

## 結論

`REF IMAGE` は単純な画像アップロード一覧でも、Character Libraryの
永続データそのものでもない。

実体は次の2種類を同じ配列で扱う、セッション内の参照選択stateである。

1. ユーザーがLabへ直接アップロードした一時画像
2. Character Registryから `USE AS REF` で選択したキャラクター参照

N-01とN-02が `REF IMAGE` に表示される場合は、2番目に該当する。

つまりN-01/N-02のカードは、
Character Libraryのキャラクターを現在の画像生成・Vision・Story処理の
参照対象として選択した状態である。

ただし、stateの型と描画名は `ReferenceImage` / `referenceImages` であり、
キャラクターIDだけでなく画像Data URLも複製して保持している。

## データ構造の区別

### 永続Character Libraryデータ

サーバー側の型:

```ts
interface CharacterRegistryEntry extends CharacterProfile {
  hasReference: boolean;
  hasSheet: boolean;
  characterYaml: string;
  directory: string;
}
```

実装:

- `src/lib/server/characterRegistry.ts:38`

永続保存先:

```text
data/project/character-assets/<id>/profile.json
data/project/character-assets/<id>/reference.png
data/project/characters/<id>.yaml
```

### LabのRegistry一覧state

```ts
type CharacterRegistryItem = {
  id: string;
  name: string;
  role: string;
  description: string;
  hasReference: boolean;
};

let characterRegistry = $state<CharacterRegistryItem[]>([]);
```

実装:

- 型: `src/routes/lab/+page.svelte:504`
- state: `src/routes/lab/+page.svelte:553`

これはCharacter Libraryの一覧表示用stateである。

### Labの現在選択中参照state

```ts
type ReferenceImage = {
  name: string;
  role: string;
  description: string;
  fileName?: string;
  dataUrl: string;
  note: string;
  sourceUrl?: string;
  characterId?: string;
  registryName?: string;
};

let referenceImages = $state<ReferenceImage[]>([]);
```

実装:

- 型: `src/routes/lab/+page.svelte:490`
- state: `src/routes/lab/+page.svelte:549`

この配列が `REF IMAGE` の実際の描画元である。

## N-01 / N-02の永続データ

### N-01

プロフィール:

```text
data/project/character-assets/n-01/profile.json
```

```json
{
  "id": "n-01",
  "name": "EW3Y FY9XZo4GdgR8Ywg0 ewzAcV0W",
  "role": "",
  "description": "",
  "image": "data/project/character-assets/n-01/reference.png"
}
```

画像:

```text
data/project/character-assets/n-01/reference.png
```

Character YAML:

```text
data/project/characters/n-01.yaml
```

### N-02

プロフィール:

```text
data/project/character-assets/n-02/profile.json
```

```json
{
  "id": "n-02",
  "name": "N-02",
  "role": "",
  "description": "",
  "image": "data/project/character-assets/n-02/reference.png"
}
```

画像:

```text
data/project/character-assets/n-02/reference.png
```

Character YAML:

```text
data/project/characters/n-02.yaml
```

実際の `/api/characters` 応答では両方とも次の状態だった。

```text
N-01: hasReference=true, hasSheet=true
N-02: hasReference=true, hasSheet=true
```

## Character Registryへのロード

サーバー処理:

```text
listCharacters()
  -> data/project/character-assets のディレクトリ一覧
  -> readProfile(id)
  -> profile.jsonを読む
  -> 対応するcharacters/<id>.yamlを読む
  -> toEntry()
  -> hasReference / hasSheetを付与
```

実装:

- `listCharacters`: `src/lib/server/characterRegistry.ts:420`
- `readProfile`: `src/lib/server/characterRegistry.ts:281`
- `toEntry`: `src/lib/server/characterRegistry.ts:313`

API:

```text
GET /api/characters
  -> listCharacters()
  -> { characters: CharacterRegistryEntry[] }
```

実装:

- `src/routes/api/characters/+server.ts:11`

Lab起動時:

```ts
void loadRegisteredCharacters();
```

`loadRegisteredCharacters()` はAPI応答を次へ格納する。

```ts
characterRegistry = characters.flatMap(...)
```

実装:

- 呼び出し: `src/routes/lab/+page.svelte:6297`
- 関数: `src/routes/lab/+page.svelte:1928`
- state更新: `src/routes/lab/+page.svelte:1935`

## N-01 / N-02が最初に表示される場所

`CHARACTER REGISTRY` セクションは次を描画する。

```svelte
{#each characterRegistry as character}
  <span>
    {character.name} ({character.id.toUpperCase()})
  </span>
  <button onclick={() => useCharacterRegistryImage(character)}>
    USE AS REF
  </button>
{/each}
```

実装:

- 配列: `characterRegistry`
- 描画: `src/routes/lab/+page.svelte:7064`
- 表示名とID: `src/routes/lab/+page.svelte:7068`

この段階ではN-01/N-02はCharacter Library一覧として表示されているだけで、
`REF IMAGE` にはまだ入っていない。

## USE AS REFの保存先

ボタン:

```svelte
onclick={() => useCharacterRegistryImage(character)}
```

実装:

- `src/routes/lab/+page.svelte:7072`

処理:

```ts
async function useCharacterRegistryImage(character) {
  const response = await fetch(
    `/api/characters/${encodeURIComponent(character.id)}/reference`
  );

  const sourceUrl = data.referenceImageDataUrl;

  referenceImages = [...referenceImages, {
    name: character.name,
    role: character.role,
    description: character.description,
    fileName: `${character.id}.png`,
    dataUrl: sourceUrl,
    sourceUrl,
    note: character.description || character.name,
    characterId: character.id,
    registryName: character.id.toUpperCase(),
  }];
}
```

実装:

- 関数: `src/routes/lab/+page.svelte:2230`
- 画像取得: `src/routes/lab/+page.svelte:2233`
- `referenceImages`追加: `src/routes/lab/+page.svelte:2241`

保存先は次である。

```text
referenceImages
```

これはクライアントメモリ上のSvelte `$state` であり、以下には保存されない。

- localStorage
- Character Registryのprofile.json
- Character RegistryのYAML
- Character Chatログ

`USE AS REF` は永続データを書き換えず、Registryデータを
セッション内の選択stateへ複製する。

## USE AS REFで複製されるN-01

概念上、N-01は次のオブジェクトになる。

```ts
{
  name: "EW3Y FY9XZo4GdgR8Ywg0 ewzAcV0W",
  role: "",
  description: "",
  fileName: "n-01.png",
  dataUrl: "data:image/png;base64,...",
  sourceUrl: "data:image/png;base64,...",
  note: "EW3Y FY9XZo4GdgR8Ywg0 ewzAcV0W",
  characterId: "n-01",
  registryName: "N-01"
}
```

## USE AS REFで複製されるN-02

概念上、N-02は次のオブジェクトになる。

```ts
{
  name: "N-02",
  role: "",
  description: "",
  fileName: "n-02.png",
  dataUrl: "data:image/png;base64,...",
  sourceUrl: "data:image/png;base64,...",
  note: "N-02",
  characterId: "n-02",
  registryName: "N-02"
}
```

## REF IMAGEの描画元

描画条件:

```svelte
{#if referenceImages.length > 0}
```

カード描画:

```svelte
{#each referenceImages as ref, i}
  <div class="ref-img-chip">
    <img src={ref.dataUrl} alt={ref.name} />
    <input bind:value={ref.name} />
    <input bind:value={ref.role} />
  </div>
{/each}
```

実装:

- 条件: `src/routes/lab/+page.svelte:7084`
- 配列: `src/routes/lab/+page.svelte:7087`
- 画像: `src/routes/lab/+page.svelte:7090`
- 名前: `src/routes/lab/+page.svelte:7096`
- 役割: `src/routes/lab/+page.svelte:7102`

実際に画面へ描画される配列名は明確に次である。

```text
referenceImages
```

## REF IMAGEはCharacter Libraryの選択状態か

N-01/N-02については、実質的にYesである。

理由:

- `characterId` に `n-01` / `n-02` を保持する
- `registryName` に `N-01` / `N-02` を保持する
- Registryのname、role、descriptionをコピーする
- Registryのreference.pngをData URLとして保持する
- 同じCharacter IDを重複選択できない
- 選択中IDがStory用Character Memory取得に使われる

重複防止:

```ts
if (referenceImages.some((ref) => ref.characterId === character.id)) return;
```

実装:

- `src/routes/lab/+page.svelte:2240`

UI側でも選択済みの場合は `USE AS REF` がdisabledになる。

```svelte
disabled={
  !character.hasReference
  || referenceImages.some((ref) => ref.characterId === character.id)
}
```

実装:

- `src/routes/lab/+page.svelte:7073`

ただし配列には直接アップロード画像も入るため、
型およびシステム全体としては純粋なCharacter選択配列ではない。

```text
referenceImages =
  Temporary uploaded image references
  + Selected Character Registry references
```

## Character Chatとの関連

Character ChatはCharacter Registryの同じIDを使用するが、
`referenceImages` を直接参照しない。

Character Library画面から:

```text
Character Chat
  -> /characters/<character.id>/chat
```

実装:

- ボタン: `src/lib/components/characters/CharacterLibraryCard.svelte:119`
- 遷移: `src/routes/characters/+page.svelte:257`

Character Chat画面はIDを使って以下を取得する。

```text
GET /api/characters/<id>
GET /api/characters/<id>/chat
GET /api/characters/<id>/memory
```

実装:

- `src/routes/characters/[id]/chat/+page.svelte:62`

Chatログの保存先:

```text
data/project/character-assets/<id>/chat.json
```

Memoryの保存先:

```text
data/project/character-assets/<id>/memory.json
```

したがって関係は次のようになる。

```text
Character Registry entry (n-01 / n-02)
  ├─ Character Chatが同じIDでprofile/chat/memoryを参照
  └─ USE AS REFが同じIDとreference.pngをreferenceImagesへ複製
```

`USE AS REF` を押してもCharacter Chatは開始されず、Chatログも変更されない。
逆にCharacter Chatを開いても、Labの `referenceImages` には追加されない。

## Story/Memoryとの関連

Labでは選択中 `referenceImages` から `characterId` を抽出する。

```ts
const characterIds = referenceImages
  .map((reference) => reference.characterId)
  .filter(Boolean);
```

実装:

- `src/routes/lab/+page.svelte:2564`

そのIDを次へ送る。

```text
POST /api/characters/story-context
```

サーバーは同じCharacter Registryからprofileとmemoryを取得する。

```text
getCharacterStoryContexts(characterIds, query)
  -> listCharacters()
  -> getCharacterMemory(id)
```

このため、N-01/N-02を `USE AS REF` で選択すると、
画像参照だけでなく、Story生成時のCharacter Memory選択にも影響する。

ただしCharacter Chatの会話ログ `chat.json` 自体は、
このStory Context APIには含まれない。

## 削除フロー

REF IMAGEのX:

```svelte
onclick={() => removeReferenceImage(i)}
```

処理:

```ts
const removed = referenceImages[i];
referenceImages.splice(i, 1);
characterAnalyzeImages =
  characterAnalyzeImages.filter((ref) => ref !== removed);
mangaContinueImages =
  mangaContinueImages.filter((ref) => ref !== removed);
```

実装:

- ボタン: `src/routes/lab/+page.svelte:7104`
- 関数: `src/routes/lab/+page.svelte:2261`

削除されるもの:

- `referenceImages` 内のセッション選択
- 解析用スナップショット内の同一オブジェクト

削除されないもの:

- `characterRegistry`
- `profile.json`
- `reference.png`
- Character YAML
- Character Chatログ
- Character Memory

したがってXはCharacter LibraryからN-01/N-02を削除する操作ではなく、
現在の参照選択から外す操作である。

## N-01 / N-02 完全データフロー

```text
profile.json + reference.png + character YAML
  |
  v
Character Registry server
  listCharacters()
  |
  v
GET /api/characters
  |
  v
Lab characterRegistry state
  |
  v
CHARACTER REGISTRY欄にN-01/N-02を表示
  |
  | USE AS REF
  v
GET /api/characters/<id>/reference
  |
  v
ReferenceImageへ変換
  characterId = n-01 / n-02
  registryName = N-01 / N-02
  dataUrl = reference.png
  |
  v
referenceImages stateへ追加
  |
  +--> REF IMAGEカードとして描画
  |
  +--> Vision / image generationの画像入力
  |
  +--> Story ContextのcharacterIds
  |
  `--> current Character Ref判定
        |
        v
       Xボタン
        |
        v
       referenceImages.splice(i, 1)
        |
        v
       参照選択のみ解除
```

## 最終判定

N-01/N-02の `REF IMAGE` カードは、
Character Libraryの永続エントリそのものではない。

正確には次である。

```text
Character Registryのキャラクターを、
Labの画像・Vision・Story処理で現在使用するために
referenceImagesへ複製したセッション内参照選択
```

名称は `REF IMAGE` だが、Registry由来カードについては
「画像付きCharacter Library参照選択」と理解するのが最も正確である。
