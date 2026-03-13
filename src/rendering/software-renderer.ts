/**
 * Software STL-to-PNG renderer.
 *
 * Falls back to this when WASM OpenSCAD can't render PNG (no OpenGL).
 * Uses basic triangle rasterization with z-buffer and flat shading,
 * then converts the pixel buffer to PNG via upng-js (pure JS, no native deps).
 */

// @ts-expect-error — no type declarations
import UPNG from "upng-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoftwareRenderOptions {
  stlBytes: Uint8Array;
  width: number;
  height: number;
  /** OpenSCAD-style camera: "translateX,translateY,translateZ,rotX,rotY,rotZ,distance" */
  camera?: string;
  background?: { r: number; g: number; b: number };
  modelColor?: { r: number; g: number; b: number };
}

interface Triangle {
  v0: [number, number, number];
  v1: [number, number, number];
  v2: [number, number, number];
  normal: [number, number, number];
}

// ---------------------------------------------------------------------------
// STL parsing
// ---------------------------------------------------------------------------

function parseSTL(input: Uint8Array): Triangle[] {
  // Check if ASCII STL (starts with "solid")
  const header = new TextDecoder().decode(input.slice(0, 6));
  if (header.startsWith("solid ") || header.startsWith("solid\n")) {
    return parseAsciiSTL(input);
  }
  return parseBinarySTL(input);
}

function parseAsciiSTL(input: Uint8Array): Triangle[] {
  const text = new TextDecoder().decode(input);
  const triangles: Triangle[] = [];
  const facetRegex = /facet\s+normal\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s+outer\s+loop\s+vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s+vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s+vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s+endloop\s+endfacet/gi;

  let match: RegExpExecArray | null;
  while ((match = facetRegex.exec(text)) !== null) {
    triangles.push({
      normal: [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])],
      v0: [parseFloat(match[4]), parseFloat(match[5]), parseFloat(match[6])],
      v1: [parseFloat(match[7]), parseFloat(match[8]), parseFloat(match[9])],
      v2: [parseFloat(match[10]), parseFloat(match[11]), parseFloat(match[12])],
    });
  }
  return triangles;
}

