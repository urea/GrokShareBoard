# Grok Share Board 実装計画

## 目標の概要
Grok Imagineの生成URL（`grok.com/imagine` および `vidgen.x.ai`）を共有するためのキュレーションプラットフォームを作成します。
主な機能：URLメタデータの抽出、動画プレビュー（Twitter風）、プロンプト検索、レスポンシブデザイン。

## ユーザーレビュー必須事項
- **データベース選定**: ローカル開発の簡便さのため SQLite (`better-sqlite3`) を使用。
- **技術スタック**: Next.js App Router + Tailwind CSS。
- **デザイン**: デフォルトでダークモード、プレミアムな "グラスモーフィズム" の美学を採用。

## 提案される変更

### プロジェクトルート
#### [NEW] [GEMINI.md](file:///c:/Archive/20260214GrokShareBoard/GEMINI.md)
プロジェクトのドキュメントとルール。

### _App (Next.js アプリケーション)
#### [NEW] [package.json](file:///c:/Archive/20260214GrokShareBoard/_App/package.json)
依存関係: `next`, `react`, `better-sqlite3`, `playwright` (メタデータスクレイピング用), `lucide-react`, `framer-motion`。

#### [NEW] [src/app/api/preview/route.ts](file:///c:/Archive/20260214GrokShareBoard/_App/src/app/api/preview/route.ts)
APIエンドポイント:
1. 対象URL（`grok.com/imagine/...`）を取得。
2. Playwrightを使用して `<meta property="og:..." />` を解析。
3. JSONを返却: `{ title, description (prompt), videoUrl, imageUrl, siteName }`。

#### [NEW] [src/lib/db.ts](file:///c:/Archive/20260214GrokShareBoard/_App/src/lib/db.ts)
SQLite接続とスキーマ定義。
スキーマ:
- `posts`: `id`, `url`, `prompt`, `user_id`, `width`, `height`, `created_at`。

#### [NEW] [src/components/ShareInput.tsx](file:///c:/Archive/20260214GrokShareBoard/_App/src/components/ShareInput.tsx)
URL貼り付け用の入力フィールド。送信時に `/api/preview` を呼び出し、ユーザー確認後にDBへ保存。

#### [NEW] [src/components/VideoCard.tsx](file:///c:/Archive/20260214GrokShareBoard/_App/src/components/VideoCard.tsx)
サムネイルを表示。ホバー時に動画を再生（`<video src={post.videoUrl} ... />`）。プロンプトの一部を表示。

## 検証計画
### 自動テスト
- `scripts/test_metadata.ts` スクリプトを作成し、既知のGrok URLを取得して、解析されたメタデータが期待値と一致することを確認する。
### 手動検証
- URLを貼り付ける -> 正しいサムネイル/動画を含むカードが表示されるか確認。
- カードにホバーする -> 動画が再生されるか確認。
- プロンプトのキーワードで検索 -> 該当する動画が結果に表示されるか確認。
