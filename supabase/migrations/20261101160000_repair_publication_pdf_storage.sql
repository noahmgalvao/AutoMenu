alter table public.menu_publications
  add column if not exists pdf_bucket text not null default 'menu-assets',
  add column if not exists pdf_path text;

update public.menu_publications publication
set
  pdf_bucket = asset.bucket,
  pdf_path = asset.path
from public.assets asset
where publication.pdf_asset_id = asset.id
  and publication.pdf_path is null;

drop policy if exists storage_read_published_menu_files on storage.objects;
create policy storage_read_published_menu_files on storage.objects
for select using (
  exists (
    select 1
    from public.menu_publications publication
    where publication.pdf_bucket = bucket_id
      and publication.pdf_path = name
  )
  or exists (
    select 1
    from public.assets asset
    join public.menu_publications publication
      on (asset.id = any(publication.asset_ids)
      or asset.id = publication.pdf_asset_id)
    where asset.bucket = bucket_id
      and asset.path = name
  )
);
