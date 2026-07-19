export function extractGrokPostId(value: string) {
  const match = value.match(/post\/([a-f0-9-]{36})/i);
  return match ? match[1].toLowerCase() : null;
}

export interface ResolvedGrokMedia {
  id: string;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailImageUrl: string | null;
  mimeType: string | null;
  isV2: boolean;
}

const GROK_MEDIA_RESOLVER_BASE = 'https://grokshareboard-video-relay.vercel.app/api/post';
const GROK_VIDEO_RELAY_BASE = 'https://grokshareboard-video-relay.vercel.app/video';

function isResolvedGrokMedia(value: unknown): value is ResolvedGrokMedia {
  if (!value || typeof value !== 'object') return false;
  const media = value as Partial<ResolvedGrokMedia>;
  return typeof media.id === 'string'
    && (typeof media.mediaUrl === 'string' || media.mediaUrl === null)
    && (typeof media.thumbnailImageUrl === 'string' || media.thumbnailImageUrl === null);
}

export async function resolveGrokMedia(postId: string, signal?: AbortSignal) {
  const response = await fetch(`${GROK_MEDIA_RESOLVER_BASE}/${postId}`, {
    cache: 'no-store',
    signal,
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isResolvedGrokMedia(payload)) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error || '')
      : '';
    throw new Error(message || `Grok media resolution failed (${response.status}).`);
  }

  return payload;
}

export function isResolvedGrokVideo(media: ResolvedGrokMedia) {
  return media.mimeType?.startsWith('video/') === true
    || media.mediaType?.includes('VIDEO') === true;
}

export function buildGrokVideoRelayUrl(postId: string) {
  return `${GROK_VIDEO_RELAY_BASE}/${postId}`;
}

export function buildGrokPlayableVideoUrl(media: ResolvedGrokMedia) {
  if (!media.mediaUrl) return null;

  try {
    const host = new URL(media.mediaUrl).hostname;
    if (media.isV2 || host === 'assets.grok.com' || host === 'assets.grokusercontent.com') {
      return media.mediaUrl;
    }
  } catch {
    return null;
  }

  return buildGrokVideoRelayUrl(media.id);
}

export function buildGrokPublicVideoUrl(postId: string) {
  return `https://imagine-public.x.ai/imagine-public/share-videos/${postId}.mp4`;
}

export function buildGrokImageProxyUrl(postId: string, cacheBust = false) {
  const base = `https://grok.com/imagine/post/${postId}/image?v=3`;
  return cacheBust ? `${base}&t=${Date.now()}` : base;
}
