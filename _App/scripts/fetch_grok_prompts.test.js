const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchGrokPost,
  getAssetGenerationInput,
  getAssetInputIds,
  grokPostFromAsset,
  parseArgs,
} = require('./fetch_grok_prompts');

const TARGET_ID = 'a1e640fd-f36e-4178-bc35-e914858c5208';
const SOURCE_ID = '3b2263c7-ba8f-4902-ae96-b7795ddb2049';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('extracts imageToVideo prompt and source asset ancestry', () => {
  const asset = {
    assetId: TARGET_ID,
    mimeType: 'video/mp4',
    mediaGenInput: {
      imageToVideo: {
        prompt: 'sample motion prompt',
        inputAssets: [SOURCE_ID],
      },
    },
  };

  const generationInput = getAssetGenerationInput(asset);
  assert.equal(generationInput.kind, 'imageToVideo');
  assert.deepEqual(getAssetInputIds(asset, generationInput), [SOURCE_ID]);

  const post = grokPostFromAsset(asset, TARGET_ID);
  assert.equal(post.prompt, 'sample motion prompt');
  assert.equal(post.originalPostId, SOURCE_ID);
  assert.equal(post.mediaType, 'MEDIA_POST_TYPE_VIDEO');
  assert.equal(post.generationKind, 'imageToVideo');
});

test('falls back from an empty V2 media post to the public Asset API', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url.endsWith('/rest/media/post/get')) {
      return jsonResponse({ post: { id: TARGET_ID, isV2: true, prompt: '' } });
    }
    if (url.endsWith(`/rest/assets/${TARGET_ID}`)) {
      return jsonResponse({
        assetId: TARGET_ID,
        mimeType: 'video/mp4',
        isPublic: true,
        mediaGenInput: {
          imageToVideo: {
            prompt: 'sample motion prompt',
            inputAssets: [SOURCE_ID],
          },
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchGrokPost(TARGET_ID, fetchImpl);
  assert.equal(result.origin, 'asset');
  assert.equal(result.mediaStatus, 200);
  assert.equal(result.assetStatus, 200);
  assert.equal(result.json.post.prompt, 'sample motion prompt');
  assert.equal(result.json.post.originalPostId, SOURCE_ID);
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'GET']);
});

test('keeps the legacy media-post path when it already has a prompt', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    return jsonResponse({ post: { id: TARGET_ID, prompt: 'legacy prompt' } });
  };

  const result = await fetchGrokPost(TARGET_ID, fetchImpl);
  assert.equal(result.origin, 'media_post');
  assert.equal(result.json.post.prompt, 'legacy prompt');
  assert.equal(result.assetStatus, null);
  assert.equal(calls.length, 1);
});

test('accepts targeted and no-prompt retry options', () => {
  const args = parseArgs(['--id', TARGET_ID, '--retry-no-prompt']);
  assert.equal(args.grokId, TARGET_ID);
  assert.equal(args.retryNoPrompt, true);
});
