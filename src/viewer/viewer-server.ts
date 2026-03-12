import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ViewerState } from "./viewer-state.js";
import { generateViewerHtml } from "./viewer-html.js";

export class ViewerServer {
  private _server: Server | null = null;
  private _wss: WebSocketServer | null = null;
  private _url: string | null = null;
  private _clients: Set<WebSocket> = new Set();
  readonly state: ViewerState;

  constructor(maxVersions = 50) {
    this.state = new ViewerState(maxVersions);
  }

  get isRunning(): boolean {
    return this._server !== null && this._server.listening;
  }

  get url(): string | null {
    return this._url;
  }

  async start(): Promise<string> {
    if (this._url) return this._url;

    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        if (req.method === "GET" && (req.url === "/" || req.url === "")) {
          const html = generateViewerHtml();
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(html);
        } else if (req.method === "GET" && req.url?.startsWith("/model/")) {
          const version = parseInt(req.url.split("/")[2], 10);
          const model = this.state.getVersion(version);
          if (model) {
            res.writeHead(200, {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="model-v${version}.stl"`,
            });
            res.end(Buffer.from(model.stlBytes));
          } else {
            res.writeHead(404); res.end("Not found");
          }
        } else {
          res.writeHead(404); res.end("Not found");
        }
      });

      const wss = new WebSocketServer({ server });
      wss.on("connection", (ws) => {
        this._clients.add(ws);
        ws.on("close", () => this._clients.delete(ws));
        ws.on("error", () => this._clients.delete(ws));

        // Send history on connect
        ws.send(JSON.stringify({ type: "model-history", versions: this.state.getHistory() }));

        // Send latest model if available
        const latest = this.state.latest;
        if (latest) {
          ws.send(JSON.stringify({
            type: "model-update",
            version: latest.version,
            title: latest.title,
            timestamp: latest.timestamp,
            stlBase64: Buffer.from(latest.stlBytes).toString("base64"),
          }));
        }

        // Handle client requests for specific versions
        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "request-model" && typeof msg.version === "number") {
              const model = this.state.getVersion(msg.version);
              if (model) {
                ws.send(JSON.stringify({
                  type: "model-update",
                  version: model.version, title: model.title,
                  timestamp: model.timestamp,
                  stlBase64: Buffer.from(model.stlBytes).toString("base64"),
                }));
              }
            }
          } catch { /* ignore */ }
        });
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          this._url = `http://localhost:${addr.port}`;
          this._server = server;
          this._wss = wss;
          resolve(this._url);
        } else {
          reject(new Error("Failed to bind server"));
        }
      });
      server.on("error", reject);
    });
  }

  pushModel(stlBytes: Uint8Array, title: string): void {
    const entry = this.state.addVersion(stlBytes, title);
    const msg = JSON.stringify({
      type: "model-update",
      version: entry.version, title: entry.title, timestamp: entry.timestamp,
      stlBase64: Buffer.from(stlBytes).toString("base64"),
    });
    for (const client of this._clients) {
      try { client.send(msg); } catch {}
    }
  }

  async stop(): Promise<void> {
    for (const client of this._clients) {
      try { client.close(); } catch {}
    }
    this._clients.clear();
    if (this._wss) { this._wss.close(); this._wss = null; }
    if (this._server) {
      await new Promise<void>((resolve) => { this._server!.close(() => resolve()); });
      this._server = null;
    }
    this._url = null;
  }
}
