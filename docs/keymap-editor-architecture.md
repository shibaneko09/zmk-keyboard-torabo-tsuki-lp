# torabo-tsuki LP XS Keymap Editor 設計

## 構成

Webアプリは `studio/` に配置し、React、TypeScript、vinext/Viteで構築する。キーボード通信には公式 `@zmkfirmware/zmk-studio-ts-client` を使用する。

```text
UI
├── Layer sidebar
├── S-layout keyboard canvas
├── Binding editor
└── Diff / import / export dialogs
        │
        ▼
Editor state
├── deviceSnapshot  接続・Import直後の基準
├── draft           編集中の状態
└── history         Undo / Redo
        │
        ▼
Device client interface
├── BrowserZmkClient  Web Serial + ZMK Studio RPC
└── MockZmkClient     実機なしの開発・テスト
```

## Macアプリ

ElectronレンダラーはWeb版の `EditorApp` とCSSを共有し、Viteでローカルファイルへ静的バンドルする。Electronのメインプロセスはウィンドウ管理とWeb Serial権限だけを担当し、編集データやZMK RPCには介入しない。

```text
Electron main
├── file:// rendererを読込
├── Serial権限をfile://だけに限定
├── ネイティブデバイス選択
└── 外部遷移・新規ウィンドウ・WebViewを拒否
        │
        ▼
Shared React EditorApp
        │
        ▼
BrowserZmkClient / ZMK Studio RPC
```

`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`とし、preload APIは設けない。Apple Silicon用アプリは公式Electron Packagerで生成し、個人利用向けにアドホック署名する。

## レイアウトマッピング

デフォルトキーマップはLレイアウト基準の66バインディングで定義されている。Sレイアウトで実在する44キーは、`position_map_s_1` の逆引きにより次の論理位置へ対応する。

```text
13–22
25–29, 32–36
39–50
53–64
```

接続したデバイスが44バインディングだけを返す場合は0–43を直接使い、66バインディングを返す場合は上記マッピングを使う。

## データモデル

- `KeymapDocument`: デバイス、レイアウト、Behavior一覧、レイヤー一覧
- `Layer`: 永続ID（追加前は負数の一時ID）、名称、バインディング配列
- `Binding`: Behavior IDと2個の数値パラメーター
- `BehaviorDefinition`: デバイスから取得した表示名とパラメーター仕様
- `KeyChange`: レイヤーID、論理位置、変更前後のBinding

RPCが数値IDを使用するため、アプリ内部でも数値を正として保持する。表示名やキーコードラベルは表示時だけ解決する。

## 書き込み手順

1. `deviceSnapshot` と `draft` を比較する。
2. ユーザーへ差分を提示する。
3. 追加レイヤーがあれば `addLayer` で予約枠を有効化し、一時IDを実機IDへ対応付ける。
4. 追加レイヤーの名称と、Transparent初期値から変更されたキーを送信する。
5. レイヤー名変更を `setLayerProps` で送信する。
6. キー変更を `setLayerBinding` で順次送信する。追加レイヤーへの参照は実機IDへ置換する。
7. 全リクエスト成功後に `saveChanges` を送る。
8. 成功時は再読込結果を新しい基準にする。
9. 失敗時は `discardChanges` を試行し、基準を変更しない。

## レイヤー追加

ZMK StudioはDevicetreeに存在しないレイヤーを増やせないため、`config/keymap.keymap` に4個の `status = "reserved"` レイヤーを用意する。エディタはデバイスが返す `availableLayers` を上限として表示し、初期6層と合わせて最大10層まで扱う。追加直後の全キーはTransparentで、書き込みまでは負数の一時IDを使う。レイヤー削除・並び替えは今回の対象外とする。

## Centralの扱い

アプリは左右を指定しない。Web Serialで選択されたStudio RPC対応Centralからデバイス情報を読み取る。右手トラックボール構成で実際に使用するファームウェアは、商品到着後に既存の左右Centralビルドから判定する。

## トラックボール拡張

現行のPAW3222 CPI、Input Processor、AMLはDevicetreeの静的設定であり、標準Studio RPCには設定APIがない。初版完成後に次を技術検証する。

1. PAW3222ドライバのランタイムCPI変更
2. Zephyr Settingsによる永続化
3. スクロールProcessorとAML設定のランタイム状態化
4. 既存RPCを壊さない専用通信経路

安定性・復旧性を保証できない場合は、ライブ編集ではなくファームウェア設定生成へ切り替える。
