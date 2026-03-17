# 設計案: Supabase Edge Functions を用いた非同期メタデータ補完 (Grok新仕様対応)

## 1. 背景と目的
Grokの配信仕様変更により、動画配信URL (`assets.grok.com`) には `user_id` が含まれるようになった。画像については `v=3` プロキシで救済可能だが、動画再生には `user_id` の特定が不可欠である。本案では、スクレイピングの目的を「`user_id` の抽出」に一点集中させ、動画URLを動的に合成・補完する仕組みを構築する。

## 2. 実装戦略: user_id 合成方式
動画URLは以下の規則に従うことが判明している：
`https://assets.grok.com/users/[user_id]/generated/[post_uuid]/generated_video.mp4`

このため、Edge Function は mp4 の実体を探すのではなく、**ページ内のどこかに記載されている `user_id` を見つけるだけでよい。**

### ワークフロー
1. **投稿**: クライアントは URL (UUID) のみを投稿。画像は `v=3` プロキシで即時表示。
2. **検知**: Supabase Webhook が `posts` テーブルへの挿入を検知。
3. **抽出 (Edge Function)**:
   - Grok ページをフェッチ。
   - `og:image` 等のメタタグ、または HTML 内のスクリプトから `assets.grok.com/users/([a-z0-9-]+)/` のパターンを正規表現で抽出。
4. **合成**: 抽出した `user_id` と、既知の `post_uuid` を組み合わせて `.mp4` URL を生成。
5. **反映**: DB の `video_url` だけを更新。画像 URL は `v=3` のままでも運用上問題ないため、深追いしない。

## 3. Supabase 側の確認事項
実現に向けて、以下の環境設定を確認する必要がある。

| 項目 | 確認内容 |
| :--- | :--- |
| **Edge Functions** | `Functions` セクションからデプロイ可能か。 |
| **Database Webhooks** | `Database > Webhooks` にて INSERT 契機の関数呼び出しを設定できるか。 |
| **Service Role** | RLS を超えて `video_url` を更新するための `service_role` キーが正しく利用できるか。 |

## 4. 期待される効果
- **確実性の向上**: mp4 ファイルへの直接リンクを探すよりも、HTML 内のユーザーID（通常メタタグに含まれる）を探す方が解析難易度が低い。
- **メンテナンスコストの低下**: 画像救済URLを活用し続けることで、画像配信系の大規模な仕様変更リスクを分散できる。

---
**更新日**: 2026/03/17
**ステータス**: 検討案 (Refined Proposal - user_id Focus)

---
**作成日**: 2026/03/17
**ステータス**: 検討案 (Proposal)
