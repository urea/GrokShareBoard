const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');
const LOCAL_ENV_PATH = path.resolve(REPO_ROOT, '_Dev', 'Tools', 'db-admin.env');

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
    limit: 50,
    delayMs: 750,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--all') args.all = true;
    else if (arg === '--apply-nsfw') args.applyNsfw = true;
    else if (arg === '--retry-access-denied') args.retryAccessDenied = true;
    else if (arg === '--include-prompt') args.includePrompt = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1]);
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.split('=')[1]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 500) {
    throw new Error('--limit must be an integer between 1 and 500');
  }
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0 || args.delayMs > 10000) {
    throw new Error('--delay-ms must be between 0 and 10000');
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/fetch_grok_prompts.js --dry-run --limit 20
  node scripts/fetch_grok_prompts.js --apply --limit 50 --delay-ms 750

Default target:
  pending and failed rows only.
  Terminal statuses are skipped: fetched, no_prompt, source_missing, access_denied.

Options:
  --apply                Update public.posts.
  --dry-run              Fetch and report only. This is the default.
  --limit N              Maximum rows to process. Default: 50, max: 500.
  --delay-ms N           Delay between Grok API calls. Default: 750.
  --all                  Include every row regardless of current fetch status.
  --retry-access-denied  Include access_denied rows in the normal target set.
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

function uuidFromPost(post) {
  const match = (post.url || '').match(/post\/([a-f0-9-]{36})/i);
  return match ? match[1].toLowerCase() : String(post.id).toLowerCase();
}

function hashText(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      order by created_at desc
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
  await client.query(
    `
      update public.posts
      set
        prompt_fetch_status = $1,
        prompt_fetch_error = $2
      where id = $3
    `,
    [classified.fetchStatus, classified.errorMessage, post.id],
  );
  return classified;
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
  };
}

function countFailure(summary, fetchStatus) {
  if (fetchStatus === 'no_prompt') summary.noPrompt += 1;
  else if (fetchStatus === 'source_missing') summary.sourceMissing += 1;
  else if (fetchStatus === 'access_denied') summary.accessDenied += 1;
  else summary.failed += 1;
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
    },
    summary: emptySummary(),
    rows: [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (parseBoolean(process.env.APPLY_NSFW)) args.applyNsfw = true;
  if (parseBoolean(process.env.RETRY_ACCESS_DENIED)) args.retryAccessDenied = true;

  const report = createReport(args);
  const client = new Client({
    connectionString: readConnectionString(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
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
        error: null,
      };

      try {
        const fetched = await fetchGrokPost(grokId);
        row.httpStatus = fetched.status;

        const grokPost = fetched.json?.post;
        if (!fetched.ok || !grokPost?.prompt?.trim()) {
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
          const prompt = grokPost.prompt;
          row.action = args.apply ? 'updated' : 'would_update';
          row.fetchStatus = 'fetched';
          row.promptLength = prompt.length;
          row.promptHash = hashText(prompt);
          row.rRated = grokPost.rRated === true;
          row.mediaType = grokPost.mediaType || null;
          if (args.includePrompt) row.prompt = prompt;
          if (row.rRated) report.summary.nsfwCandidates += 1;
          report.summary.fetched += 1;
          if (args.apply) {
            await markFetched(client, post, grokPost, args);
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
      console.log(`${row.index}/${targets.length} ${row.postId} ${row.action} fetch=${row.fetchStatus} http=${row.httpStatus ?? 'n/a'} prompt_len=${row.promptLength}`);

      if (index < targets.length - 1 && args.delayMs > 0) {
        await sleep(args.delayMs);
      }
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
