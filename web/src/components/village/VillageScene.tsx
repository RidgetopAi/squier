'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { VillageCanvas } from './VillageCanvas';

export default function VillageScene() {
  return (
    <div className="relative h-full w-full bg-background">
      <Canvas
        shadows
        frameloop="demand"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0a0f');
        }}
      >
        <Suspense fallback={null}>
          <VillageCanvas />
        </Suspense>
      </Canvas>

      {/* Overlay UI */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top left - Title */}
        <div className="absolute left-4 top-4">
          <h1 className="text-lg font-semibold text-foreground">Memory Village</h1>
          <p className="text-sm text-foreground-muted">Phase 0 - R3F Foundation</p>
        </div>

        {/* Bottom left - Controls hint */}
        <div className="absolute bottom-4 left-4 rounded-lg border border-border bg-background/80 px-3 py-2 backdrop-blur-sm">
          <p className="text-xs text-foreground-muted">
            <span className="font-medium text-foreground">Mouse:</span> Drag to rotate, Scroll to zoom
          </p>
          <p className="text-xs text-foreground-muted">
            <span className="font-medium text-foreground">Touch:</span> Drag to rotate, Pinch to zoom
          </p>
        </div>
      </div>
    </div>
  );
}
