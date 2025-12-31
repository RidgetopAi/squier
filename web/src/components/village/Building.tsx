'use client';

// ============================================
// SQUIRE WEB - VILLAGE BUILDING COMPONENT
// ============================================
// Renders a memory as a 3D building

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { VillageBuilding, BuildingType } from '@/lib/types/village';

// ============================================
// BUILDING DIMENSIONS BY TYPE
// ============================================

interface BuildingDimensions {
  width: number;
  height: number;
  depth: number;
}

/**
 * Building dimensions by type (placeholder - will be replaced with GLTF in Phase 3)
 */
const BUILDING_DIMENSIONS: Record<BuildingType, BuildingDimensions> = {
  tavern: { width: 1.2, height: 0.9, depth: 1.2 },
  library: { width: 1.0, height: 1.4, depth: 0.8 },
  blacksmith: { width: 1.3, height: 0.8, depth: 1.0 },
  church: { width: 0.9, height: 1.6, depth: 1.1 },
  market: { width: 1.4, height: 0.7, depth: 0.9 },
  barracks: { width: 1.1, height: 1.0, depth: 1.1 },
  house: { width: 0.8, height: 0.8, depth: 0.8 },
};

// ============================================
// BUILDING COMPONENT
// ============================================

interface BuildingProps {
  building: VillageBuilding;
  /** Whether this building is selected */
  selected?: boolean;
  /** Whether this building is hovered */
  hovered?: boolean;
  /** Click handler */
  onClick?: (building: VillageBuilding) => void;
  /** Hover handlers */
  onPointerOver?: (building: VillageBuilding) => void;
  onPointerOut?: () => void;
}

/**
 * Building component - renders a memory as a 3D building
 * Scale varies based on salience (0.7 to 1.3x)
 */
export function Building({
  building,
  selected = false,
  hovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: BuildingProps) {
  const meshRef = useRef<Mesh>(null);

  // Calculate scale based on salience
  const baseScale = 0.7 + building.salience * 0.6; // 0.7 to 1.3
  const dimensions = BUILDING_DIMENSIONS[building.buildingType];

  // Y position (half height so building sits on ground)
  const baseY = (dimensions.height * baseScale) / 2;

  // Animate hover effect
  useFrame((_, delta) => {
    if (meshRef.current) {
      const targetY = hovered || selected ? baseY + 0.15 : baseY;
      meshRef.current.position.y += (targetY - meshRef.current.position.y) * delta * 8;
    }
  });

  // Emissive intensity for glow effect
  const emissiveIntensity = selected ? 0.4 : hovered ? 0.2 : 0;

  return (
    <group
      position={[building.position.x, 0, building.position.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        onPointerOver?.(building);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'auto';
        onPointerOut?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(building);
      }}
    >
      <mesh
        ref={meshRef}
        position={[0, baseY, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            dimensions.width * baseScale,
            dimensions.height * baseScale,
            dimensions.depth * baseScale,
          ]}
        />
        <meshStandardMaterial
          color={building.color}
          emissive={building.color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>

      {/* Roof (simple pyramid for variety) */}
      <mesh
        position={[0, baseY + (dimensions.height * baseScale) / 2 + 0.15 * baseScale, 0]}
        castShadow
      >
        <coneGeometry args={[dimensions.width * baseScale * 0.7, 0.4 * baseScale, 4]} />
        <meshStandardMaterial
          color="#1e293b" // slate-800
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

// ============================================
// BUILDINGS LAYER COMPONENT
// ============================================

interface BuildingsLayerProps {
  buildings: VillageBuilding[];
  /** ID of currently selected building */
  selectedBuildingId?: string | null;
  /** ID of currently hovered building */
  hoveredBuildingId?: string | null;
  /** Click handler */
  onBuildingClick?: (building: VillageBuilding) => void;
  /** Hover handlers */
  onBuildingHover?: (building: VillageBuilding | null) => void;
}

/**
 * Renders all buildings in the village
 */
export function BuildingsLayer({
  buildings,
  selectedBuildingId,
  hoveredBuildingId,
  onBuildingClick,
  onBuildingHover,
}: BuildingsLayerProps) {
  return (
    <group name="buildings">
      {buildings.map(building => (
        <Building
          key={building.id}
          building={building}
          selected={building.id === selectedBuildingId}
          hovered={building.id === hoveredBuildingId}
          onClick={onBuildingClick}
          onPointerOver={(b) => onBuildingHover?.(b)}
          onPointerOut={() => onBuildingHover?.(null)}
        />
      ))}
    </group>
  );
}

export default Building;
