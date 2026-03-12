import { describe, it, expect } from "vitest";
import { createEngine } from "../../src/engine/engine-factory.js";

describe("createEngine", () => {
  it("returns an engine with the Engine interface", async () => {
    const engine = await createEngine();
    expect(engine.name).toMatch(/^(wasm|native)$/);
    expect(typeof engine.renderPng).toBe("function");
    expect(typeof engine.exportModel).toBe("function");
  });

  it("returns WASM engine when forceWasm is true", async () => {
    const engine = await createEngine({ forceWasm: true });
    expect(engine.name).toBe("wasm");
  });
});
