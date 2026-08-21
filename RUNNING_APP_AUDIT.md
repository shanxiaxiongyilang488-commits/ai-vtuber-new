# RUNNING APP AUDIT

調査日: 2026-06-13

対象:

- `REF IMAGE` の削除ボタン実装
- 実行中の Vite/SvelteKit 開発サーバー
- `ai-vtuber` と `ai-vtuber-new` 系ディレクトリ
- `localhost:5173` から実際に配信されているソース

コード変更は行っていない。

## 結論

`localhost:5173` で実行中のアプリは、旧コードではなく
`E:\Dev\ai-vtuber` の現在の作業ツリーを参照している。

実際に配信されている変換済みクライアントコードの
`removeReferenceImage` は、Character Registry の DELETE API を呼ばず、
直接 `referenceImages.splice(i, 1)` を実行する現行実装だった。

したがって、REF IMAGE の削除不具合について、
「ブラウザへ旧 DELETE 実装が配信されている」という仮説は今回の監査では否定された。

前回レポートで確認した旧実装は Git の `HEAD` に存在するが、
現在の Vite dev server が配信しているコードではない。

## 1. REF IMAGE 削除ボタンの実装ファイル

実装ファイル:

```text
E:\Dev\ai-vtuber\src\routes\lab\+page.svelte
```

ボタン:

```svelte
<button
  class="ref-img-remove"
  onclick={() => removeReferenceImage(i)}
  title="現在のREF選択から外す"
>✕</button>
```

位置:

- `src/routes/lab/+page.svelte:7104`

呼び出される関数:

```ts
async function removeReferenceImage(i: number): Promise<void> {
  const removed = referenceImages[i];
  referenceImages.splice(i, 1);
  characterAnalyzeImages = characterAnalyzeImages.filter((ref) => ref !== removed);
  mangaContinueImages = mangaContinueImages.filter((ref) => ref !== removed);
  characterBible = null;
  characterBibleSource = null;
  visionContext = '';
}
```

位置:

- 関数開始: `src/routes/lab/+page.svelte:2261`
- 描画元 state の削除: `src/routes/lab/+page.svelte:2263`

## 2. DELETE 失敗時に return している旧コード

現在の作業ツリーには、この DELETE 処理は存在しない。

Git の現在の `HEAD`:

```text
d24c66d6edb4e8bbbdc5dce768c50bf4100213cb
```

の `src/routes/lab/+page.svelte` には次の旧実装が存在する。

