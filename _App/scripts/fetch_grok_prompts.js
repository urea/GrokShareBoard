const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');
const LOCAL_ENV_PATH = path.resolve(REPO_ROOT, '_Dev', 'Tools', 'db-admin.env');

const TERMINAL_STATUSES = new Set(['no_prompt', 'source_missing', 'access_denied']);

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseArgs(argv) {
  const args = {
    apply: false,
    all: false,
    applyNsfw: false,
    retryAccessDenied: false,
    includePrompt: false,
    limit: 100,
    delayMs: 750,
    maxSourceDepth: 3,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--all') args.all = true;
    else if (arg === '--apply-nsfw') args.applyNsfw = true;
    else if (arg === '--retry-access-denied') args.retryAccessDenied = true;
    else if (arg === '--no-retry-access-denied') args.retryAccessDenied = false;
    else if (arg === '--include-prompt') args.includePrompt = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1]);
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.split('=')[1]);
    else if (arg === '--max-source-depth') args.maxSourceDepth = Number(argv[++i]);
    else if (arg.startsWith('--max-source-depth=')) args.maxSourceDepth = Number(arg.split('=')[1]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 5000) {
    throw new Error('--limit must be an integer between 1 and 5000');
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0 || args.delayMs > 10000) {
    throw new Error('--delay-ms must be between 0 and 10000');
  }
  if (!Number.isInteger(args.maxSourceDepth) || args.maxSourceDepth < 0 || args.maxSourceDepth > 10) {
    throw new Error('--max-source-depth must be an integer between 0 and 10');
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/fetch_grok_prompts.js --dry-run --limit 20
  node scripts/fetch_grok_prompts.js --apply --limit 100 --delay-ms 750
  node scripts/fetch_grok_prompts.js --apply --all --limit 5000 --max-source-depth 3

Default target:
  pending and failed rows only.
  Terminal statuses are skipped: fetched, no_prompt, source_missing, access_denied.

Options:
  --apply                Update public.posts and public.post_prompt_sources.
  --dry-run              Fetch and report only. This is the default.
  --limit N              Maximum rows to process. Default: 100, max: 5000.
  --delay-ms N           Minimum delay between Grok API calls. Default: 750.
  --all                  Include every row regardless of current fetch status.
  --max-source-depth N   Follow originalPost ancestry up to N levels. Default: 3.
  --retry-access-denied     Include access_denied rows in the normal target set.
  --no-retry-access-denied  Skip access_denied rows.
  --apply-nsfw           When Grok rRated is true, set posts.nsfw = true. Never sets false.
  --include-prompt       Include full prompt text in the local JSON report. Do not use in CI.
`);
}

function readLocalConnectionString() {
  if (!fs.existsSync(LOCAL_ENV_PATH)) return null;
  const env = fs.readFileSync(LOCAL_ENV_PATH, 'utf8');
  const explicit = (env.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m) || [])[1]?.trim();
  const raw = env
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^postgres(ql)?:\/\//.test(line));
  return explicit || raw || null;
}

function readConnectionString() {
  const connectionString = process.env.DATABASE_URL || readLocalConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Set it as a GitHub repository secret or in _Dev/Tools/db-admin.env for local runs.');
  }
  if (/YOUR|PASSWORD|\[.*\]/i.test(connectionString)) {
    throw new Error('DATABASE_URL appears to contain a placeholder password.');
  }
  return connectionString;
}

function normalizeUuid(value) {
  const match = String(value || '').match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  return match ? match[0].toLowerCase() : null;
}

function uuidFromPost(post) {
  return normalizeUuid(post.url) || normalizeUuid(post.id) || String(post.id).toLowerCase();
}

function hashText(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRateLimitedFetcher(delayMs) {
  let lastCallStartedAt = 0;
  return async (id) => {
    if (delayMs > 0 && lastCallStartedAt > 0) {
      const waitMs = lastCallStartedAt + delayMs - Date.now();
      if (waitMs > 0) await sleep(waitMs);
    }
    lastCallStartedAt = Date.now();
    return fetchGrokPost(id);
  };
}

async function fetchGrokPost(id) {
  const res = await fetch('https://grok.com/rest/media/post/get', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep the raw response for classification below.
  }

  return { status: res.status, ok: res.ok, text, json };
}

async function ensurePromptSourcesSchema(client) {
  await client.query(`
    create table if not exists public.post_prompt_sources (
      post_id uuid not null references public.posts(id) on delete cascade,
      depth integer not null check (depth >= 1 and depth <= 20),
      grok_post_id uuid not null,
      parent_grok_post_id uuid,
      media_type text,
      prompt text,
      prompt_fetch_status text not null default 'pending' check (
        prompt_fetch_status in ('pending', 'fetched', 'no_prompt', 'source_missing', 'access_denied', 'failed')
      ),
      prompt_fetch_error text,
      prompt_fetched_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (post_id, depth),
      unique (post_id, grok_post_id)
    );

    create index if not exists post_prompt_sources_grok_post_id_idx
      on public.post_prompt_sources (grok_post_id);

    create index if not exists post_prompt_sources_status_idx
      on public.post_prompt_sources (prompt_fetch_status);

    comment on table public.post_prompt_sources is
      'Original/source prompt ancestry for Grok Share Board posts. posts.prompt stores the current shared post prompt; this table stores parent/source prompts.';

    comment on column public.post_prompt_sources.depth is
      '1 is the direct source/original post of posts.id. Larger values follow originalPostId ancestry.';

    alter table public.post_prompt_sources enable row level security;

    do $$
    begin
      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'post_prompt_sources'
          and policyname = 'Allow public read access to post prompt sources'
      ) then
        create policy "Allow public read access to post prompt sources"
          on public.post_prompt_sources
          for select
          to anon, authenticated
          using (true);
      end if;
    end
    $$;

    create or replace view public.posts_search_index
    with (security_invoker = true) as
    select
      p.*,
      coalesce(
        string_agg(s.prompt, E'\\n' order by s.depth)
          filter (
            where s.prompt_fetch_status = 'fetched'
              and nullif(btrim(s.prompt), '') is not null
          ),
        ''
      ) as source_prompt_text
    from public.posts p
    left join public.post_prompt_sources s
      on s.post_id = p.id
    group by p.id;

    grant select on public.post_prompt_sources to anon, authenticated;
    grant select on public.posts_search_index to anon, authenticated;
  `);
}

async function loadTargets(client, args) {
  const params = [];
  const clauses = [];

  if (!args.all) {
    const statuses = args.retryAccessDenied
      ? ['pending', 'failed', 'access_denied']
      : ['pending', 'failed'];
    params.push(statuses);
    clauses.push(`coalesce(prompt_fetch_status, 'pending') = any($${params.length})`);
  }

  params.push(args.limit);
  const where = clauses.length > 0 ? `where ${clauses.join(' and ')}` : '';
  const limit = `limit $${params.length}`;
  const result = await client.query(
    `
      select
        id,
        url,
        prompt,
        description,
        nsfw,
        prompt_fetch_status,
        prompt_fetched_at,
        created_at
      from public.posts
      ${where}
      order by
        case coalesce(prompt_fetch_status, 'pending')
          when 'pending' then 0
          when 'failed' then 1
          when 'access_denied' then 2
          else 3
        end,
        created_at desc
      ${limit}
    `,
    params,
  );
  return result.rows;
}

async function markFetched(client, post, grokPost, args) {
  const setNsfw = args.applyNsfw && grokPost.rRated === true && post.nsfw !== true;
  const sql = setNsfw
    ? `
      update public.posts
      set
        prompt = $1,
        prompt_fetched_at = now(),
        prompt_fetch_status = 'fetched',
        prompt_fetch_error = null,
        nsfw = true
      where id = $2
    `
    : `
      update public.posts
      set
        prompt = $1,
        prompt_fetched_at = now(),
        prompt_fetch_status = 'fetched',
        prompt_fetch_error = null
      where id = $2
    `;
  await client.query(sql, [grokPost.prompt, post.id]);
}

function classifyFailure(status, message) {
  if (status === 200) {
    return {
      fetchStatus: 'no_prompt',
      errorMessage: null,
    };
  }
  if (status === 403 && /could not access the content/i.test(message || '')) {
    return {
      fetchStatus: 'access_denied',
      errorMessage: `${status}: ${message}`.slice(0, 1000),
    };
  }
  if (status === 404 && /(Media post not found|Post not found)/i.test(message || '')) {
    return {
      fetchStatus: 'source_missing',
      errorMessage: `${status}: ${message}`.slice(0, 1000),
    };
  }
  return {
    fetchStatus: 'failed',
    errorMessage: `${status}: ${message}`.slice(0, 1000),
  };
}

async function markFailed(client, post, status, message) {
  const classified = classifyFailure(status, message);
  const shouldClearPrompt = TERMINAL_STATUSES.has(classified.fetchStatus);
  await client.query(
    `
      update public.posts
      set
        prompt = case when $4 then null else prompt end,
        prompt_fetch_status = $1,
        prompt_fetch_error = $2,
        prompt_fetched_at = case when $4 then now() else prompt_fetched_at end
      where id = $3
    `,
    [classified.fetchStatus, classified.errorMessage, post.id, shouldClearPrompt],
  );
  return classified;
}

function getEmbeddedPostById(grokPost, id) {
  const candidates = [
    grokPost?.originalPost,
    grokPost?.original_post,
    ...(Array.isArray(grokPost?.images) ? grokPost.images : []),
    ...(Array.isArray(grokPost?.videos) ? grokPost.videos : []),
  ].filter(Boolean);

  return candidates.find((candidate) => normalizeUuid(candidate?.id) === id) || null;
}

function getOriginalPostCandidate(grokPost) {
  if (!grokPost || typeof grokPost !== 'object') return null;

  const selfId = normalizeUuid(grokPost.id);
  const originalId = normalizeUuid(
    grokPost.originalPostId
      || grokPost.original_post_id
      || grokPost.parentPostId
      || grokPost.originalPost?.id
      || grokPost.original_post?.id,
  );

  if (originalId && originalId !== selfId) {
    return {
      id: originalId,
      post: getEmbeddedPostById(grokPost, originalId),
    };
  }

  const candidates = [
    grokPost.originalPost,
    grokPost.original_post,
    ...(Array.isArray(grokPost.images) ? grokPost.images : []),
    ...(Array.isArray(grokPost.videos) ? grokPost.videos : []),
  ].filter(Boolean);

  const embedded = candidates.find((candidate) => {
    const id = normalizeUuid(candidate?.id);
    return id && id !== selfId;
  });

  return embedded
    ? {
        id: normalizeUuid(embedded.id),
        post: embedded,
      }
    : null;
}

function buildSourceReportRow(source, includePrompt) {
  const reportRow = {
    depth: source.depth,
    grokPostId: source.grokPostId,
    parentGrokPostId: source.parentGrokPostId,
    mediaType: source.mediaType,
    fetchStatus: source.fetchStatus,
    httpStatus: source.httpStatus,
    promptLength: source.prompt?.length || 0,
    promptHash: source.prompt ? hashText(source.prompt) : null,
    error: source.error,
  };
  if (includePrompt && source.prompt) reportRow.prompt = source.prompt;
  return reportRow;
}

async function collectPromptSources(rootGrokPost, grokFetch, args) {
  const rootId = normalizeUuid(rootGrokPost?.id);
  const visited = new Set(rootId ? [rootId] : []);
  const sources = [];
  let candidate = getOriginalPostCandidate(rootGrokPost);

  for (let depth = 1; depth <= args.maxSourceDepth; depth += 1) {
    const sourceId = normalizeUuid(candidate?.id);
    if (!sourceId || visited.has(sourceId)) break;
    visited.add(sourceId);

    let sourcePost = normalizeUuid(candidate?.post?.id) === sourceId ? candidate.post : null;
    let fetchStatus = null;
    let error = null;
    let httpStatus = null;

    if (!sourcePost?.prompt?.trim()) {
      const fetched = await grokFetch(sourceId);
      httpStatus = fetched.status;
      const fetchedPost = fetched.json?.post;

      if (fetched.ok && fetchedPost) {
        sourcePost = fetchedPost;
      } else {
        const message = fetched.json?.message || fetched.text.slice(0, 240) || 'empty response';
        const classified = classifyFailure(fetched.status, message);
        fetchStatus = classified.fetchStatus;
        error = classified.errorMessage;
      }
    }

    const prompt = sourcePost?.prompt?.trim() ? sourcePost.prompt : null;
    if (!fetchStatus) fetchStatus = prompt ? 'fetched' : 'no_prompt';

    sources.push({
      depth,
      grokPostId: sourceId,
      parentGrokPostId: normalizeUuid(sourcePost?.originalPostId || sourcePost?.original_post_id),
      mediaType: sourcePost?.mediaType || null,
      prompt,
      fetchStatus,
      error,
      httpStatus,
    });

    if (!sourcePost) break;
    candidate = getOriginalPostCandidate(sourcePost);
  }

  return sources;
}

async function replacePromptSources(client, postId, sources) {
  await client.query('delete from public.post_prompt_sources where post_id = $1', [postId]);
  if (sources.length === 0) return;

  const values = [];
  const params = [];
  for (const source of sources) {
    const offset = params.length;
    params.push(
      postId,
      source.depth,
      source.grokPostId,
      source.parentGrokPostId,
      source.mediaType,
      source.prompt,
      source.fetchStatus,
      source.error,
    );
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, now(), now())`);
  }

  await client.query(
    `
      insert into public.post_prompt_sources (
        post_id,
        depth,
        grok_post_id,
        parent_grok_post_id,
        media_type,
        prompt,
        prompt_fetch_status,
        prompt_fetch_error,
        prompt_fetched_at,
        updated_at
      )
      values ${values.join(', ')}
    `,
    params,
  );
}

