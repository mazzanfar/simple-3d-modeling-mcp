// @ts-expect-error — no type declarations
import UPNG from "upng-js";
import { getCameraString } from "./camera-presets.js";
import type { Engine, RenderResult } from "../engine/types.js";

export interface MultiViewOptions {
  code: string;
  views?: string[];
  cellSize?: [number, number];
  params?: Record<string, string | number | boolean>;
  distance?: number;
}

export async function renderMultiView(
  engine: Engine,
  opts: MultiViewOptions
): Promise<RenderResult> {
  const views = opts.views ?? ["front", "right", "top", "perspective"];
  const [cellW, cellH] = opts.cellSize ?? [512, 512];
  const distance = opts.distance ?? 140;

  // Render sequentially — WASM is single-threaded with shared instance
  const renders: RenderResult[] = [];
  for (const view of views) {
    const result = await engine.renderPng({
      code: opts.code,
      camera: getCameraString(view, distance),
      imageSize: [cellW, cellH],
      params: opts.params,
    });
    if (!result.success) {
      return { success: false, stdout: "", stderr: result.stderr, warnings: result.warnings, errors: result.errors };
    }
    renders.push(result);
  }

  // Composite into grid (no labels — avoids native SVG dependency)
  const cols = 2;
  const rows = Math.ceil(views.length / cols);
  const gridW = cols * cellW;
  const gridH = rows * cellH;

  // Create RGBA pixel buffer for the grid
  const gridPixels = new Uint8Array(gridW * gridH * 4);
  // Fill with background color
  for (let i = 0; i < gridW * gridH; i++) {
    gridPixels[i * 4] = 22;
    gridPixels[i * 4 + 1] = 22;
    gridPixels[i * 4 + 2] = 42;
    gridPixels[i * 4 + 3] = 255;
  }

  // Blit each rendered cell into the grid
  for (let i = 0; i < renders.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const offsetX = col * cellW;
    const offsetY = row * cellH;

    // Decode the rendered PNG to raw RGBA
    const decoded = UPNG.decode(renders[i].outputBytes!.buffer);
    const cellRgba = new Uint8Array(UPNG.toRGBA8(decoded)[0]);

    // Copy pixels row by row
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const srcIdx = (y * cellW + x) * 4;
        const dstIdx = ((offsetY + y) * gridW + (offsetX + x)) * 4;
        gridPixels[dstIdx] = cellRgba[srcIdx];
        gridPixels[dstIdx + 1] = cellRgba[srcIdx + 1];
        gridPixels[dstIdx + 2] = cellRgba[srcIdx + 2];
        gridPixels[dstIdx + 3] = cellRgba[srcIdx + 3];
      }
    }
  }

  const outputBytes = new Uint8Array(UPNG.encode([gridPixels.buffer], gridW, gridH, 0));

  return {
    success: true,
    outputBytes: new Uint8Array(outputBytes),
    stdout: "", stderr: "",
    warnings: renders.flatMap((r) => r.warnings),
    errors: [],
  };
}
