'use client';

// ============================================
// SQUIRE WEB - VILLAGE BUILDING COMPONENT
// ============================================
// Renders a memory as a 3D building using GLTF models

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { VillageBuilding } from '@/lib/types/village';
import { BuildingModel } from './BuildingModel';

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
 * Building component - renders a memory as a 3D building using GLTF models
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
  const groupRef = useRef<Group>(null);

  // Validate position - skip rendering if invalid
  if (!Number.isFinite(building.position.x) || !Number.isFinite(building.position.z)) {
    console.warn('[Building] Invalid position:', building.id, building.position);
    return null;
  }

  // Calculate scale based on salience (ensure valid number)
  const salience = Number.isFinite(building.salience) ? building.salience : 0.5;
  const baseScale = 0.7 + salience * 0.6; // 0.7 to 1.3

  // Base Y position for hover animation
  const baseY = 0;

  // Animate hover effect (lift building slightly)
  useFrame((_, delta) => {
    if (groupRef.current) {
      const targetY = hovered || selected ? baseY + 0.15 : baseY;
      groupRef.current.position.y += (targetY - groupRef.current.position.y) * delta * 8;
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
      {/* Animated wrapper for hover lift */}
      <group ref={groupRef} position={[0, baseY, 0]}>
        <BuildingModel
          buildingType={building.buildingType}
          scale={baseScale}
          emissiveIntensity={emissiveIntensity}
          emissiveColor={building.color}
          castShadow
          receiveShadow
        />
      </group>
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
