# 作戦名：神話の国 — 公開手順（Claude Code向け）

島根2泊3日（2026/12/5〜7）の旅アプリ。位置情報・画面常時ON・音声読み上げを使うPWA。
claude.aiのArtifactでは位置情報が使えないため、GitHub Pagesで公開する。

## やること
1. このフォルダの中身（index.html, manifest.webmanifest, sw.js, icon-*.png）で
   GitHubに公開リポジトリ `minetaka829/shinwa-sakusen` を作る。
   例：`gh repo create minetaka829/shinwa-sakusen --public --source=. --push`
2. GitHub Pagesを main ブランチの / (root) から公開する。
   例：`gh api -X POST repos/minetaka829/shinwa-sakusen/pages -f "source[branch]=main" -f "source[path]=/"`
3. 公開URL `https://minetaka829.github.io/shinwa-sakusen/` が開けるか確認する（反映まで数分かかる）。

## 注意
- HTTPSでないと位置情報・画面常時ON・オフライン保存が動かない（GitHub Pagesは自動でHTTPS）。
- ファイルを更新したら、sw.js の `CACHE = 'mythops-v1'` の数字を上げると、スマホに新しい版が届きやすい。

## スマホでの使い方
- iPhone：SafariでURLを開く → 共有ボタン → 「ホーム画面に追加」
- Android：Chromeで開く → メニュー → 「ホーム画面に追加」（またはアプリをインストール）
- 旅行前に「デモ走行」で試す。本番は「本番（GPS）」で「任務開始」。

## ファイルの分担（第3版から）
- `index.html` 画面と見た目 ／ `app.js` 動き ／ `story.js` 任務地・定型のセリフ・読み方の表 ／ `route.js` 道中の案内（下調べの結果） ／ `plot.js` 物語
- `voice/` 録音した声と効果音。セリフを直したら VOICEVOX エンジン（`~/voicevox_engine/engine/run`）を起動して `node tools/make-voice.mjs`（変わった文だけ録り直す）
- 声の種類は `tools/voice.json`。物語の点検結果は `tools/story-review.md`
