import { historyV12Enabled } from '../browser/revisionGateway';
import type { Asset, AssetType } from '../../domain/workspace/model';
import type { AssetUploadInput, DataUrlUploadInput } from '../../application/assets/assetUploads';
import { getSupabaseClient } from './client';

interface ExternalAssetInput {
  assetId?: string;
  workspaceId: string;
  userId: string;
  assetType: AssetType;
  url: string;
  metadata?: Record<string, unknown>;
}

const createStoragePath = (workspaceId: string, assetType: AssetType, assetId: string, fileName: string) => {
  const extension = getFileExtension(fileName);
  return `${workspaceId}/${assetType}/${assetId}.${extension}`;
};

const getFileExtension = (fileName: string) => {
  const cleaned = fileName.split('?')[0];
  const extension = cleaned.includes('.') ? cleaned.split('.').pop() : '';
  return extension || 'bin';
};

const dataUrlToFile = async (dataUrl: string, fileName: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
};

const mapAssetRow = (row: any): Asset => ({
  id: row.id,
  workspaceId: row.workspace_id,
  bucket: row.bucket,
  path: row.path,
  sourceUrl: row.source_url,
  assetType: row.asset_type,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  checksum: row.checksum,
  metadata: row.metadata || {},
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const resolveAssetUrl = async (asset: Asset) => {
  if (asset.sourceUrl) {
    return asset.sourceUrl;
  }

  if (!asset.bucket || !asset.path) {
    return '';
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(asset.bucket).createSignedUrl(asset.path, 60 * 60 * 24 * 365);

  if (error) {
    throw error;
  }

  return data.signedUrl;
};

type AssetLocation = Pick<Asset, 'id' | 'bucket' | 'path' | 'sourceUrl'>;

export const resolveAssetMap = async (assets: AssetLocation[], ttlSeconds = 60 * 60 * 24 * 365) => {
  const resolved = new Map<string, string>();
  const assetsByBucket = new Map<string, AssetLocation[]>();

  assets.forEach((asset) => {
    if (asset.sourceUrl) {
      resolved.set(asset.id, asset.sourceUrl);
      return;
    }
    if (!asset.bucket || !asset.path) {
      resolved.set(asset.id, '');
      return;
    }
    const bucketAssets = assetsByBucket.get(asset.bucket) || [];
    bucketAssets.push(asset);
    assetsByBucket.set(asset.bucket, bucketAssets);
  });

  const supabase = getSupabaseClient();
  await Promise.all(Array.from(assetsByBucket.entries()).map(async ([bucket, bucketAssets]) => {
    const batches = Array.from(
      { length: Math.ceil(bucketAssets.length / 100) },
      (_, index) => bucketAssets.slice(index * 100, (index + 1) * 100),
    );
    await Promise.all(batches.map(async (batch) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(batch.map((asset) => asset.path!), ttlSeconds);

      if (error) throw error;
      batch.forEach((asset, index) => resolved.set(asset.id, data?.[index]?.signedUrl || ''));
    }));
  }));

  return resolved;
};

const PUBLICATION_LINK_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export const resolveStorageFileUrl = async (bucket: string, path: string, expiresIn = 60 * 60 * 24 * 365) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
};

export const uploadPortablePublication = async ({
  workspaceId,
  menuId,
  releaseId,
  publication,
  existingUrl,
}: {
  workspaceId: string;
  menuId: string;
  releaseId: string;
  publication: Record<string, unknown>;
  existingUrl?: string | null;
}) => {
  const bucket = 'menu-assets';
  const path = `${workspaceId}/published-menus/${menuId}/${releaseId}.json`;
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(path, JSON.stringify(publication), {
    upsert: Boolean(existingUrl),
    contentType: 'application/json; charset=utf-8',
    cacheControl: '0',
  });
  if (error) throw error;
  return { bucket, path, url: existingUrl || await resolveStorageFileUrl(bucket, path, PUBLICATION_LINK_TTL_SECONDS) };
};

export const resolveAssetMapForIds = async (workspaceId: string, assetIds: string[], ttlSeconds?: number) => {
  const uniqueAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
  if (uniqueAssetIds.length === 0) return new Map<string, string>();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueAssetIds);

  if (error) {
    throw error;
  }

  const workspaceAssets = (data || []).map(mapAssetRow);
  const found = new Set(workspaceAssets.map(asset => asset.id));
  const missing = uniqueAssetIds.filter(id => !found.has(id));
  if (!missing.length) return resolveAssetMap(workspaceAssets,ttlSeconds);

  // Catalog backgrounds are explicitly shared, and may belong to a different workspace.
  const shared = await supabase.from('catalog_template_backgrounds').select('asset_id,bucket,path,source_url').in('asset_id', missing);
  return resolveAssetMap([...workspaceAssets, ...(shared.data || []).map(row => ({
    id: row.asset_id, bucket: row.bucket, path: row.path, sourceUrl: row.source_url,
  }))],ttlSeconds);
};

export const listAssetsForWorkspace = async (workspaceId: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapAssetRow);
};

export const uploadFileAsset = async ({
  assetId = crypto.randomUUID(),
  workspaceId,
  userId,
  bucket,
  assetType,
  file,
  metadata = {},
}: AssetUploadInput) => {
  const supabase = getSupabaseClient();
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
  const {data: identical, error: dedupError} = await supabase.from('assets').select('*').eq('workspace_id',workspaceId).eq('checksum',checksum).limit(1).maybeSingle();
  if(dedupError) throw dedupError;
  if(identical) {const asset=mapAssetRow(identical); return {asset,url:await resolveAssetUrl(asset)};}
  const {data: previousAsset} = await supabase.from('assets').select('checksum').eq('id',assetId).maybeSingle();
  if(previousAsset && previousAsset.checksum !== checksum) assetId = crypto.randomUUID();
  const immutableDomain = historyV12Enabled();
  if (immutableDomain) assetId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${workspaceId}:${checksum}`))),byte=>byte.toString(16).padStart(2,'0')).join('');
  const path = immutableDomain ? `${workspaceId}/revision-assets/${checksum}` : createStoragePath(workspaceId, assetType, assetId, file.name);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });

  if (uploadError) {
    if (!/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
    const {data:existingBytes,error:readError}=await supabase.storage.from(bucket).download(path); if(readError)throw readError;
    const storedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existingBytes.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(storedHash!==checksum)throw new Error('Checksum do recurso existente divergente.');
  }

  const payload = {
    id: assetId,
    workspace_id: workspaceId,
    bucket,
    path,
    source_url: null,
    asset_type: assetType,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    checksum,
    metadata: {...metadata,immutable:true,...(immutableDomain ? {revision_asset:true} : {})},
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('assets')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const asset = mapAssetRow(data);
  const url = await resolveAssetUrl(asset);
  return { asset, url };
};

export const uploadDataUrlAsset = async ({ dataUrl, fileName, ...rest }: DataUrlUploadInput) => {
  const file = await dataUrlToFile(dataUrl, fileName);
  return uploadFileAsset({
    ...rest,
    file,
  });
};

export const registerExternalAsset = async ({
  assetId = crypto.randomUUID(),
  workspaceId,
  userId,
  assetType,
  url,
  metadata = {},
}: ExternalAssetInput) => {
  const supabase = getSupabaseClient();
  const payload = {
    id: assetId,
    workspace_id: workspaceId,
    bucket: null,
    path: null,
    source_url: url,
    asset_type: assetType,
    mime_type: null,
    size_bytes: null,
    checksum: null,
    metadata,
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('assets')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return { asset: mapAssetRow(data), url };
};
