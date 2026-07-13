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