function emptySummary() {
  return {
    targets: 0,
    fetched: 0,
    noPrompt: 0,
    sourceMissing: 0,
    accessDenied: 0,
    failed: 0,
    updated: 0,
    nsfwCandidates: 0,
    sourceRows: 0,
    sourceFetched: 0,
    sourceNoPrompt: 0,
    sourceMissingRows: 0,
    sourceAccessDenied: 0,
    sourceFailed: 0,
  };
}

function countFailure(summary, fetchStatus) {
  if (fetchStatus === 'no_prompt') summary.noPrompt += 1;
  else if (fetchStatus === 'source_missing') summary.sourceMissing += 1;
  else if (fetchStatus === 'access_denied') summary.accessDenied += 1;
  else summary.failed += 1;
}

function countSource(summary, fetchStatus) {
  summary.sourceRows += 1;
  if (fetchStatus === 'fetched') summary.sourceFetched += 1;
  else if (fetchStatus === 'no_prompt') summary.sourceNoPrompt += 1;
  else if (fetchStatus === 'source_missing') summary.sourceMissingRows += 1;
  else if (fetchStatus === 'access_denied') summary.sourceAccessDenied += 1;
  else summary.sourceFailed += 1;
}

function createReport(args) {
  const startedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    options: {
      apply: args.apply,
      all: args.all,
      applyNsfw: args.applyNsfw,
      retryAccessDenied: args.retryAccessDenied,
      includePrompt: args.includePrompt,
      limit: args.limit,
      delayMs: args.delayMs,
      maxSourceDepth: args.maxSourceDepth,
    },
    summary: emptySummary(),
    rows: [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (parseBoolean(process.env.APPLY_NSFW)) args.applyNsfw = true;
  if (process.env.RETRY_ACCESS_DENIED !== undefined && process.env.RETRY_ACCESS_DENIED !== '') {
    args.retryAccessDenied = parseBoolean(process.env.RETRY_ACCESS_DENIED);
  }
  if (process.env.MAX_SOURCE_DEPTH !== undefined && process.env.MAX_SOURCE_DEPTH !== '') {
    args.maxSourceDepth = Number(process.env.MAX_SOURCE_DEPTH);
  }
  if (!Number.isInteger(args.maxSourceDepth) || args.maxSourceDepth < 0 || args.maxSourceDepth > 10) {
    throw new Error('MAX_SOURCE_DEPTH must be an integer between 0 and 10');
  }

  const report = createReport(args);
  const client = new Client({
    connectionString: readConnectionString(),
    ssl: { rejectUnauthorized: false },
  });
  const grokFetch = createRateLimitedFetcher(args.delayMs);

  try {
    await client.connect();
    if (args.apply) {
      await ensurePromptSourcesSchema(client);
    }
    const targets = await loadTargets(client, args);
    report.summary.targets = targets.length;

    for (let index = 0; index < targets.length; index += 1) {
      const post = targets[index];
      const grokId = uuidFromPost(post);
      const row = {
        index: index + 1,
        postId: post.id,
        grokId,
        statusBefore: post.prompt_fetch_status,
        existingPromptLength: post.prompt?.trim()?.length || 0,
        descriptionLength: post.description?.trim()?.length || 0,
        action: null,
        httpStatus: null,
        fetchStatus: null,
        promptLength: 0,
        promptHash: null,
        rRated: null,
        mediaType: null,
        sourceRows: 0,
        sourceFetched: 0,
        sources: [],
        error: null,
      };

      try {
        const fetched = await grokFetch(grokId);
        row.httpStatus = fetched.status;

        const grokPost = fetched.json?.post;
        if (!fetched.ok || !grokPost) {
          const message = fetched.json?.message || fetched.text.slice(0, 240) || 'empty response';
          const classified = classifyFailure(fetched.status, message);
          row.action = args.apply ? 'marked' : 'would_mark';
          row.fetchStatus = classified.fetchStatus;
          row.error = classified.errorMessage;
          countFailure(report.summary, classified.fetchStatus);
          if (args.apply) {
            await markFailed(client, post, fetched.status, message);
          }
        } else {
          const prompt = grokPost.prompt?.trim() ? grokPost.prompt : null;
          row.fetchStatus = prompt ? 'fetched' : 'no_prompt';
          row.promptLength = prompt?.length || 0;
          row.promptHash = prompt ? hashText(prompt) : null;
          row.rRated = grokPost.rRated === true;
          row.mediaType = grokPost.mediaType || null;
          if (args.includePrompt && prompt) row.prompt = prompt;
          if (row.rRated) report.summary.nsfwCandidates += 1;

          const sourceRows = args.maxSourceDepth > 0
            ? await collectPromptSources(grokPost, grokFetch, args)
            : [];
          row.sourceRows = sourceRows.length;
          row.sourceFetched = sourceRows.filter((source) => source.fetchStatus === 'fetched').length;
          row.sources = sourceRows.map((source) => buildSourceReportRow(source, args.includePrompt));
          sourceRows.forEach((source) => countSource(report.summary, source.fetchStatus));

          if (prompt) {
            row.action = args.apply ? 'updated' : 'would_update';
            report.summary.fetched += 1;
            if (args.apply) {
              await markFetched(client, post, grokPost, args);
            }
          } else {
            row.action = args.apply ? 'marked' : 'would_mark';
            report.summary.noPrompt += 1;
            if (args.apply) {
              await markFailed(client, post, 200, 'empty prompt');
            }
          }

          if (args.apply) {
            await replacePromptSources(client, post.id, sourceRows);
            report.summary.updated += 1;
          }
        }
      } catch (error) {
        row.action = args.apply ? 'marked' : 'would_mark';
        row.fetchStatus = 'failed';
        row.error = error.message;
        report.summary.failed += 1;
        if (args.apply) {
          await markFailed(client, post, 0, row.error);
        }
      }

      report.rows.push(row);
      console.log(`${row.index}/${targets.length} ${row.postId} ${row.action} fetch=${row.fetchStatus} http=${row.httpStatus ?? 'n/a'} prompt_len=${row.promptLength} source_rows=${row.sourceRows} source_fetched=${row.sourceFetched}`);
    }
  } finally {
    await client.end().catch(() => {});
  }

  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify({ summary: report.summary, mode: report.mode }, null, 2));

  if (process.env.GITHUB_ACTIONS !== 'true') {
    const logDir = path.resolve(REPO_ROOT, '_Dev', 'Tools', 'GrokPromptBackfill', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = report.finishedAt.replace(/[:.]/g, '-');
    const reportPath = path.join(logDir, `grok_prompt_fetch_${stamp}_${report.mode}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ reportPath: path.relative(REPO_ROOT, reportPath) }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
