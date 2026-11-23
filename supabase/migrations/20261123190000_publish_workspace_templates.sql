alter table public.templates
  add column catalog_source_template_id text unique,
  add constraint templates_catalog_source_scope_check
    check (catalog_source_template_id is null or scope = 'system');

-- Snapshot only the background resources deliberately shared with the catalog.
create table public.catalog_template_backgrounds (
  asset_id text primary key,
  bucket text,
  path text,
  source_url text
);
alter table public.catalog_template_backgrounds enable row level security;
revoke all on public.catalog_template_backgrounds from anon, authenticated;
grant select on public.catalog_template_backgrounds to authenticated;
create policy catalog_template_backgrounds_read on public.catalog_template_backgrounds
  for select to authenticated using (true);

create policy storage_read_catalog_template_backgrounds on storage.objects
  for select to authenticated using (
    bucket_id = 'menu-assets' and exists (
      select 1 from public.catalog_template_backgrounds b
      where b.bucket = bucket_id and b.path = name
    )
  );

create function public.is_template_catalog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and pg_catalog.lower(u.email) = 'noahmgalvao@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

revoke execute on function public.is_template_catalog_admin() from public, anon, authenticated;
grant execute on function public.is_template_catalog_admin() to authenticated;

create function public.publish_workspace_template(source_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  source public.templates%rowtype;
  published public.templates%rowtype;
  saved_style jsonb;
  public_style jsonb;
  background public.assets%rowtype;
  version_id text;
begin
  if not public.is_template_catalog_admin() then
    raise exception 'Somente administradores podem publicar modelos no catálogo.' using errcode = '42501';
  end if;

  select * into source from public.templates t
    where t.id = source_id and t.scope = 'workspace'
      and public.is_workspace_member(t.workspace_id)
    for update;
  if not found then
    raise exception 'Modelo indisponível neste workspace.' using errcode = '42501';
  end if;

  select * into published from public.templates where catalog_source_template_id = source.id;
  if not found then
    select v.style_state into saved_style from public.template_versions v
      where v.id = source.current_version_id and v.template_id = source.id;
    if not found then
      raise exception 'Salve o modelo antes de publicar.';
    end if;

    select coalesce(pg_catalog.jsonb_object_agg(item.key, item.value), '{}'::jsonb)
    into public_style from pg_catalog.jsonb_each(saved_style) item
    where item.key = any (array[
      'templateDescription', 'design', 'fontFamily', 'primaryColor', 'backgroundColor', 'textColor',
      'miniFoodTextureColor', 'miniFoodTextureScale', 'templateBackgroundFit', 'templateDecoration',
      'templateHeadingVisibility', 'productPhotoAlignmentDefault', 'categoryPhotoAlignmentDefault',
      'categoryPhotoRatio', 'productPhotoRatio', 'layoutMode', 'showImages', 'showCategoryImages',
      'imageScale', 'categoryImageScale', 'productImageFrame', 'productCardShape', 'cardBackgroundColor',
      'cardBackgroundColorOverride', 'columnCount', 'categoryColumnCount', 'categoryColumnWidths', 'pageSetup',
      'pagePadding', 'margins', 'contentSpacing', 'itemGap', 'globalRadius', 'borders', 'fills', 'markers',
      'productDividerStyle', 'categoryDividerStyle', 'fontSizeLimits', 'minimumFontSize',
      'revisedFontSizeDefaults', 'allowSameWordBreak', 'splitCategoryAcrossPages', 'productsCanChangeCategory',
      'priceDecimalPlaces', 'priceDecimalSeparator', 'priceCurrencySymbol', 'showPrices', 'showCurrencySymbol',
      'showPageNumbers', 'elementStyles', 'elementColorOverrides', 'contentLayer'
    ]);

    -- Only role-level fills belong to a reusable model.
    if pg_catalog.jsonb_typeof(saved_style->'textContrastFills') = 'object' then
      public_style := public_style || pg_catalog.jsonb_build_object('textContrastFills',
        (select coalesce(pg_catalog.jsonb_object_agg(item.key, item.value), '{}'::jsonb)
         from pg_catalog.jsonb_each(saved_style->'textContrastFills') item
         where item.key = any (array['menuTitle','menuSubtitle','category','productName','productDescription','productPrice'])));
    end if;

    if (saved_style->>'backgroundImage') ~ '^texture:[a-zA-Z0-9:_-]+$' then
      public_style := public_style || pg_catalog.jsonb_build_object('backgroundImage', saved_style->>'backgroundImage');
    elsif nullif(saved_style->>'backgroundAssetId', '') is not null then
      select * into background from public.assets a
        where a.id = saved_style->>'backgroundAssetId' and a.workspace_id = source.workspace_id
          and a.asset_type = 'menu_background' and (
            (a.bucket = 'menu-assets' and a.source_url is null
              and pg_catalog.split_part(a.path, '/', 1) = source.workspace_id
              and pg_catalog.split_part(a.path, '/', 2) = 'menu_background'
              and pg_catalog.split_part(a.path, '/', 4) = ''
              and pg_catalog.split_part(pg_catalog.split_part(a.path, '/', 3), '.', 1) = a.id)
            or (a.bucket is null and a.source_url ~ '^https?://')
          );
      if not found then
        raise exception 'O fundo deste modelo não está disponível para publicação.';
      end if;
      insert into public.catalog_template_backgrounds (asset_id, bucket, path, source_url)
        values (background.id, background.bucket, background.path, background.source_url)
        on conflict (asset_id) do nothing;
      public_style := public_style || pg_catalog.jsonb_build_object('backgroundAssetId', background.id);
    end if;

    public_style := public_style || '{"menuTitle":"","menuSubtitle":"","hiddenProductIds":[]}'::jsonb;
    insert into public.templates (name, scope, source_type, is_locked, catalog_active, catalog_source_template_id)
      values (source.name, 'system', source.source_type, true, true, source.id)
      returning * into published;
    insert into public.template_versions (template_id, version_number, style_state, preview_asset_id)
      values (published.id, 1, public_style, background.id)
      returning id into version_id;
    update public.templates set current_version_id = version_id where id = published.id returning * into published;
  else
    select v.style_state into public_style from public.template_versions v where v.id = published.current_version_id;
  end if;

  return pg_catalog.to_jsonb(published) || pg_catalog.jsonb_build_object('style_state', public_style);
end;
$$;

revoke execute on function public.publish_workspace_template(text) from public, anon, authenticated;
grant execute on function public.publish_workspace_template(text) to authenticated;
