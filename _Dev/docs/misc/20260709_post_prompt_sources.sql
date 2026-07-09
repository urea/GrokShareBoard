-- Grok Share Board: source/original prompt ancestry storage.
--
-- Design:
-- - public.posts.prompt remains the prompt for the shared Grok post itself.
--   For videos, this is the video-generation prompt.
-- - public.post_prompt_sources stores prompts from original/source posts.
--   depth=1 is the direct source post. Larger depths follow originalPostId.
-- - public.posts.description remains the user-entered description/memo.
-- - public.comments remains unchanged.

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

-- Search view used by the public page.
-- It keeps the posts shape and appends source_prompt_text for ILIKE search.
create or replace view public.posts_search_index
with (security_invoker = true) as
select
  p.*,
  coalesce(
    string_agg(s.prompt, E'\n' order by s.depth)
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

-- Verification examples:
--
-- select
--   count(*) as source_rows,
--   count(*) filter (where prompt_fetch_status = 'fetched') as source_fetched_rows
-- from public.post_prompt_sources;
--
-- select
--   p.id,
--   p.prompt as current_prompt,
--   s.depth,
--   s.grok_post_id,
--   s.prompt as source_prompt
-- from public.posts p
-- join public.post_prompt_sources s on s.post_id = p.id
-- order by p.created_at desc, s.depth
-- limit 20;
