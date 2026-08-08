alter table public.workspaces
add column if not exists settings jsonb not null
default '{"split_category_across_pages": false}'::jsonb;

update public.workspaces
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{split_category_across_pages}',
  coalesce(settings -> 'split_category_across_pages', 'false'::jsonb),
  true
);
