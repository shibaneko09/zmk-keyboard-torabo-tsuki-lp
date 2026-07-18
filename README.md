
[torabo-tsuki LP](https://github.com/sekigon-gonnoc/torabo-tsuki-lp)用のZMKファームウェア

* _centralがついているuf2をトラックボールがついている方に、_peripheralを反対側に書き込んでください
* キーマップはkeymap-editorおよびzmk-studioで編集できます

## torabo-tsuki XS Keymap Editor（ローカル専用）

XS（S相当レイアウト）のキーマップを視覚的に編集し、USB接続したキーボードへ差分確認後に一括反映するための個人用Web・macOSアプリを `studio/` に収録しています。macOS US配列向けキーの選択と、カーソル速度・スクロール速度・スクロール方向の実機設定にも対応しています。

```bash
cd studio
npm install
npm run dev
```

ChromeまたはEdgeで `http://localhost:3000` を開いて使用します。詳しい手順と現在の制約は [`studio/README.md`](studio/README.md) を参照してください。

Apple Silicon Macでは、生成済みの `Torabo Tsuki Studio.app` を通常のmacOSアプリとして起動できます。生成方法と配置場所は [`studio/README.md`](studio/README.md) の「Macアプリ版」を参照してください。