function parseBinarySTL(input: Uint8Array): Triangle[] {
  // Copy to ensure we have a clean ArrayBuffer (WASM may share a large backing buffer)
  const buffer = new Uint8Array(input);
  const view = new DataView(buffer.buffer);
  const triangleCount = view.getUint32(80, true);
  const triangles: Triangle[] = [];

  for (let i = 0; i < triangleCount; i++) {
    const off = 84 + i * 50;
    const normal: [number, number, number] = [
      view.getFloat32(off, true),
      view.getFloat32(off + 4, true),
      view.getFloat32(off + 8, true),
    ];
    const v0: [number, number, number] = [
      view.getFloat32(off + 12, true),
      view.getFloat32(off + 16, true),
      view.getFloat32(off + 20, true),
    ];
    const v1: [number, number, number] = [
      view.getFloat32(off + 24, true),
      view.getFloat32(off + 28, true),
      view.getFloat32(off + 32, true),
    ];
    const v2: [number, number, number] = [
      view.getFloat32(off + 36, true),
      view.getFloat32(off + 40, true),
      view.getFloat32(off + 44, true),
    ];
    triangles.push({ v0, v1, v2, normal });
  }
  return triangles;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Rotate point by OpenSCAD-style Euler angles (degrees): rotX around X, then rotY around Y, then rotZ around Z. */
function rotateEuler(p: Vec3, rotX: number, rotY: number, rotZ: number): Vec3 {
  const toRad = Math.PI / 180;
  let [x, y, z] = p;

  // Rotate around X
  const cx = Math.cos(rotX * toRad), sx = Math.sin(rotX * toRad);
  let y1 = y * cx - z * sx;
  let z1 = y * sx + z * cx;
  y = y1; z = z1;

  // Rotate around Y
  const cy = Math.cos(rotY * toRad), sy = Math.sin(rotY * toRad);
  let x1 = x * cy + z * sy;
  z1 = -x * sy + z * cy;
  x = x1; z = z1;

  // Rotate around Z
  const cz = Math.cos(rotZ * toRad), sz = Math.sin(rotZ * toRad);
  x1 = x * cz - y * sz;
  y1 = x * sz + y * cz;
  x = x1; y = y1;

  return [x, y, z];
}

// ---------------------------------------------------------------------------
// Rasterizer
// ---------------------------------------------------------------------------

function edgeFunction(a: [number, number], b: [number, number], c: [number, number]): number {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

export async function renderStlToPng(opts: SoftwareRenderOptions): Promise<Uint8Array> {
  const { stlBytes, width, height } = opts;
  const bg = opts.background ?? { r: 22, g: 22, b: 42 };
  const mc = opts.modelColor ?? { r: 255, g: 140, b: 0 };

  const triangles = parseSTL(stlBytes);
  if (triangles.length === 0) {
    // Return a blank image
    const blankPixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      blankPixels[i * 4] = bg.r;
      blankPixels[i * 4 + 1] = bg.g;
      blankPixels[i * 4 + 2] = bg.b;
      blankPixels[i * 4 + 3] = 255;
    }
    return new Uint8Array(UPNG.encode([blankPixels.buffer], width, height, 0));
  }

  // Parse camera string
  let translateX = 0, translateY = 0, translateZ = 0;
  let rotX = 55, rotY = 0, rotZ = 25, distance = 0;
  if (opts.camera) {
    const parts = opts.camera.split(",").map(Number);
    if (parts.length >= 7) {
      [translateX, translateY, translateZ, rotX, rotY, rotZ, distance] = parts;
    }
  }

  // Compute bounding box for auto-distance
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const tri of triangles) {
    for (const v of [tri.v0, tri.v1, tri.v2]) {
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
      minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
    }
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

  // Auto-distance: ensure the model fits in frame regardless of provided distance
  const autoDistance = maxDim * 4;
  if (distance <= 0 || distance < autoDistance) {
    distance = autoDistance;
  }

  // Transform triangles: center, translate, rotate, then project
  const light: Vec3 = normalize([0.3, 0.5, 1.0]);
  const fov = 22.5; // OpenSCAD default FOV
  const aspect = width / height;
  const fovScale = 1 / Math.tan((fov * Math.PI) / 180 / 2);

  // Pixel buffer (RGB)
  const pixels = Buffer.alloc(width * height * 3);
  const zBuffer = new Float64Array(width * height).fill(Infinity);

  // Fill background
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = bg.r;
    pixels[i * 3 + 1] = bg.g;
    pixels[i * 3 + 2] = bg.b;
  }

  // Process triangles
  for (const tri of triangles) {
    // Center and translate
    const verts: Vec3[] = [tri.v0, tri.v1, tri.v2].map((v) => [
      v[0] - centerX + translateX,
      v[1] - centerY + translateY,
      v[2] - centerZ + translateZ,
    ] as Vec3);

    // Rotate
    const rotated = verts.map((v) => rotateEuler(v, rotX, rotY, rotZ));

    // Move along Z by distance (camera at origin looking down -Z after rotation)
    const projected: Vec3[] = rotated.map((v) => [v[0], v[1], v[2] - distance] as Vec3);

    // Skip triangles behind camera
    if (projected.every((v) => v[2] >= 0)) continue;

    // Perspective project to screen
    const screen: [number, number, number][] = projected.map((v) => {
      const iz = -1 / v[2]; // v[2] is negative (in front of camera)
      const sx = (v[0] * iz * fovScale / aspect + 1) * 0.5 * width;
      const sy = (1 - v[1] * iz * fovScale) * 0.5 * height;
      return [sx, sy, v[2]];
    });

    // Compute face normal from rotated vertices for shading
    const e1 = sub(rotated[1], rotated[0]);
    const e2 = sub(rotated[2], rotated[0]);
    const faceNormal = normalize(cross(e1, e2));

    // Back-face culling
    if (faceNormal[2] <= 0) continue;

    // Shading: ambient + diffuse
    const ambient = 0.25;
    const diffuse = Math.max(0, dot(faceNormal, light));
    const intensity = Math.min(1, ambient + diffuse * 0.75);

    const r = Math.round(mc.r * intensity);
    const g = Math.round(mc.g * intensity);
    const b = Math.round(mc.b * intensity);

    // Bounding box
    const minSx = Math.max(0, Math.floor(Math.min(screen[0][0], screen[1][0], screen[2][0])));
    const maxSx = Math.min(width - 1, Math.ceil(Math.max(screen[0][0], screen[1][0], screen[2][0])));
    const minSy = Math.max(0, Math.floor(Math.min(screen[0][1], screen[1][1], screen[2][1])));
    const maxSy = Math.min(height - 1, Math.ceil(Math.max(screen[0][1], screen[1][1], screen[2][1])));

    const area = edgeFunction(
      [screen[0][0], screen[0][1]],
      [screen[1][0], screen[1][1]],
      [screen[2][0], screen[2][1]]
    );
    if (Math.abs(area) < 0.001) continue; // Degenerate triangle

    // Rasterize
    for (let py = minSy; py <= maxSy; py++) {
      for (let px = minSx; px <= maxSx; px++) {
        const p: [number, number] = [px + 0.5, py + 0.5];
        const w0 = edgeFunction([screen[1][0], screen[1][1]], [screen[2][0], screen[2][1]], p);
        const w1 = edgeFunction([screen[2][0], screen[2][1]], [screen[0][0], screen[0][1]], p);
        const w2 = edgeFunction([screen[0][0], screen[0][1]], [screen[1][0], screen[1][1]], p);

        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
          // Interpolate Z
          const bary0 = w0 / area;
          const bary1 = w1 / area;
          const bary2 = w2 / area;
          const z = bary0 * screen[0][2] + bary1 * screen[1][2] + bary2 * screen[2][2];

          const idx = py * width + px;
          if (z < zBuffer[idx]) {
            zBuffer[idx] = z;
            pixels[idx * 3] = r;
            pixels[idx * 3 + 1] = g;
            pixels[idx * 3 + 2] = b;
          }
        }
      }
    }
  }

  // Convert RGB to RGBA for UPNG
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = pixels[i * 3];
    rgba[i * 4 + 1] = pixels[i * 3 + 1];
    rgba[i * 4 + 2] = pixels[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }

  return new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0));
}
