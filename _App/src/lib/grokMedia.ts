export function extractGrokPostId(value: string) {
  const match = value.match(/post\/([a-f0-9-]{36})/i);
  return match ? match[1].toLowerCase() : null;
}

export function buildGrokPublicVideoUrl(postId: string) {
  return `https://imagine-public.x.ai/imagine-public/share-videos/${postId}.mp4`;
}

export function buildGrokImageProxyUrl(postId: string, cacheBust = false) {
  const base = `https://grok.com/imagine/post/${postId}/image?v=3`;
  return cacheBust ? `${base}&t=${Date.now()}` : base;
}
