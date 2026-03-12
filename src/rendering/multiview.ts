import sharp from "sharp";
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

  // Composite into grid with labels
  const cols = 2;
  const rows = Math.ceil(views.length / cols);
  const labelHeight = 24;
  const gridW = cols * cellW;
  const gridH = rows * (cellH + labelHeight);

  // Create label images
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < renders.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * (cellH + labelHeight);

    // Label SVG
    const labelSvg = Buffer.from(
      `<svg width="${cellW}" height="${labelHeight}">
        <rect width="${cellW}" height="${labelHeight}" fill="#16162a"/>
        <text x="${cellW / 2}" y="${labelHeight - 6}" text-anchor="middle"
              font-family="system-ui" font-size="12" fill="#888">${views[i]}</text>
      </svg>`
    );
    composites.push({ input: labelSvg, left: x, top: y });
    composites.push({ input: Buffer.from(renders[i].outputBytes!), left: x, top: y + labelHeight });
  }

  const outputBytes = await sharp({
    create: { width: gridW, height: gridH, channels: 4, background: { r: 22, g: 22, b: 42, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return {
    success: true,
    outputBytes: new Uint8Array(outputBytes),
    stdout: "", stderr: "",
    warnings: renders.flatMap((r) => r.warnings),
    errors: [],
  };
}
