const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MEDIA_HOSTS = [
  'assets.grok.com',
  'assets.grokusercontent.com',
  'imagine-public.x.ai',
  'imgen.x.ai',
  'vidgen.x.ai',
];

function isAllowedMediaUrl(value) {
  if (typeof value !== 'string' || !value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_MEDIA_HOSTS.some((host) => (
      url.hostname === host || url.hostname.endsWith(`.${host}`)
    ));
  } catch {
    return false;
  }
}

function findMediaPost(post) {
  const candidates = [
    post,
    ...(Array.isArray(post?.videos) ? post.videos : []),
    ...(Array.isArray(post?.images) ? post.images : []),
  ].filter(Boolean);

  return candidates.find((candidate) => isAllowedMediaUrl(candidate?.mediaUrl)) || post;
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const id = String(firstQueryValue(request.query?.id) || '').toLowerCase();
  if (!UUID_PATTERN.test(id)) {
    response.status(400).json({ error: 'A valid Grok post UUID is required.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstream = await fetch('https://grok.com/rest/media/post/get', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'GrokShareBoard-MediaResolver/1.0',
      },
      body: JSON.stringify({ id }),
      signal: controller.signal,
    });

    const text = await upstream.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // The status and a generic message below are enough for the public client.
    }

    if (!upstream.ok || !payload?.post) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(upstream.status || 502).json({
        error: payload?.message || 'Grok media could not be resolved.',
      });
      return;
    }

    const post = payload.post;
    const mediaPost = findMediaPost(post);
    const mediaUrl = isAllowedMediaUrl(mediaPost?.mediaUrl) ? mediaPost.mediaUrl : null;
    const thumbnailCandidate = post.thumbnailImageUrl || mediaPost?.thumbnailImageUrl;
    const thumbnailImageUrl = isAllowedMediaUrl(thumbnailCandidate)
      ? thumbnailCandidate
      : String(mediaPost?.mimeType || '').startsWith('image/')
        ? mediaUrl
        : null;

    if (!mediaUrl && !thumbnailImageUrl) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(404).json({ error: 'No public media URL was returned by Grok.' });
      return;
    }

    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    response.status(200).json({
      id,
      mediaType: mediaPost?.mediaType || post.mediaType || null,
      mediaUrl,
      thumbnailImageUrl,
      mimeType: mediaPost?.mimeType || post.mimeType || null,
      isV2: mediaPost?.isV2 === true || post.isV2 === true,
    });
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store');
    response.status(error?.name === 'AbortError' ? 504 : 502).json({
      error: error?.name === 'AbortError'
        ? 'Grok media resolution timed out.'
        : 'Grok media resolution failed.',
    });
  } finally {
    clearTimeout(timeout);
  }
};
