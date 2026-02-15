# Grok Share Board 実装計画

## 目標の概要
Grok Imagineの生成URL（`grok.com/imagine` および `vidgen.x.ai`）を共有するためのキュレーションプラットフォームを作成します。
**現在のフォーカス**: ユーザープロファイルページの追加。特定のユーザーが生成したコンテンツを一覧表示し、コレクションとして閲覧できるようにします。

## ユーザーレビュー必須事項
- **URL構造**: `/user/[userId]` を採用。ユーザーIDはメタデータから抽出されたUUID（またはハッシュ）を使用。
- **デザイン**: メインフィードと同じくグリッドレイアウトを使用。ヘッダーにユーザー統計（投稿数など）を表示。

## 提案される変更

### _App (Next.js アプリケーション)

#### [NEW] [src/app/user/[userId]/page.tsx](file:///c:/Archive/20260214GrokShareBoard/_App/src/app/user/[userId]/page.tsx)
ユーザープロフィールページ。
- URLパラメータ `userId` を取得。
- API `/api/posts?user_id=[userId]` を呼び出して投稿を取得。
- ユーザーごとの投稿一覧をグリッド表示。

#### [MODIFY] [src/app/api/posts/route.ts](file:///c:/Archive/20260214GrokShareBoard/_App/src/app/api/posts/route.ts)
GETメソッドの更新。
- クエリパラメータ `user_id` をサポート。
- 指定された場合、そのユーザーの投稿のみをフィルタリングして返す。

#### [MODIFY] [src/components/VideoCard.tsx](file:///c:/Archive/20260214GrokShareBoard/_App/src/components/VideoCard.tsx)
ユーザーリンクの追加。
- フッター部分に "User: [ID]" のリンクを追加。
- クリックすると `/user/[userId]` に遷移。

## 検証計画
### 手動検証
- 任意の投稿のカード内の「User ID」リンクをクリック -> `/user/[ID]` に遷移することを確認。
- プロフィールページで、そのユーザーの投稿のみが表示されていることを確認。
- 存在しないユーザーIDにアクセスした場合の挙動（空の状態）を確認。
