import { describe, it, expect, afterAll } from "vitest";
import { createEngine } from "../../src/engine/index.js";
import { ViewerServer } from "../../src/viewer/index.js";
import { renderMultiView } from "../../src/rendering/index.js";
import { renderTurntable } from "../../src/rendering/index.js";
// @ts-expect-error — no type declarations
import UPNG from "upng-js";
import type { Engine, RenderPngOptions, RenderResult, ExportOptions, ValidateResult } from "../../src/engine/types.js";

/** Mock engine for rendering tests (WASM can't render PNGs) */
async function createMockPngEngine(): Promise<{ engine: Engine; realEngine: Engine }> {
  const realEngine = await createEngine({ forceWasm: true });
  const rgba = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) {
    rgba[i * 4] = 100;
    rgba[i * 4 + 1] = 100;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  const pngBytes = new Uint8Array(UPNG.encode([rgba.buffer], 128, 128, 0));

  const mockEngine: Engine = {
    name: realEngine.name,
    workDir: realEngine.workDir,
    async renderPng(_opts: RenderPngOptions): Promise<RenderResult> {
      return { success: true, outputBytes: pngBytes, stdout: "", stderr: "", warnings: [], errors: [] };
    },
    async exportModel(opts: ExportOptions): Promise<RenderResult> {
      return realEngine.exportModel(opts);
    },
    async validate(code: string): Promise<ValidateResult> {
      return realEngine.validate(code);
    },
    async version(): Promise<string> {
      return realEngine.version();
    },
  };

  return { engine: mockEngine, realEngine };
}

describe("end-to-end smoke test", () => {
  const viewerServer = new ViewerServer();

  afterAll(async () => { await viewerServer.stop(); });

  it("full workflow: export → viewer → multiview → turntable → validate → version", async () => {
    const { engine, realEngine } = await createMockPngEngine();

    // 1. Export STL (uses real WASM engine)
    const stl = await realEngine.exportModel({ code: "cube([10,10,10]);", format: "stl" });
    expect(stl.success).toBe(true);
    expect(stl.outputBytes).toBeDefined();

    // 2. Start viewer and push model
    const url = await viewerServer.start();
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    viewerServer.pushModel(stl.outputBytes!, "Test Cube");
    expect(viewerServer.state.versions).toHaveLength(1);

    // 3. Multi-view (uses mock PNG engine)
    const mv = await renderMultiView(engine, {
      code: "cube([10,10,10]);", views: ["front", "perspective"], cellSize: [128, 128],
    });
    expect(mv.success).toBe(true);
    expect(mv.outputBytes![0]).toBe(0x89); // PNG magic

    // 4. Turntable (uses mock PNG engine)
    const tt = await renderTurntable(engine, {
      code: "cube([10,10,10]);", frames: 3, size: [64, 64],
    });
    expect(tt.success).toBe(true);
    expect(tt.outputBytes![0]).toBe(0x89); // APNG magic

    // 5. Validate (uses real WASM engine)
    expect((await realEngine.validate("cube([10,10,10]);")).valid).toBe(true);
    expect((await realEngine.validate("cube([10,10)")).valid).toBe(false);

    // 6. Version
    const ver = await realEngine.version();
    expect(ver.length).toBeGreaterThan(0);
  });
});
