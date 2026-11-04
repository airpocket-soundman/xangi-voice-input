# xangi-voice-input

[English](README.md) | 日本語

xangiのチャット入力欄から、キーボードを開かずに日本語を音声入力する拡張です。
認識した文章は下書きへ反映し、自動送信しません。

> **利用前に：Google Chromeと、TailscaleによるHTTPS接続を前提としています。**
>
> 音声認識には、Chromeが提供するWeb Speech APIを利用します。
> スマートフォンや別のPCから使う場合は、Tailscale Serveで用意したHTTPS URLをChromeで開いてください。
> Tailscaleへ接続していても、`http://`のIPアドレスを開くだけでは音声入力は使えません。

**開発中:** xangi本体の `composer.input` 連携が必要です。未対応の本体では拡張の説明画面のみ利用できます。

## 利用環境

| 項目 | 前提 |
| --- | --- |
| ブラウザ | Google Chrome。マイクの使用許可が必要です。ほかのブラウザは動作保証の対象外です。 |
| 別端末からの接続 | サーバーと利用端末が同じTailscaleネットワーク（tailnet）に接続し、Tailscale ServeのHTTPS URLで開きます。 |
| 音声認識 | ChromeのWeb Speech API（`SpeechRecognition` / `webkitSpeechRecognition`）を使用します。独自の認識サーバーは不要です。 |
| xangi本体 | `composer.input`対応版が必要です。拡張だけでは入力欄との連携は追加されません。 |

Chromeでも、OS・端末・ブラウザの設定によって音声認識を利用できない場合があります。
iPhone/iPadを含め、Chromeという名前だけで対応を保証するものではありません。
ブラウザとOSのマイク許可、実際の認識結果は利用する端末で確認してください。

## はじめて使うとき

1. xangiの拡張画面で、公開リポジトリ `https://github.com/airpocket-soundman/xangi-voice-input` を追加します。
2. 開いたセットアップ会話の案内に従い、必要な設定を確認・承認します。
3. 別端末から使う場合はTailscaleへ接続し、案内された**HTTPS URLをChromeで**開きます。
4. チャット入力欄のマイクを押し、Chromeのマイク使用許可を選びます。
5. 日本語で話し、下書きへ入った文章を確認してから自分で送信します。

Tailscale未導入の場合のインストール、ログイン、HTTPSの初回有効化には本人の操作が必要です。
拡張の追加だけでOSやブラウザの許可を自動付与することはありません。
同じ端末の`localhost`で試す場合は、TailscaleによるHTTPS設定は不要です。

## 使い方

マイクを押して話すと、発話の区切りで停止します。途中で止める場合はもう一度マイクを押します。
確定前の文章は状態表示だけに出し、確定結果を下書きに反映します。認識結果が更新された場合は、
今回の発話部分を置き換えるため、途中の同じ文章を重複して追加しません。

手入力、会話やペインの切り替え、バックグラウンド移行で録音を終了します。録音中は送信を停止し、
通常の手入力へ戻れます。拡張を停止すると、約5秒以内に入力欄のマイクが消えます。

対応状況はブラウザとOSに依存します。Chromeであってもすべての環境で動作するとは限りません。
音声はChromeの音声認識サービスへ送信される場合があります。オフラインでの認識を保証しません。
この拡張とxangiサーバーは音声データを受信せず、音声アップロード用APIも提供しません。

## インストール

xangiのセットアップエージェントから導入する場合は、`XANGI_SETUP.md`に沿って案内します。
エージェントが現在の環境を確認し、必要な場合はTailscaleのHTTPS設定を提案します。
利用者は設定内容の確認、Tailscaleのログイン・HTTPS有効化、ブラウザのマイク許可を行います。
拡張を有効にするだけでこれらの許可が自動付与されるわけではありません。

Node.js 22以上、POSIXホスト（Linux/macOS）、`composer.input` 対応版xangiが必要です。
追加のnpm依存パッケージは不要です。

```sh
git clone https://github.com/airpocket-soundman/xangi-voice-input.git
cd xangi-voice-input
chmod +x scripts/xangi-extension
xangi extension link "$PWD/xangi-extension.json"
# 同じ実行中のxangiへ接続する環境（XANGI_TOOL_SERVER設定済み）で実行
xangi extension start xangi-voice-input
```

