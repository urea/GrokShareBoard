# 設計案: Supabase Edge Functions を用いた非同期メタデータ補完 (Grok新仕様対応)

## 1. 背景と目的
Grokの配信仕様変更（assets.grok.com への移行）により、UUIDのみからリソースURL（特に動画）を予測することが不可能になった。クライアントサイドでのスクレイピングはCORS制限により困難なため、Supabase側のサーバーサイド処理を活用し、非同期で情報を補完する仕組みを構築する。

## 2. アーキテクチャ構成
本案では、データの「投稿」と「詳細情報の取得」を分離する。

### A. 投稿フェーズ (Client-side)
- ユーザーがGrok URLを投稿。
- アプリはUUIDを抽出し、DBに保存。
- 画像URLは暫定的に `https://grok.com/imagine/post/[UUID]/image?v=3` （救済URL）として保存。

### B. 補完フェーズ (Server-side / Asynchronous)
1. **トリガー**: Supabase DB への `INSERT` を Webhook で検知。
2. **実行**: Supabase Edge Function (`metadata-refresher`) を起動。
3. **取得**: 
   - Edge Function が Grok の投稿ページをフェッチ。
   - 必要に応じて Headless Browser サービス（JigsawStack, Browserless, Bright Data 等）を介して動的コンテンツを解析。
   - HTML内の `og:image` やネットワークリクエストから `user_id` および正式な `video_url` (`.mp4`) を抽出。
4. **反映**: 
   - 抽出した正式なURLでDBの当該行を `UPDATE`。

## 3. 実現に向けた技術的課題と解決策

| 課題 | 解決策 |
| :--- | :--- |
| **動的レンダリング** | GrokのページがJS実行を必要とする場合、単純な `fetch` ではなく Puppeteer / Playwright 互換の外部サービスを利用する。 |
| **IPブロック/Bot対策** | 住宅用プロキシ（Residential Proxy）を提供するスクレイピングAPIを利用し、Grok側からの遮断を回避する。 |
| **コスト** | Edge Function の実行回数を最適化。一度 `user_id` が判明したユーザーの別投稿については、UUIDと組み合わせるだけで済むため、フルスクレイピングを省略するキャッシュ戦略をとる。 |

## 4. 期待される効果
- **完全な動画再生**: 従来諦めていた新仕様動画のアプリ内再生が可能になる。
- **高精細画像**: `v=3` プロキシではなく、オリジナルの高解像度画像を保持できる。
- **ユーザー体験**: 投稿自体は即座に完了し、裏側で「魔法のように」詳細が埋まっていく体験を提供できる。

## 5. 次のステップ
1. Supabaseプロジェクトでの Edge Function 有効化。
2. 最小構成（単一URLのHTMLフェッチ）でのテスト関数の作成。
3. スクレイピングAPIの選定と試用。

---
**作成日**: 2026/03/17
**ステータス**: 検討案 (Proposal)
