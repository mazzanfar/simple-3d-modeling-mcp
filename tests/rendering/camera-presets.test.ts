import { describe, it, expect } from "vitest";
import {
  PRESET_VIEWS,
  getCameraString,
  getTurntableCameras,
  estimateDistance,
} from "../../src/rendering/camera-presets.js";

describe("PRESET_VIEWS", () => {
  it("has standard view names", () => {
    const expectedViews = ["front", "back", "right", "top", "perspective"];
    for (const view of expectedViews) {
      expect(PRESET_VIEWS).toHaveProperty(view);
    }
  });

  it("has all required views including left and bottom", () => {
    expect(PRESET_VIEWS).toHaveProperty("left");
    expect(PRESET_VIEWS).toHaveProperty("bottom");
  });

  it("each preset has rotX, rotY, rotZ properties", () => {
    for (const [, preset] of Object.entries(PRESET_VIEWS)) {
      expect(preset).toHaveProperty("rotX");
      expect(preset).toHaveProperty("rotY");
      expect(preset).toHaveProperty("rotZ");
    }
  });
});

describe("getCameraString", () => {
  it("returns comma-separated camera string with 7 values", () => {
    const result = getCameraString("front", 100);
    const parts = result.split(",");
    expect(parts).toHaveLength(7);
  });

  it("distance is the last value", () => {
    const distance = 150;
    const result = getCameraString("top", distance);
    const parts = result.split(",");
    expect(Number(parts[6])).toBe(distance);
  });

  it("returns correct camera string for front view", () => {
    const result = getCameraString("front", 100);
    expect(result).toBe("0,0,0,90,0,0,100");
  });

  it("returns correct camera string for perspective view", () => {
    const result = getCameraString("perspective", 200);
    expect(result).toBe("0,0,0,55,0,25,200");
  });

  it("throws on unknown preset", () => {
    expect(() => getCameraString("unknown", 100)).toThrow(
      "Unknown camera preset: unknown"
    );
  });

  it("error message lists available presets", () => {
    expect(() => getCameraString("invalid", 100)).toThrow("Available:");
  });
});

describe("getTurntableCameras", () => {
  it("generates the correct number of frames", () => {
    const cameras = getTurntableCameras(8, 100);
    expect(cameras).toHaveLength(8);
  });

  it("generates turntable cameras with unique angles", () => {
    const cameras = getTurntableCameras(12, 100);
    const angles = cameras.map((c) => {
      const parts = c.split(",");
      return Number(parts[5]);
    });
    const uniqueAngles = new Set(angles);
    expect(uniqueAngles.size).toBe(12);
  });

  it("each camera string has 7 comma-separated values", () => {
    const cameras = getTurntableCameras(4, 100);
    for (const cam of cameras) {
      expect(cam.split(",")).toHaveLength(7);
    }
  });

  it("distance is the last value in each camera string", () => {
    const distance = 200;
    const cameras = getTurntableCameras(6, distance);
    for (const cam of cameras) {
      const parts = cam.split(",");
      expect(Number(parts[6])).toBe(distance);
    }
  });

  it("uses default elevation of 55 when not specified", () => {
    const cameras = getTurntableCameras(4, 100);
    for (const cam of cameras) {
      const parts = cam.split(",");
      expect(Number(parts[3])).toBe(55);
    }
  });

  it("uses custom elevation when specified", () => {
    const cameras = getTurntableCameras(4, 100, 30);
    for (const cam of cameras) {
      const parts = cam.split(",");
      expect(Number(parts[3])).toBe(30);
    }
  });

  it("first camera starts at angle 0", () => {
    const cameras = getTurntableCameras(4, 100);
    const parts = cameras[0].split(",");
    expect(Number(parts[5])).toBe(0);
  });

  it("angles span a full 360 degrees", () => {
    const frames = 4;
    const cameras = getTurntableCameras(frames, 100);
    const angles = cameras.map((c) => Number(c.split(",")[5]));
    expect(angles[0]).toBe(0);
    expect(angles[1]).toBe(90);
    expect(angles[2]).toBe(180);
    expect(angles[3]).toBe(270);
  });
});

describe("estimateDistance", () => {
  it("returns reasonable values for a small cube", () => {
    const dist = estimateDistance({ x: 10, y: 10, z: 10 });
    expect(dist).toBe(25);
  });

  it("returns reasonable values for a large object", () => {
    const dist = estimateDistance({ x: 100, y: 50, z: 30 });
    expect(dist).toBe(250);
  });

  it("uses the largest dimension", () => {
    const dist = estimateDistance({ x: 5, y: 100, z: 20 });
    expect(dist).toBe(250);
  });

  it("multiplies max dimension by 2.5", () => {
    const maxDim = 40;
    const dist = estimateDistance({ x: maxDim, y: 10, z: 5 });
    expect(dist).toBe(maxDim * 2.5);
  });

  it("returns a positive number", () => {
    const dist = estimateDistance({ x: 1, y: 1, z: 1 });
    expect(dist).toBeGreaterThan(0);
  });
});
