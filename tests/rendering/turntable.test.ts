import { describe, it, expect } from "vitest";
import { renderTurntable } from "../../src/rendering/turntable.js";
import sharp from "sharp";
import type { Engine, RenderPngOptions, RenderResult, ExportOptions, ValidateResult } from "../../src/engine/types.js";

/** Create a tiny solid-color PNG for testing */
async function makeTinyPng(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: 100, g: 100, b: 255, alpha: 1 } },
  }).png().toBuffer();
  return new Uint8Array(buf);
}

/** Mock engine that returns a pre-made PNG from renderPng */
function createMockEngine(pngBytes: Uint8Array): Engine {
  return {
    name: "mock",
    workDir: "/tmp/mock",
    async renderPng(_opts: RenderPngOptions): Promise<RenderResult> {
      return { success: true, outputBytes: pngBytes, stdout: "", stderr: "", warnings: [], errors: [] };
    },
    async exportModel(_opts: ExportOptions): Promise<RenderResult> {
      return { success: false, stdout: "", stderr: "", warnings: [], errors: ["not implemented"] };
    },
    async validate(_code: string): Promise<ValidateResult> {
      return { valid: true, warnings: [], errors: [] };
    },
    async version(): Promise<string> { return "mock-1.0"; },
  };
}

describe("renderTurntable", () => {
  it("renders an APNG turntable animation", async () => {
    const png = await makeTinyPng(64, 64);
    const engine = createMockEngine(png);
    const result = await renderTurntable(engine, {
      code: "cube([10, 10, 10]);",
      frames: 4,
      size: [64, 64],
    });
    expect(result.success).toBe(true);
    expect(result.outputBytes).toBeDefined();
    expect(result.outputBytes!.length).toBeGreaterThan(100);
    expect(result.outputBytes![0]).toBe(0x89); // PNG/APNG magic
  });

  it("returns failure if engine render fails", async () => {
    const failEngine: Engine = {
      name: "fail",
      workDir: "/tmp/fail",
      async renderPng(): Promise<RenderResult> {
        return { success: false, stdout: "", stderr: "error", warnings: [], errors: ["render failed"] };
      },
      async exportModel(): Promise<RenderResult> {
        return { success: false, stdout: "", stderr: "", warnings: [], errors: [] };
      },
      async validate(): Promise<ValidateResult> { return { valid: false, warnings: [], errors: [] }; },
      async version() { return "fail"; },
    };
    const result = await renderTurntable(failEngine, { code: "bad", frames: 2, size: [64, 64] });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("render failed");
  });
});
