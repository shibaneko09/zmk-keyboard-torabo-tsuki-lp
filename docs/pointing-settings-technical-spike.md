# ポインター設定ランタイム編集 技術検証

## 結論

カーソル速度、スクロール速度、スクロール方向は、ZMK本体を恒常的にフォークせずに実装できる。

既存のStudio Serialフレーミングを維持し、未使用のprotobuf field 6へプロジェクト固有の`pointing`サブシステムを追加する方式を採用する。GitHub Actionsで全7構成のビルドが成功し、ZMK本体の変更や別CDCポートが不要であることを確認した。

## 確認した事実

### Studio RPC

- ZMK v0.3の`studio.proto`は、外側の`Request`、`RequestResponse`でfield 3〜5を`core`、`behaviors`、`keymap`に使用している。field 6は未使用。
- ファームウェアのRPC実装は、Zephyr iterable sectionを使ってサブシステムとハンドラーを登録する構造になっている。
- 書き込み系ハンドラーには既存のStudio unlock判定を適用できる。
- 現行の`@zmkfirmware/zmk-studio-ts-client@0.0.18`はfield 6を知らないため、そのままでは送受信できない。ただしprotobufの未知fieldとして安全に読み飛ばす。
- PoCでfield 6のrequest/responseを生成し、既存デコーダーが既存fieldを壊さず未知fieldだけを読み飛ばすことを確認した。

### メッセージ定義の差し替え

- ZMK v0.3は`ZEPHYR_ZMK_STUDIO_MESSAGES_MODULE_DIR`配下の、CMakeに列挙されたprotoからnanopbコードをビルド時生成する。
- Zephyrは`ZEPHYR_EXTRA_MODULES`に与えた同名モジュールをwest由来モジュールより優先する。
- このリポジトリはすでにZMK外部モジュールとしてビルドされているため、ルートモジュールを`name: zmk-studio-messages`とし、互換proto一式を持たせることでoverrideできた。
- 追加型を別の`pointing.proto`にするとZMK v0.3のCMake列挙外になったため、`PointingSettings`、`PointingRequest`、`PointingResponse`は`studio.proto`へ内包した。これにより既存nanopb生成経路だけで完結する。

### PAW3222と速度調整

- 固定中の`zmk-driver-paw3222`コミットは`paw32xx_set_resolution()`を公開しており、200〜3200 CPIを実行時に設定できる。
- ZMK標準scalerは分子・分母と余りの繰り越しを使うため、低速時の小さな移動量を失わない。
- MVPのカーソル速度はランタイムscalerで実現し、CPI変更はcapability付きの後続項目にする。これによりセンサー依存を最小化できる。

## PoCのワイヤー仕様

field番号は既存ZMK Studioメッセージとの互換性を維持する。

```proto
message StudioRequest {
  uint32 request_id = 1;
  oneof subsystem {
    // core = 3, behaviors = 4, keymap = 5
    PointingRequest pointing = 6;
  }
}

message PointingSettings {
  uint32 cursor_scale_milli = 1;
  uint32 scroll_scale_milli = 2;
  bool invert_scroll_x = 3;
  bool invert_scroll_y = 4;
}
```

倍率は1000を1.0倍とする整数で保持する。現在値のスクロール`1/3`は333として扱い、Processor側で余りを繰り越す。

PoCの`getSettings` requestは6 bytesでZMK v0.3の既定RXバッファ30 bytesに収まり、代表的なresponseも30 bytes以下で既定TXバッファ64 bytesに収まる。書き込みrequestも設定項目を確定した時点で実バイト列をテストし、RX 30 bytesを超える場合だけバッファを明示的に拡張する。

## ファームウェアPoCの状態

- 完了: 互換proto一式を配置し、追加Pointing型を`studio.proto`へ内包した。
- 完了: ルートZephyr moduleを同名override候補にした。
- 完了: `get_settings`だけを返すunsecuredハンドラーを追加した。
- 完了: 専用snippetによりCentral 3構成だけでKconfigを有効化した。
- 完了: 既存proto 4ファイルが固定リビジョンと空白を除いて一致することを確認した。
- 完了: [GitHub Actions run 29642530897](https://github.com/shibaneko09/zmk-keyboard-torabo-tsuki-lp/actions/runs/29642530897)で全7構成と成果物マージが成功した。
- 完了: Pointing RPCを有効にしたCentral 3構成と、無効なPeripheral 3構成・settings-reset 1構成がすべて成功し、機能のスコープがCentralに限定されることを確認した。
- 完了: KconfigおよびC/CMake/nanopb生成に関する警告はなかった。CI警告は既存ActionsのNode.js 20非推奨通知のみだった。

## 採否基準

次をすべて満たせば同一Serial RPC方式を採用する。

- ZMK v0.3本体の変更なしでCentral 3構成がビルドできる。
- StudioなしのPeripheral構成に追加RPCコードがリンクされない。
- 既存のcore/behaviors/keymap RPCテストが通る。
- request/responseが設定したRPCバッファ内に収まる。
- 未対応ファームウェアを`RPC_NOT_FOUND`として判定できる。

今回の検証では全基準を満たしたため、同名module overrideと既存Serial RPCの拡張方式を採用する。

## 検証結果と残項目

- ローカル環境にwest、CMake、Zephyr SDKがないため、ファームウェアコンパイルはGitHub Actionsで実施し、全構成の成功を確認した。
- Macアプリ版から実機へ接続し、カーソル速度、スクロール速度、縦・横方向の設定が保存・反映されることを確認した。
- preview値の切断時ロールバックなど、通信途中で切断した場合の復旧試験は継続確認とする。
