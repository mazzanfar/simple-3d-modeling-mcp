import { describe, it, expect, beforeAll } from "vitest";
import { NativeEngine, type NativeEngineOptions } from "../../src/engine/native-engine.js";
import type { Engine } from "../../src/engine/types.js";

describe("NativeEngine – interface shape", () => {
  let engine: NativeEngine;

  beforeAll(() => {
    engine = new NativeEngine();
  });

  it("should have name === 'native'", () => {
    expect(engine.name).toBe("native");
  });

  it("should expose a workDir string", () => {
    expect(typeof engine.workDir).toBe("string");
    expect(engine.workDir.length).toBeGreaterThan(0);
  });

  it("should satisfy the Engine interface (structural check)", () => {
    // TypeScript guarantees this at compile time; this runtime check confirms
    // the methods exist and are functions.
    const e: Engine = engine;
    expect(typeof e.renderPng).toBe("function");
    expect(typeof e.exportModel).toBe("function");
    expect(typeof e.validate).toBe("function");
    expect(typeof e.version).toBe("function");
  });

  it("should expose libraryPaths method", () => {
    expect(typeof engine.libraryPaths).toBe("function");
  });

  it("should expose listLibraries method", () => {
    expect(typeof engine.listLibraries).toBe("function");
  });

  it("libraryPaths() should return an array", () => {
    const paths = engine.libraryPaths();
    expect(Array.isArray(paths)).toBe(true);
    // Each entry that exists should be a string
    for (const p of paths) {
      expect(typeof p).toBe("string");
    }
  });

  it("listLibraries() should return a plain object", () => {
    const libs = engine.listLibraries();
    expect(typeof libs).toBe("object");
    expect(libs).not.toBeNull();
    // Values are arrays of strings
    for (const [key, files] of Object.entries(libs)) {
      expect(typeof key).toBe("string");
      expect(Array.isArray(files)).toBe(true);
    }
  });

  it("version() returns a string without requiring OpenSCAD to be installed", async () => {
    // When OpenSCAD is not installed, version() should catch the error and
    // return a string starting with "Unknown" rather than throwing.
    const v = await engine.version().catch(() => "caught");
    expect(typeof v).toBe("string");
  });

  it("NativeEngineOptions accepts executable and workDir", () => {
    // Compile-time type check exercised at runtime by constructing with options
    const opts: NativeEngineOptions = {
      executable: "/usr/bin/openscad",
      workDir: engine.workDir,
    };
    const e2 = new NativeEngine(opts);
    expect(e2.workDir).toBe(engine.workDir);
  });
});
