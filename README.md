# Grok Share Board

Grok Imagineの生成URLを共有・検索・閲覧できる掲示板サイト（キュレーションプラットフォーム）です。
X（Twitter）のような動画プレビュー再生、プロンプト検索、ユーザーごとの生成物一覧などを提供します。

**Grok Share Board** は、xAIのGrokによって生成された画像や動画（Grok Imagine）を共有・閲覧・検索できるキュレーションプラットフォームです。
Monsnodeライクな高密度グリッドレイアウトを採用し、視覚的に楽しめるインターフェースを提供します。

## 🌐 サイトにアクセス (Live Demo)

**[Grok Share Board を開く](https://urea.github.io/GrokShareBoard/)**
(GitHub Pagesにて公開中)

---

## 🚀 主な機能

- **Grok URL共有**: `https://grok.com/imagine/...` のリンクを貼るだけで、自動的にサムネイルとメタデータを取得・投稿できます。
- **スマートプレビュー**:
  - クライアントサイドでのサムネイル自動推測（`[UUID]_thumbnail.jpg`）により、**GitHub Pages等の静的ホスティングでも動作**します。
  - 動画生成待ち（404/Processing）の場合の自動リトライ機能搭載。
- **高密度グリッド表示**: 動画/画像をタイル状に敷き詰め、マウスホバーで動画をプレビュー再生（モンズ方式）。
- **ユーザープロフィール**: 投稿者のユーザーIDごとの作品一覧ページ（`/user/[id]`）。
- **検索機能**: プロンプト内容によるフィルタリング。

## 📝 使い方

1. **投稿する**:
   - Grokで画像/動画を生成し、そのURLをコピーします。
   - サイト上部の入力欄にペーストし、"Post GrokImagine" をクリックします。
   - プレビューが表示されたら、"Share Post" で投稿完了です。
2. **閲覧する**:
   - トップページに最新の投稿がグリッド表示されます。
   - マウスホバーで動画が再生されます。
   - 画像をクリックすると、Grokの元ページが開きます。

---

## 💻 開発者向け情報 (For Developers)

### 🛠 技術スタック

- **Framework**: Next.js 15+ (App Router)
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel / GitHub Pages (Static Export compatible)

### 📦 ローカルセットアップ

リポジトリをクローンして開発を行う場合の手順です。利用するだけなら不要です。

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

### 備考
このプロジェクトは、Grokの生成物が「実際にユーザーがそのページを訪問しないと生成されない（Lazy Generation）」仕様や、CORS制限などの課題をクライアントサイドの工夫で解決しています。

## ディレクトリ構成

- `_App/`: アプリケーションのソースコード
- `_Data/`: データベースファイル (`grokshare.db`)
- `_Dev/`: 開発用ドキュメント
