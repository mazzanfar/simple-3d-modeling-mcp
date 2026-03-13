// @ts-expect-error — no type declarations
import UPNG from "upng-js";
import { getCameraString } from "./camera-presets.js";
import { renderStlToPng } from "./software-renderer.js";
import type { Engine, RenderResult } from "../engine/types.js";

export interface MultiViewOptions {
  code: string;
  views?: string[];
  cellSize?: [number, number];
  params?: Record<string, string | number | boolean>;
  distance?: number;
}

/** Compose an array of RGBA cell buffers into a grid PNG. */
function compositeGrid(cells: Uint8Array[], cellW: number, cellH: number, cols: number): Uint8Array {
  const rows = Math.ceil(cells.length / cols);
  const gridW = cols * cellW;
  const gridH = rows * cellH;

  const gridPixels = new Uint8Array(gridW * gridH * 4);
  // Fill with background color
  for (let i = 0; i < gridW * gridH; i++) {
    gridPixels[i * 4] = 22;
    gridPixels[i * 4 + 1] = 22;
    gridPixels[i * 4 + 2] = 42;
    gridPixels[i * 4 + 3] = 255;
  }

  for (let i = 0; i < cells.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const offsetX = col * cellW;
    const offsetY = row * cellH;
    const cellRgba = cells[i];

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

  return new Uint8Array(UPNG.encode([gridPixels.buffer], gridW, gridH, 0));
}

export async function renderMultiView(
  engine: Engine,
  opts: MultiViewOptions
): Promise<RenderResult> {
  const views = opts.views ?? ["front", "right", "top", "perspective"];
  const [cellW, cellH] = opts.cellSize ?? [512, 512];
  const distance = opts.distance ?? 140;

  // Try native renderPng first
  const firstResult = await engine.renderPng({
    code: opts.code,
    camera: getCameraString(views[0], distance),
    imageSize: [cellW, cellH],
    params: opts.params,
  });

  const useNative = firstResult.success && !!firstResult.outputBytes;

  if (useNative) {
    // Native path: render remaining views via engine
    const pngCells: Uint8Array[] = [];
    // Decode first result
    const d0 = UPNG.decode(firstResult.outputBytes!.buffer);
    pngCells.push(new Uint8Array(UPNG.toRGBA8(d0)[0]));

    for (let i = 1; i < views.length; i++) {
      const result = await engine.renderPng({
        code: opts.code,
        camera: getCameraString(views[i], distance),
        imageSize: [cellW, cellH],
        params: opts.params,
      });
      if (!result.success) {
        return { success: false, stdout: "", stderr: result.stderr, warnings: result.warnings, errors: result.errors };
      }
      const decoded = UPNG.decode(result.outputBytes!.buffer);
      pngCells.push(new Uint8Array(UPNG.toRGBA8(decoded)[0]));
    }

    return {
      success: true,
      outputBytes: compositeGrid(pngCells, cellW, cellH, 2),
      stdout: "", stderr: "",
      warnings: [],
      errors: [],
    };
  }

  // Software fallback: export STL once, then software-render each view
  const stl = await engine.exportModel({ code: opts.code, format: "stl", params: opts.params });
  if (!stl.success || !stl.outputBytes) {
    return { success: false, stdout: "", stderr: stl.stderr, warnings: stl.warnings, errors: stl.errors };
  }

  const pngCells: Uint8Array[] = [];
  for (const view of views) {
    const camera = getCameraString(view, distance);
    const framePng = await renderStlToPng({ stlBytes: stl.outputBytes, width: cellW, height: cellH, camera });
    const decoded = UPNG.decode(framePng.buffer);
    pngCells.push(new Uint8Array(UPNG.toRGBA8(decoded)[0]));
  }

  return {
    success: true,
    outputBytes: compositeGrid(pngCells, cellW, cellH, 2),
    stdout: "", stderr: "",
    warnings: [],
    errors: [],
  };
}
