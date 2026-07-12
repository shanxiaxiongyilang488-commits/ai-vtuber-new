# PuruPuru デフォルトモデル配置場所

ここに `.purupuru` ファイル(PuruPuru PNGTuber のエクスポート)を置くと、
IndexedDB に保存済みモデルがないキャラクターの初期表示に自動で使われます。

読み込み優先順位(`PuruPuruAvatar.svelte`):

1. IndexedDB(UIから手動ロードしたモデル。キャラクターID単位)
2. `static/purupuru/<キャラクターID>.purupuru`(キャラクター専用デフォルト)
3. `static/purupuru/default.purupuru`(全キャラクター共通デフォルト)
4. どれもなければ CSS フォールバック(1枚絵アニメーション)

ファイルは公式エディタ https://github.com/rotejin/PuruPuruPNGTuber の
「.purupuru 保存」で書き出したものをそのまま置けます(形式検証あり、最大80MB)。
静的ファイルは IndexedDB には保存されないため、差し替えれば次回表示から反映されます。
