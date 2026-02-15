
# Supabase セットアップ手順

Grok Share Board を動作させるための、Supabase（無料枠）のセットアップ手順です。

## 1. プロジェクトの作成
1. [Supabase](https://supabase.com/) にログインし、「**New project**」をクリックします。
2. 以下の情報を入力して「**Create new project**」をクリックします。
   - **Name**: `GrokShareBoard` (自由な名前でOK)
   - **Database Password**: 強力なパスワードを設定（後で使いませんが、忘れないように）
   - **Region**: `Tokyo` (推奨)

## 2. APIキーの取得
プロジェクトの作成が完了したら（数分かかります）、APIキーを取得してアプリに設定します。

1. サイドバーの「**Settings** (歯車アイコン)」→「**API**」を開きます。
2. **Project URL** と **Project API keys (anon / public)** の値をコピーします。
3. アプリの `_App/.env.local` ファイル（なければ作成）に以下のように貼り付けます。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 3. データベース（テーブル）の作成
SQLエディタを使って、データを保存するテーブルを作成します。

1. サイドバーの「**SQL Editor**」を開きます。
2. 「**New query**」をクリックし、以下のSQL文を貼り付けます。
3. 「**Run**」をクリックして実行します。

```sql
-- 投稿用テーブルの作成
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL, -- GrokのURL（重複禁止）
  prompt TEXT,
  user_id TEXT,
  video_url TEXT,
  image_url TEXT,
  width INTEGER,
  height INTEGER,
  site_name TEXT,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 簡易的な検索用インデックス
  search_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(prompt, '') || ' ' || coalesce(user_id, ''))
  ) STORED
);

-- 検索用インデックスの作成
CREATE INDEX posts_search_idx ON posts USING GIN (search_tsv);
CREATE INDEX posts_created_at_idx ON posts (created_at DESC);

-- Row Level Security (RLS) の設定
-- 誰でも読み取り可能、誰でも追加可能（認証なし運用のため）にする
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 読み取りポリシー（全員OK）
CREATE POLICY "Allow public read access"
ON posts FOR SELECT
TO anon
USING (true);

-- 書き込みポリシー（全員OK）
CREATE POLICY "Allow public insert access"
ON posts FOR INSERT
TO anon
WITH CHECK (true);
```

## 4. 完了
これでバックエンドの準備は完了です。
アプリ (`npm run dev`) を起動し、投稿ができるかテストしてください。
