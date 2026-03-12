import { describe, it, expect, beforeAll } from "vitest";
import { WasmEngine } from "../../src/engine/wasm-engine.js";

describe("WasmEngine", () => {
  let engine: WasmEngine;

  beforeAll(() => {
    engine = new WasmEngine();
  });

  it("should export a cube to STL", async () => {
    const result = await engine.exportModel({
      code: "cube([10, 10, 10]);",
      format: "stl",
    });

    expect(result.success).toBe(true);
    expect(result.outputBytes).toBeDefined();
    expect(result.outputBytes!.length).toBeGreaterThan(0);
    // STL binary starts with an 80-byte header, or ASCII starts with "solid"
    const header = new TextDecoder().decode(result.outputBytes!.slice(0, 5));
    const isBinaryOrAsciiStl =
      result.outputBytes!.length > 80 || header === "solid";
    expect(isBinaryOrAsciiStl).toBe(true);
    expect(result.outputPath).toBeDefined();
  });

  it("should attempt PNG render (may not be supported in WASM build)", async () => {
    const result = await engine.renderPng({
      code: "cube([10, 10, 10]);",
      imageSize: [256, 256],
    });

    // The WASM build of OpenSCAD does not include the OpenGL renderer,
    // so PNG export is expected to fail. We verify graceful failure.
    if (result.success) {
      // If it does succeed (future WASM builds), verify PNG magic bytes
      expect(result.outputBytes).toBeDefined();
      expect(result.outputBytes![0]).toBe(0x89);
      expect(result.outputBytes![1]).toBe(0x50);
    } else {
      // Graceful failure — no crash, returns a proper result
      expect(result.success).toBe(false);
    }
  });

  it("should validate valid code", async () => {
    const result = await engine.validate("cube([10, 10, 10]);");

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should detect invalid code (mismatched brackets)", async () => {
    const result = await engine.validate("cube([10, 10, 10);");

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should return version info", async () => {
    const version = await engine.version();
    expect(version).toBeTruthy();
    expect(version).not.toBe("unknown");
    // Should contain version-like string
    expect(version).toMatch(/\d+\.\d+/);
  });

  it("should apply parameter overrides", async () => {
    const code = `
      size = 10;
      cube([size, size, size]);
    `;

    const result = await engine.exportModel({
      code,
      format: "stl",
      params: { size: 20 },
    });

    expect(result.success).toBe(true);
    expect(result.outputBytes).toBeDefined();
    expect(result.outputBytes!.length).toBeGreaterThan(0);
  });

  it("should handle multiple sequential exports", async () => {
    const r1 = await engine.exportModel({
      code: "cube([5, 5, 5]);",
      format: "stl",
    });
    expect(r1.success).toBe(true);

    const r2 = await engine.exportModel({
      code: "sphere(r=10);",
      format: "stl",
    });
    expect(r2.success).toBe(true);

    // Sphere should produce more facets than cube
    expect(r2.outputBytes!.length).toBeGreaterThan(r1.outputBytes!.length);
  });
});
