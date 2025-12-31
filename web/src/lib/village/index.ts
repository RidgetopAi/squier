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
} from './layout';
