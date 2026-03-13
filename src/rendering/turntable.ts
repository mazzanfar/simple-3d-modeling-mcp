import { getTurntableCameras } from "./camera-presets.js";
import { renderStlToPng } from "./software-renderer.js";
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

  // Try native renderPng first
  const firstResult = await engine.renderPng({
    code: opts.code,
    camera: cameras[0],
    imageSize: [w, h],
    params: opts.params,
  });

  const useNative = firstResult.success && !!firstResult.outputBytes;

  if (useNative) {
    // Native path: render each frame via engine
    const renders: RenderResult[] = [firstResult];
    for (let i = 1; i < cameras.length; i++) {
      const result = await engine.renderPng({
        code: opts.code,
        camera: cameras[i],
        imageSize: [w, h],
        params: opts.params,
      });
      if (!result.success) {
        return { success: false, stdout: "", stderr: result.stderr, warnings: result.warnings, errors: result.errors };
      }
      renders.push(result);
    }

    const rawFrames: ArrayBuffer[] = [];
    for (const r of renders) {
      const decoded = UPNG.decode(r.outputBytes!.buffer);
      const rgbaFrames = UPNG.toRGBA8(decoded);
      rawFrames.push(rgbaFrames[0]);
    }

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

  // Software fallback: export STL once, then software-render each frame
  const stl = await engine.exportModel({ code: opts.code, format: "stl", params: opts.params });
  if (!stl.success || !stl.outputBytes) {
    return { success: false, stdout: "", stderr: stl.stderr, warnings: stl.warnings, errors: stl.errors };
  }

  const rawFrames: ArrayBuffer[] = [];
  for (const camera of cameras) {
    const framePng = await renderStlToPng({ stlBytes: stl.outputBytes, width: w, height: h, camera });
    const decoded = UPNG.decode(framePng.buffer);
    const rgbaFrames = UPNG.toRGBA8(decoded);
    rawFrames.push(rgbaFrames[0]);
  }

  const delay = Math.round(2000 / frames);
  const delays = new Array(frames).fill(delay);
  const apngBuffer = UPNG.encode(rawFrames, w, h, 0, delays);

  return {
    success: true,
    outputBytes: new Uint8Array(apngBuffer),
    stdout: "", stderr: "",
    warnings: [],
    errors: [],
  };
}
