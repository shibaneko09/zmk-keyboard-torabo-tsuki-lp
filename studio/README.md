# torabo-tsuki XS Keymap Editor

torabo-tsuki LP XS（S相当レイアウト）のキーマップを、物理配置を見ながら編集するためのローカル専用Webアプリです。編集内容はブラウザ内に下書きとして保持され、USB接続後に差分を確認してから一括反映できます。

## 必要な環境

- Node.js `22.13.0` 以上
- Web Serial APIに対応するChromeまたはEdge
- このリポジトリのポインター設定RPC対応ファームウェアを書き込んだtorabo-tsuki LP XS

## 起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。データは外部へ送信せず、アプリの公開・ホスティングも前提にしていません。

## Macアプリ版

Apple Silicon Macでは、Web版と同じエディタをmacOSアプリとして利用できます。生成済みアプリは次の場所にあります。

```text
desktop/out/Torabo Tsuki Studio-darwin-arm64/Torabo Tsuki Studio.app
```

Finderからダブルクリックするか、必要に応じてApplicationsフォルダへドラッグしてください。再生成する場合は次を実行します。

```bash
npm run desktop:package
```

開発中にパッケージ化せず起動する場合は `npm run desktop:run` を使用します。Macアプリ版はmacOS 12以降のApple Silicon向けで、個人利用用のアドホック署名です。一般配布向けのApple Developer署名・公証は行っていません。

アプリはUSB接続時にmacOSのデバイス選択画面を表示し、選択したSerialデバイスだけを実行中に許可します。画面側のNode.jsアクセス、外部ページへの遷移、新規ウィンドウは無効です。

## 基本操作

1. 初期プレビュー、または「USB接続」から読み込んだキーマップを編集します。
2. 必要ならサイドバーの「レイヤーを追加」を押します。追加直後は全キーがTransparentです。
3. キーを選び、Behaviorとパラメータを設定します。キーコードはカテゴリを切り替え、カテゴリ内を検索して選べます。macOSのUS配列で使うCaps Lock、記号、Command / Option、F13〜F24、システム操作キーも選択できます。
4. 必要に応じてUndo／Redo、JSONのエクスポート／インポートを使います。
5. USB接続中に「変更を確認」を開き、差分を確認します。
6. 「デバイスへ書き込む」を明示的に押すと、変更をまとめて保存します。

## ポインター設定

1. USB接続すると、キーボード図の下にある「ポインター設定」へ現在値が読み込まれます。
2. 「カーソル速度」「スクロール速度」のスライダーと、縦・横方向の反転チェックを調整します。
3. 保存前に、スクロールレイヤーキー（初期キーマップでは左親指の `C_MUTE` キー）を押したまま `Q` を押し、ZMK Studioをアンロックします。
4. 「デバイスへ保存」を押します。保存成功後すぐに移動・スクロールへ反映され、再起動後も保持されます。

「Studio unlockが必要です」と表示された場合は手順3を行い、もう一度保存してください。「未対応」と表示された場合は、接続しているCentral側をポインター設定RPC対応ファームウェアへ更新してください。

USB接続前の編集はローカル下書きです。接続時には実機の内容で置き換わるため、後で適用したい下書きは先にExportし、接続後にImportしてください。実機から読み込んだ未対応Behaviorは、誤って壊さないよう、そのキーを変更するまでは元データを保持します。

## 開発・確認

```bash
npm run lint
npx tsc --noEmit
npm test
npm run desktop:build
```

- 要件: [`../docs/keymap-editor-requirements.md`](../docs/keymap-editor-requirements.md)
- 設計: [`../docs/keymap-editor-architecture.md`](../docs/keymap-editor-architecture.md)
- テスト計画: [`../docs/keymap-editor-test-plan.md`](../docs/keymap-editor-test-plan.md)

## 現在の制約

- 対象はXS（S相当）、右手トラックボール、USB接続です。
- レイヤー追加には、`config/keymap.keymap` の予約枠を含む最新ファームウェアが必要です。初期6層に4層を追加し、最大10層まで利用できます。レイヤー削除・並び替えは未対応です。
- Bluetooth接続は後続対応です。
- カーソル速度、スクロール速度、縦・横のスクロール反転は、このプロジェクト固有のStudio RPCで設定できます。センサー自体のCPIとAMLは対象外です。
- Macアプリ版から実機へのUSB接続、読込、およびポインター設定の保存・反映を確認済みです。追加した各キーコードの実キー割り当ては、必要なキーを一時レイヤーへ設定して個別に確認してください。
- Macアプリ版はApple Silicon専用です。Intel Macや一般配布用DMGは現在の対象外です。
