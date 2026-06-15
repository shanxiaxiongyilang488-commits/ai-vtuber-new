export type FalModelCategory = 'image' | 'video' | 'audio' | '3d';

export interface FalDiscoveredModel {
  id: string;
  name: string;
  category: FalModelCategory;
  task: string;
  description: string;
  tags: string[];
  thumbnailUrl: string;
  updatedAt: string;
  edit: boolean;
}

export type FalModelCatalog = Record<FalModelCategory, FalDiscoveredModel[]>;

export interface FalDiscoveryResponse {
  models: FalDiscoveredModel[];
  categories: FalModelCatalog;
  fetchedAt: string;
  source: 'live' | 'cache';
}