起動後はxangiの拡張管理画面から停止・起動できます。リンク時は自動起動が有効になります。
サービスは127.0.0.1にだけ待ち受け、すべてのリクエストにxangiの管理用Bearer認証を要求します。
ブラウザにはBearerトークンを渡しません。

## HTTPS: Tailscale前提

リモート利用のサポート対象は、同じtailnetの端末からTailscale ServeのHTTPS URLで接続する構成です。
例えば、xangiが127.0.0.1:18888で待ち受けているホストでは、管理者が次のように設定します。

```sh
tailscale serve --bg --https=18889 http://127.0.0.1:18888
```

実際の待ち受けアドレスに合わせて設定し、Tailscaleが表示するHTTPS URLを使ってください。
Serveはtailnet内で使用し、Funnelによる外部公開は必要ありません。既存のServe設定は保持してください。
自己署名証明書や独自CAの導入は不要です。

導入ガイドでは、接続済みのTailscale端末のDNS名と既存のServe設定を確認し、承認後にHTTPS入口を設定できます。
手動で進める場合も、xangiのホスト上で次の対話式コマンドを利用できます。転送先は実際の待受先に合わせてください。

```sh
npm run setup:https -- --target http://127.0.0.1:18888
```

`--check`で変更前の確認のみ、`--yes`で承認済みの設定を実行できます。
既存の適切なHTTPS入口は再利用し、他の入口が使うポートは避けます。Funnelは有効にしません。
Tailscaleのインストールとログインは別途必要です。Dockerの場合はコンテナではなくホストで実行します。
HTTPS初回有効化や管理者権限が必要な場合は、表示された案内に従って承認後に再実行します。
通常の拡張起動時には、OSやServe設定を変更しません。
LAN内のHTTP接続では音声入力を無効にし、通常の文字入力を利用できます。
localhostでの開発や、ほかの有効なHTTPS接続を意図的に拒否することはありません。

## 音声入力できないとき

| 症状 | 確認すること |
| --- | --- |
| マイクが表示されない | 本体が`composer.input`対応版か、拡張が起動中で正常かを確認してください。 |
| HTTP接続の案内が出る | Tailscale Serveの`https://`で始まるURLを開き直してください。TailscaleのIPへHTTPで接続するだけでは使えません。 |
| ブラウザ非対応と表示される | Google Chromeで開いてください。Chromeでも端末によってAPIを利用できない場合があります。 |
| マイクの許可エラーが出る | Chromeのサイト設定とOSの設定でマイクの使用を許可してください。 |
| 音声認識サービスへ接続できない | ネットワーク接続と、ブラウザの音声認識サービスへの通信が制限されていないかを確認してください。 |
| HTTPS URLを開けない | 利用端末が同じtailnetに接続しているか、Tailscaleのアクセス権とServe設定を確認してください。 |

音声入力を利用できない場合も、通常のキーボード入力を使えます。

## 構成とテスト

`src/extension.mjs` はxangi管理下で静的な操作画面を配信します。
`public/voice.js` がブラウザのWeb Speech APIを操作し、本体へテキストのスナップショットを渡します。
本体の認識API実装や、独自の音声認識サーバーは不要です。

```sh
npm test
# composer.input対応のxangiチェックアウトで npm ci を済ませて実行:
XANGI_CORE_PATH=/path/to/xangi XANGI_TEST_CHROMIUM=/path/to/chromium npm run test:browser
```

ブラウザテストは実際の本体ChatPane・管理サービス・iframeを使い、認識エンジンだけを模擬します。
累積結果の重複防止、手入力との切り替え、停止時の確定、会話切り替え後の古い結果、権限拒否、
背景移行、拡張の除去、非対応API、HTTP時の代替入力、スマホ幅を確認します。
実マイクでの認識品質と各OSでの対応状況は、実機で別途確認してください。

入力連携は信頼済みの同一オリジン拡張向けです。iframeを悪意あるコードの隔離境界としては扱いません。
