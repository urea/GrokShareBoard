# Grok Share Board Project

## 概要
Grok Imagineの生成URLを共有・検索・閲覧できる掲示板サイト（キュレーションプラットフォーム）。
X（Twitter）のような動画プレビュー再生、プロンプト検索、ユーザーごとの生成物一覧などを提供する。

## ディレクトリ構成
- `_App/`: Next.js アプリケーションのソースコード
- `_Data/`: データベース (SQLite), ユーザーデータ
- `_Dev/`: 開発用ドキュメント, ツール, メモ
  - `docs/`: 仕様書など

## 技術スタック (予定)
- Framework: Next.js (App Router)
- Styling: Tailwind CSS
- Database: SQLite (better-sqlite3)
- Icons: Lucide React

## 開発ルール
- `_Dev/Tools` の既存ツールを活用する。
- ドキュメントは `_Dev/docs/misc` に `YYYYMMDD_Topic` 形式で保存。
- 日本語で開発・ドキュメント作成を行う。

## バージョニングルール
- `x.y.z` 形式
- `x` (Major): ユーザーの指示があった場合のみ上げる。
- `y` (Minor): 機能追加時に上げる。
- `z` (Patch): バグ修正時に上げる。
