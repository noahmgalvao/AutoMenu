import type { Asset, AssetType } from '../../domain/workspace/model';

export interface AssetUploadInput {
  assetId?: string;
  workspaceId: string;
  userId: string;
  bucket: 'product-images' | 'menu-assets' | 'ai-imports';
  assetType: AssetType;
  file: File;
  metadata?: Record<string, unknown>;
}

export interface DataUrlUploadInput extends Omit<AssetUploadInput, 'file'> {
  dataUrl: string;
  fileName: string;
}

export interface UploadedAsset {
  asset: Asset;
  url: string;
}

export interface AssetUploads {
  uploadFileAsset(input: AssetUploadInput): Promise<UploadedAsset>;
  uploadDataUrlAsset(input: DataUrlUploadInput): Promise<UploadedAsset>;
}