```ts
async function removeReferenceImage(i: number): Promise<void> {
  const ref = referenceImages[i];
  if (ref?.characterId) {
    try {
      const res = await fetch(`/api/characters/${encodeURIComponent(ref.characterId)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Character delete HTTP ${res.status}`);
      }
    } catch (error) {
      console.warn('[CHARACTER_REGISTRY_DELETE_ERROR]', error);
      return;
    }
  }
  referenceImages.splice(i, 1);
}
```

旧コードの停止位置:

```text
catch
  -> console.warn('[CHARACTER_REGISTRY_DELETE_ERROR]', error)
  -> return
  -> referenceImages.splice(i, 1) に到達しない
```

これはコミット済み `HEAD` と現在の未コミット作業ツリーとの差分である。

## 3. npm run dev が参照しているルート

`package.json`:

```json
"dev": "vite dev"
```

実行中プロセス:

```text
PID 13068
cmd.exe /d /s /c vite dev

PID 20328
node E:\Dev\ai-vtuber\node_modules\vite\bin\vite.js dev
```

待受:

```text
Address: ::1
Port: 5173
PID: 20328
```

Vite プロセスの起動時刻:

```text
2026-06-13 11:19:49
```

生成済み SvelteKit route dictionary:

```js
"/lab": [9]
```

`.svelte-kit/generated/client/nodes/9.js`:

```js
export { default as component }
  from "../../../../src/routes/lab/+page.svelte";
```

以上から、実行中の `/lab` は次を参照している。

```text
E:\Dev\ai-vtuber\src\routes\lab\+page.svelte
```

## 4. ai-vtuber と ai-vtuber-new の関係

現在の Git リポジトリ:

```text
Local path: E:\Dev\ai-vtuber
Package name: ai-vtuber
Branch: feature/project-mode
Remote: https://github.com/shanxiaxiongyilang488-commits/ai-vtuber-new.git
```

ここで `ai-vtuber-new` は GitHub リモートのリポジトリ名であり、
現在実行中のローカルディレクトリ名は `ai-vtuber` である。

現在のリポジトリ内には次のディレクトリも存在する。

```text
E:\Dev\ai-vtuber\ai-vtuber-new
```

ただし内容は実質的に次の1ファイルだけである。

```text
ai-vtuber-new/src/lib/ai/personas.ts
```

このディレクトリには以下がない。

- `package.json`
- `vite.config.ts`
- `.git`
- `src/routes/lab/+page.svelte`

したがって、これは独立して起動される現在の Lab アプリではない。
Git 管理下に残っている履歴上の部分ディレクトリである。

別ディレクトリ:

```text
E:\Dev\ai-vtuber-new2
```

にも `package.json`、`.git`、Lab page はなく、現在の Vite プロセスとは無関係である。

古いアプリのコピーは次の配下に存在する。

```text
E:\Dev\ai-vtuber-old\...
```

しかし、実行中プロセスの Vite パスおよび配信 import には
`ai-vtuber-old` は一切含まれていない。

## 5. 実際にブラウザへ配信されているソース

取得先:

```text
http://localhost:5173/lab
```

応答:

```text
HTTP 200
```

配信 HTML 内の client import:

```js
import("/@fs/E:/Dev/ai-vtuber/node_modules/@sveltejs/kit/src/runtime/client/entry.js")
import("/@fs/E:/Dev/ai-vtuber/.svelte-kit/generated/client/app.js")
```

`ai-vtuber-new`、`ai-vtuber-new2`、`ai-vtuber-old` を参照する import はない。

さらに、Vite が変換して配信している次のモジュールを直接取得した。

```text
http://localhost:5173/src/routes/lab/+page.svelte
```

配信中の関数:

```js
async function removeReferenceImage(i) {
  const removed = $.get(referenceImages)[i];

  $.get(referenceImages).splice(i, 1);
  $.set(
    characterAnalyzeImages,
    $.get(characterAnalyzeImages).filter((ref) => $.strict_equals(ref, removed, false)),
    true
  );
  $.set(
    mangaContinueImages,
    $.get(mangaContinueImages).filter((ref) => $.strict_equals(ref, removed, false)),
    true
  );
  $.set(characterBible, null);
  $.set(characterBibleSource, null);
  $.set(visionContext, '');
}
```

配信ソースの判定結果:

| 確認内容 | 結果 |
| --- | --- |
| `removeReferenceImage` が存在する | Yes |
| `splice(i, 1)` が存在する | Yes |
| `characterAnalyzeImages` の削除処理が存在する | Yes |
| Character Registry DELETE が存在する | No |
| `CHARACTER_REGISTRY_DELETE_ERROR` が存在する | No |
| DELETE 失敗時の `return` が存在する | No |

SSR HTML にも現在の作業ツリー特有の以下の UI が含まれている。

- `MEDIA GENERATION`
- `Media Type`
- 現行モデル選択 UI

旧画面の `REGISTERED CHARACTERS` 表示は含まれていない。

## Service Worker の影響

配信された Service Worker:

```js
import '/@fs/E:/Dev/ai-vtuber/src/service-worker.ts';
```

この Service Worker が処理するのは以下だけである。

- `/mobile-chat`
- `/_app/`
- `/icons/`
- `/manifest.webmanifest`

`/lab` と `/src/routes/lab/+page.svelte` はキャッシュ対象外である。

したがって、Service Worker が Lab page の旧コードを返している可能性も
現在の実装からは否定できる。

## 監査結果

### 確認できたこと

1. 削除ボタンは `src/routes/lab/+page.svelte` にある。
2. DELETE 失敗時に `return` するコードは Git `HEAD` の旧実装にある。
3. 実行中の Vite は `E:\Dev\ai-vtuber\node_modules` から起動している。
4. `/lab` route は `E:\Dev\ai-vtuber\src\routes\lab\+page.svelte` を参照している。
5. 実配信クライアントコードは現行の直接 `splice` 実装である。
6. `ai-vtuber-new` はリモート名または不完全な履歴ディレクトリであり、
   実行中アプリではない。
7. Service Worker は `/lab` をキャッシュしていない。

### 否定された原因

```text
実行中アプリが旧 removeReferenceImage を配信している
```

この原因は、現在の `localhost:5173` については否定された。

### 次に残る調査対象

旧コード配信ではないため、REF IMAGE の X ボタン不具合は次のどちらかに
絞って実画面で確認する必要がある。

1. クリックイベントが実際には `removeReferenceImage` に到達していない。
2. 現行の `splice` は実行されているが、期待したカードまたは DOM が更新されていない。

現在の関数には実行ログがないため、この2点は今回の静的・配信監査だけでは
判定できない。
