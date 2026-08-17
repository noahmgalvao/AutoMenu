import { Asset, AssetType } from '../types';
import { getSupabaseClient } from './supabaseClient';

interface AssetUploadInput {
  assetId?: string;
  workspaceId: string;
  userId: string;
  bucket: 'product-images' | 'menu-assets' | 'ai-imports';
  assetType: AssetType;
  file: File;
  metadata?: Record<string, unknown>;
}

interface DataUrlUploadInput extends Omit<AssetUploadInput, 'file'> {
  dataUrl: string;
  fileName: string;
}

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

export const resolveAssetMap = async (assets: Asset[]) => {
  const entries = await Promise.all(
    assets.map(async (asset) => {
      const url = await resolveAssetUrl(asset);
      return [asset.id, url] as const;
    }),
  );

  return new Map(entries);
};

export const resolveAssetMapForIds = async (workspaceId: string, assetIds: string[]) => {
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

  return resolveAssetMap((data || []).map(mapAssetRow));
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
  const path = createStoragePath(workspaceId, assetType, assetId, file.name);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/octet-stream',
  });

  if (uploadError) {
    throw uploadError;
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
