import { getTurntableCameras } from "./camera-presets.js";
import type { Engine, RenderResult } from "../engine/types.js";
// @ts-expect-error — no type declarations
import UPNG from "upng-js";

export interface TurntableOptions {
  code: string;
  frames?: number;
  size?: [number, number];
  params?: Record<string, string | number | boolean>;
  distance?: number;
}

export async function renderTurntable(
  engine: Engine,
  opts: TurntableOptions
): Promise<RenderResult> {
  const frames = opts.frames ?? 24;
  const [w, h] = opts.size ?? [512, 512];
  const distance = opts.distance ?? 140;
  const cameras = getTurntableCameras(frames, distance);

  // Render sequentially — WASM is single-threaded
  const renders: RenderResult[] = [];
  for (const camera of cameras) {
    const result = await engine.renderPng({
      code: opts.code,
      camera,
      imageSize: [w, h],
      params: opts.params,
    });
    if (!result.success) {
      return { success: false, stdout: "", stderr: result.stderr, warnings: result.warnings, errors: result.errors };
    }
    renders.push(result);
  }

  // Convert PNGs to raw RGBA using UPNG (pure JS)
  const rawFrames: ArrayBuffer[] = [];
  for (const r of renders) {
    const decoded = UPNG.decode(r.outputBytes!.buffer);
    const rgbaFrames = UPNG.toRGBA8(decoded);
    rawFrames.push(rgbaFrames[0]);
  }

  // Assemble APNG — ~2s total animation
  const delay = Math.round(2000 / frames);
  const delays = new Array(frames).fill(delay);
  const apngBuffer = UPNG.encode(rawFrames, w, h, 0, delays);

  return {
    success: true,
    outputBytes: new Uint8Array(apngBuffer),
    stdout: "", stderr: "",
    warnings: renders.flatMap((r) => r.warnings),
    errors: [],
  };
}
