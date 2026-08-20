# RTX 5090 共用Podイメージ

AI-VTUBER用のComfyUI、Irodori-TTS、MiniMax H3、JupyterLabを、1台のRunPod Podで自動起動するDockerイメージです。Python依存をイメージへ組み込むため、Podの移行や再作成のたびにJupyterLabで`pip install`を繰り返す必要はありません。

## サービス構成

- `8188`: 公開する共通入口（ComfyUI + AI-VTUBER中継）
- `8791`: Irodori-TTS内部サービス（外部公開しない）
- `8792`: MiniMax H3内部サービス（外部公開しない）
- `8888`: JupyterLab

AI-VTUBERは8188番だけを利用し、次のパスからPod内部のサービスへ中継します。

- `/ai-vtuber/voice/*` → 8791
- `/ai-vtuber/video/*` → 8792

8791番と8792番はRunPodで外部公開しません。

## イメージを作る

1. GitHubのActions画面で`Build RunPod workers`を開きます。
2. `Run workflow`から`unified`を選んで実行します。
3. 完了後、`ghcr.io/<GitHubユーザー名>/ai-vtuber-runpod-unified:latest`が作成されます。

ローカルにDockerがある場合は、リポジトリ直下で次のコマンドでも作成できます。

```bash
docker build -f runpod/unified/Dockerfile -t ai-vtuber-runpod-unified runpod
```

## RunPodへ設定する

1. Container imageに作成したGHCRイメージを指定します。
2. Network Volumeを`/workspace`へマウントします。
3. Expose HTTP portsには`8188,8888`だけを指定します。
4. `AI_VTUBER_BRIDGE_TOKEN`に、AI-VTUBER設定画面の「共有トークン」と同じ値を設定します。
5. AI-VTUBER設定画面へPod IDと同じ共有トークンを保存します。
6. 必要なら`JUPYTER_TOKEN`も設定します。

GHCRパッケージが非公開の場合は、RunPodのContainer Registry AuthenticationへGitHubユーザー名と`read:packages`権限のトークンを設定してください。個人運用なら、このコンテナパッケージだけをGitHub Packages画面からpublicにする方法もあります。ソースリポジトリをpublicにする必要はありません。

このイメージではコンテナ起動時に全サービスが自動起動します。通常はJupyterLabを開いて起動コマンドを入力する必要はありません。

## 初回起動と永続化

初回起動ではHugging Faceからモデルを取得するため時間がかかります。Python依存はDockerイメージ内にあるため、起動のたびに再インストールされません。

次のデータは`/workspace`配下へ保存され、同じNetwork Volumeを使う限りPodを再作成しても残ります。

- ComfyUIのモデル、入力、出力、ユーザー設定、カスタムノード
- Hugging FaceとPyTorchのモデルキャッシュ
- AI-VTUBERのワークフローと共有トークン

## 接続できないとき

- `403`: AI-VTUBERとPodの共有トークンが一致しているか確認します。ブラウザで8188の中継APIを直接開く場合も認証が必要です。
- RunPodのポートが`Initializing`: コンテナログで全サービスの起動完了を確認します。初回のモデル取得中は時間がかかります。
- `Pod resume failed: not enough free GPUs`: RunPodホストのGPU不足です。別ホストへの移行または再デプロイが必要で、Docker依存の問題ではありません。
- Pod内部の`127.0.0.1:8188`は200だが公開URLが403: RunPod Proxyの認証セッションかURLを確認し、Pod画面の`HTTP Service`ボタンから開きます。
- Pythonモジュール不足: JupyterLabで個別に`pip install`せず、このDockerイメージを再ビルドしてPodを更新します。
