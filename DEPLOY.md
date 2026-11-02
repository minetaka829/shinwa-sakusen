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
