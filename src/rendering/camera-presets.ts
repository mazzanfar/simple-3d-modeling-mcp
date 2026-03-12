export interface CameraPreset {
  rotX: number;
  rotY: number;
  rotZ: number;
}

export const PRESET_VIEWS: Record<string, CameraPreset> = {
  front:       { rotX: 90,  rotY: 0, rotZ: 0 },
  back:        { rotX: 90,  rotY: 0, rotZ: 180 },
  right:       { rotX: 90,  rotY: 0, rotZ: 90 },
  left:        { rotX: 90,  rotY: 0, rotZ: 270 },
  top:         { rotX: 0,   rotY: 0, rotZ: 0 },
  bottom:      { rotX: 180, rotY: 0, rotZ: 0 },
  perspective: { rotX: 55,  rotY: 0, rotZ: 25 },
};

export function getCameraString(preset: string, distance: number): string {
  const view = PRESET_VIEWS[preset];
  if (!view) throw new Error(`Unknown camera preset: ${preset}. Available: ${Object.keys(PRESET_VIEWS).join(", ")}`);
  return `0,0,0,${view.rotX},${view.rotY},${view.rotZ},${distance}`;
}

export function getTurntableCameras(frames: number, distance: number, elevation = 55): string[] {
  return Array.from({ length: frames }, (_, i) => {
    const angle = (360 / frames) * i;
    return `0,0,0,${elevation},0,${angle},${distance}`;
  });
}

export function estimateDistance(boundingBoxSize: { x: number; y: number; z: number }): number {
  const maxDim = Math.max(boundingBoxSize.x, boundingBoxSize.y, boundingBoxSize.z);
  return maxDim * 2.5;
}
