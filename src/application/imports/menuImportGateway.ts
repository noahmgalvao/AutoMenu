import type { BoundingBox, ExtractedImage, MenuCategory } from '../../domain/imports/model';
import type { Product } from '../../domain/menu/model';
import type { AssetUploads } from '../assets/assetUploads';

export interface AnalysisResult {
  categories: MenuCategory[];
  products: Product[];
  extractedImages: ExtractedImage[];
  styleSuggestion: Record<string, any>;
}

interface ImageDimensions {
  width: number;
  height: number;
}

export interface DecorationProcessingOptions {
  foregroundType?: ExtractedImage['type'];
  exclusionBoxes?: BoundingBox[];
}

export interface MenuImportDependencies extends AssetUploads {
  analyzeMenuImage(base64Data: string, mimeType: string, imageDimensions: ImageDimensions): Promise<AnalysisResult>;
  fileToGenerativePart(file: File): Promise<string>;
  getImageDimensions(input: string): Promise<ImageDimensions>;
  createCleanBackground(input: string, boxes: BoundingBox[]): Promise<string>;
  processDecoration(file: File, box: BoundingBox, options?: DecorationProcessingOptions): Promise<string>;
  createAiImportJob(input: {
    workspaceId: string;
    sourceAssetId: string | null;
    createdTemplateId?: string | null;
    createdMenuId?: string | null;
    normalizedResult: Record<string, unknown>;
  }): Promise<void>;
}
