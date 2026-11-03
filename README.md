# xangi-voice-input

Xangiのチャット入力欄から、キーボードを開かずに日本語を音声入力する拡張です。
認識した文章は下書きへ反映し、自動送信しません。

**開発中:** Xangi本体の `composer.input` 連携が必要です。未対応の本体では拡張の説明画面のみ利用できます。

## 使い方

マイクを押して話すと、発話の区切りで停止します。途中で止める場合はもう一度マイクを押します。
確定前の文章は状態表示だけに出し、確定結果を下書きに反映します。認識結果が更新された場合は、
今回の発話部分を置き換えるため、途中の同じ文章を重複して追加しません。

手入力、会話やペインの切り替え、バックグラウンド移行で録音を終了します。録音中は送信を停止し、
通常の手入力へ戻れます。拡張を停止すると、約5秒以内に入力欄のマイクが消えます。

対応状況はブラウザとOSに依存します。Chromeであってもすべての環境で動作するとは限りません。
音声はブラウザ提供元の音声認識サービスへ送信される場合があります。
この拡張とXangiサーバーは音声データを受信せず、音声アップロード用APIも提供しません。

## インストール

Node.js 22以上、POSIXホスト（Linux/macOS）、`composer.input` 対応版Xangiが必要です。
追加のnpm依存パッケージは不要です。

```sh
git clone https://github.com/airpocket-soundman/xangi-voice-input.git
cd xangi-voice-input
chmod +x scripts/xangi-extension
xangi extension link "$PWD/xangi-extension.json"
# 同じ実行中のXangiへ接続する環境（XANGI_TOOL_SERVER設定済み）で実行
xangi extension start xangi-voice-input
```

起動後はXangiの拡張管理画面から停止・起動できます。リンク時は自動起動が有効になります。
サービスは127.0.0.1にだけ待ち受け、すべてのリクエストにXangiの管理用Bearer認証を要求します。
ブラウザにはBearerトークンを渡しません。

## HTTPS: Tailscale前提

リモート利用のサポート対象は、同じtailnetの端末からTailscale ServeのHTTPS URLで接続する構成です。
例えば、Xangiが127.0.0.1:18888で待ち受けているホストでは、管理者が次のように設定します。

```sh
tailscale serve --bg --https=18889 http://127.0.0.1:18888
```

実際の待ち受けアドレスに合わせて設定し、Tailscaleが表示するHTTPS URLを使ってください。
Serveはtailnet内で使用し、Funnelによる外部公開は必要ありません。既存のServe設定は保持してください。
自己署名証明書や独自CAの導入は不要です。

Tailscaleのインストール・ログイン・証明書設定・Serve設定は管理者が行います。この拡張がOSへ
モジュールを自動インストールしたり、証明書やServe設定を書き換えたりはしません。
LAN内のHTTP接続では音声入力を無効にし、通常の文字入力を利用できます。
localhostでの開発や、ほかの有効なHTTPS接続を意図的に拒否することはありません。

## 構成とテスト

`src/extension.mjs` はXangi管理下で静的な操作画面を配信します。
`public/voice.js` がブラウザのWeb Speech APIを操作し、本体へテキストのスナップショットを渡します。
本体の認識API実装や、独自の音声認識サーバーは不要です。

```sh
npm test
# composer.input対応のXangiチェックアウトで npm ci を済ませて実行:
XANGI_CORE_PATH=/path/to/xangi XANGI_TEST_CHROMIUM=/path/to/chromium npm run test:browser
```

ブラウザテストは実際の本体ChatPane・管理サービス・iframeを使い、認識エンジンだけを模擬します。
累積結果の重複防止、手入力との切り替え、停止時の確定、会話切り替え後の古い結果、権限拒否、
背景移行、拡張の除去、非対応API、HTTP時の代替入力、スマホ幅を確認します。
実マイクでの認識品質と各OSでの対応状況は、実機で別途確認してください。

入力連携は信頼済みの同一オリジン拡張向けです。iframeを悪意あるコードの隔離境界としては扱いません。
