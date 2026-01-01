// ============================================
// SQUIRE WEB - VILLAGE LAYOUT LIBRARY
// ============================================

// Hex grid utilities
export {
  hexToWorld,
  worldToHex,
  spiralHexPositions,
  hexDistance,
  worldDistance,
  calculateBounds,
  hexAdd,
  hexScale,
  hexNeighbors,
  DEFAULT_HEX_SIZE,
} from './hexGrid';

// Layout algorithm
export {
  buildVillageLayout,
  createEmptyLayout,
  getBuildingById,
  getBuildingByMemoryId,
  getConnectedRoads,
  generateProps,
  buildVillageLayoutWithProps,
  generateVillagers,
  buildVillageLayoutFull,
} from './layout';

// GLTF model utilities (Phase 3)
export {
  MODELS_BASE_PATH,
  BUILDING_MODEL_CONFIGS,
  ALL_BUILDING_TYPES,
  getModelPath,
  getModelConfig,
  preloadAllBuildingModels,
  preloadBuildingModels,
  clearModelCache,
  hasModel,
  FALLBACK_MODEL_PATH,
  // Phase 5: Props
  PROPS_BASE_PATH,
  PROP_MODEL_CONFIGS,
  ALL_PROP_TYPES,
  getPropConfig,
  getPropPath,
  preloadAllPropModels,
  clearPropCache,
} from './models';
export type { BuildingModelConfig, PropType, PropModelConfig } from './models';
