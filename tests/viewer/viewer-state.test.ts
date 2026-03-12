import { describe, it, expect } from "vitest";
import { ViewerState } from "../../src/viewer/viewer-state.js";

describe("ViewerState", () => {
  it("starts with no versions", () => {
    const state = new ViewerState();
    expect(state.versions).toHaveLength(0);
    expect(state.latest).toBeUndefined();
  });

  it("adds a model version", () => {
    const state = new ViewerState();
    const stlBytes = new Uint8Array([1, 2, 3]);
    const added = state.addVersion(stlBytes, "My Model");

    expect(added.version).toBe(1);
    expect(added.title).toBe("My Model");
    expect(added.stlBytes).toBe(stlBytes);
    expect(added.timestamp).toBeGreaterThan(0);
    expect(state.versions).toHaveLength(1);
    expect(state.latest).toBe(added);
  });

  it("increments version numbers", () => {
    const state = new ViewerState();
    const v1 = state.addVersion(new Uint8Array([1]), "Version 1");
    const v2 = state.addVersion(new Uint8Array([2]), "Version 2");
    const v3 = state.addVersion(new Uint8Array([3]), "Version 3");

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v3.version).toBe(3);
  });

  it("retrieves a specific version", () => {
    const state = new ViewerState();
    state.addVersion(new Uint8Array([1]), "First");
    const v2 = state.addVersion(new Uint8Array([2]), "Second");
    state.addVersion(new Uint8Array([3]), "Third");

    const found = state.getVersion(2);
    expect(found).toBe(v2);
    expect(found?.title).toBe("Second");
  });

  it("caps at maxVersions and evicts oldest", () => {
    const state = new ViewerState(3);
    const v1 = state.addVersion(new Uint8Array([1]), "First");
    state.addVersion(new Uint8Array([2]), "Second");
    state.addVersion(new Uint8Array([3]), "Third");
    state.addVersion(new Uint8Array([4]), "Fourth");

    expect(state.versions).toHaveLength(3);
    expect(state.getVersion(v1.version)).toBeUndefined();
    expect(state.versions[0].title).toBe("Second");
    expect(state.versions[2].title).toBe("Fourth");
  });

  it("returns history metadata without STL bytes", () => {
    const state = new ViewerState();
    state.addVersion(new Uint8Array([1, 2, 3]), "Model A");
    state.addVersion(new Uint8Array([4, 5, 6]), "Model B");

    const history = state.getHistory();
    expect(history).toHaveLength(2);

    for (const entry of history) {
      expect(entry).toHaveProperty("version");
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).not.toHaveProperty("stlBytes");
    }

    expect(history[0].title).toBe("Model A");
    expect(history[1].title).toBe("Model B");
  });
});
