'use client';

// ============================================
// SQUIRE WEB - VILLAGE ROAD COMPONENT
// ============================================
// Renders paths between buildings

import { useMemo } from 'react';
import * as THREE from 'three';
import type { VillageRoad } from '@/lib/types/village';

// ============================================
// ROAD COLORS BY EDGE TYPE
// ============================================

const ROAD_COLORS: Record<string, string> = {
  SIMILAR: '#3b82f6',   // blue-500
  TEMPORAL: '#22c55e',  // green-500
  CAUSAL: '#f59e0b',    // amber-500
  CO_OCCURS: '#8b5cf6', // violet-500
  MENTIONS: '#ec4899',  // pink-500
  default: '#475569',   // slate-600
};

// ============================================
// ROAD COMPONENT
// ============================================

interface RoadProps {
  road: VillageRoad;
  /** Whether this road is highlighted (connected to selected building) */
  highlighted?: boolean;
  /** Opacity (for fading distant roads) */
  opacity?: number;
}

/**
 * Road component - renders a path between two buildings
 * Uses a simple extruded line geometry
 */
function Road({ road, highlighted = false, opacity = 1 }: RoadProps) {
  const { fromPosition, toPosition, weight, edgeType } = road;

  // Validate positions - skip rendering if invalid
  const isValidPosition = (pos: { x: number; z: number }) =>
    Number.isFinite(pos.x) && Number.isFinite(pos.z);

  if (!isValidPosition(fromPosition) || !isValidPosition(toPosition)) {
    console.warn('[Road] Invalid positions:', road.id, fromPosition, toPosition);
    return null;
  }

  // Calculate road geometry
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(fromPosition.x, 0.02, fromPosition.z);
    const end = new THREE.Vector3(toPosition.x, 0.02, toPosition.z);

    // Create a path between the two points
    const direction = end.clone().sub(start);
    const length = direction.length();
    const center = start.clone().add(direction.clone().multiplyScalar(0.5));

    // Calculate rotation to align with direction
    const angle = Math.atan2(direction.x, direction.z);

    // Road width based on weight (0.1 to 0.4)
    const baseWidth = 0.15;
    const maxWidth = 0.4;
    const roadWidth = baseWidth + (weight * (maxWidth - baseWidth));

    return { length, center, angle, roadWidth };
  }, [fromPosition, toPosition, weight]);

  // Get color
  const color = ROAD_COLORS[edgeType] || ROAD_COLORS.default;

  // Adjust color for highlighting
  const finalColor = highlighted ? '#f0f0f0' : color;
  const finalOpacity = highlighted ? 1 : opacity * 0.6;

  return (
    <mesh
      position={[geometry.center.x, geometry.center.y, geometry.center.z]}
      rotation={[0, geometry.angle, 0]}
    >
      <boxGeometry args={[geometry.roadWidth, 0.02, geometry.length]} />
      <meshStandardMaterial
        color={finalColor}
        transparent
        opacity={finalOpacity}
        roughness={0.9}
        metalness={0.1}
      />
    </mesh>
  );
}

// ============================================
// ROADS LAYER COMPONENT
// ============================================

interface RoadsLayerProps {
  roads: VillageRoad[];
  /** ID of currently selected building */
  selectedBuildingId?: string | null;
}

/**
 * Renders all roads in the village
 */
export function RoadsLayer({ roads, selectedBuildingId }: RoadsLayerProps) {
  return (
    <group name="roads">
      {roads.map(road => {
        // Check if road is connected to selected building
        const isHighlighted = selectedBuildingId
          ? road.fromId === selectedBuildingId || road.toId === selectedBuildingId
          : false;

        return (
          <Road
            key={road.id}
            road={road}
            highlighted={isHighlighted}
            opacity={selectedBuildingId && !isHighlighted ? 0.3 : 1}
          />
        );
      })}
    </group>
  );
}

export default RoadsLayer;
