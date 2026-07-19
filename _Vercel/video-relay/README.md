# GrokShareBoard Video Relay

`tools/video-join`向けの実験用リバースプロキシです。

- 入力はGrok投稿のUUID形式だけを受け付けます。
- 転送先はxAIの公開MP4パスに固定しています。
- 動画は保存・加工せず、Vercelのexternal rewriteで中継します。
- CDNキャッシュは無効化しています。

## 検証URL

```text
https://<deployment>/video/982be014-4773-405f-aee6-be74c388e496
```

このURLが`video/mp4`を返し、GitHub PagesのJavaScriptから`fetch()`できればPoC成功です。

## GrokメディアURL解決

新形式のGrok Imagine投稿は、UUIDだけから予測できる`imagine-public.x.ai`ではなく、投稿APIが返す`assets.grok.com`上の実URLを使用します。次のAPIはGrok投稿UUIDを検証し、公開画像・動画URLだけを正規化して返します。

```text
https://<deployment>/api/post/984b3d10-9c2d-40c0-9c14-17a6f62bac2e
```

返却項目は`id`、`mediaType`、`mediaUrl`、`thumbnailImageUrl`、`mimeType`、`isV2`に限定しています。任意URLへのアクセスは受け付けません。
