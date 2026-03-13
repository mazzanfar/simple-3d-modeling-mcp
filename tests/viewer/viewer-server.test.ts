import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { ViewerServer } from "../../src/viewer/viewer-server.js";

describe("ViewerServer", () => {
  let server: ViewerServer | null = null;

  afterEach(async () => {
    if (server) { await server.stop(); server = null; }
  });

  it("starts on a random port", async () => {
    server = new ViewerServer();
    const url = await server.start();
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it("returns the same URL on subsequent start calls", async () => {
    server = new ViewerServer();
    const url1 = await server.start();
    const url2 = await server.start();
    expect(url1).toBe(url2);
  });

  it("serves HTML on GET /", async () => {
    server = new ViewerServer();
    const url = await server.start();
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("reports running state", async () => {
    server = new ViewerServer();
    expect(server.isRunning).toBe(false);
    await server.start();
    expect(server.isRunning).toBe(true);
    await server.stop();
    expect(server.isRunning).toBe(false);
    server = null;
  });

  it("pushes model updates to WebSocket clients", async () => {
    server = new ViewerServer();
    const url = await server.start();
    const wsUrl = url.replace("http", "ws");

    const ws = new WebSocket(wsUrl);
    const messages: any[] = [];
    ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
    await new Promise<void>((resolve) => { ws.onopen = () => resolve(); });

    server.pushModel(new Uint8Array([1, 2, 3]), "Test Model");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const update = messages.find((m) => m.type === "model-update");
    expect(update).toBeDefined();
    expect(update.title).toBe("Test Model");
    expect(update.version).toBe(1);
    expect(update.stlBase64).toBeDefined();

    ws.close();
  });
});
