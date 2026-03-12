#!/usr/bin/env node

/**
 * simple-3d-modeling-mcp v2 — Zero-setup MCP server for LLM-driven 3D modeling.
 * Uses bundled openscad-wasm (no system install needed).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { exec } from "node:child_process";
import { platform } from "node:os";

import { createEngine, type Engine } from "./engine/index.js";
import { NativeEngine } from "./engine/native-engine.js";
import { OPENSCAD_CHEATSHEET } from "./cheatsheet.js";
import { ViewerServer } from "./viewer/index.js";
import { renderMultiView } from "./rendering/multiview.js";
import { renderTurntable } from "./rendering/turntable.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

let engine: Engine;
let viewerServer: ViewerServer;
let viewerAutoOpened = false;

const server = new McpServer({
  name: "simple-3d-modeling-mcp",
  version: "0.2.0",
});

// ---------------------------------------------------------------------------
// Helper: push model to viewer if running, auto-open on first render
// ---------------------------------------------------------------------------

async function pushToViewer(code: string, params?: Record<string, string | number | boolean>, title?: string): Promise<string | undefined> {
  // Auto-start viewer on first render
  if (!viewerServer.isRunning && !viewerAutoOpened) {
    viewerAutoOpened = true;
    try {
      const url = await viewerServer.start();
      const os = platform();
      const openCmd = os === "darwin" ? `open "${url}"` : os === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
      exec(openCmd, () => {});
    } catch {
      // Viewer failed to start — not critical
    }
  }

  if (viewerServer.isRunning) {
    const stl = await engine.exportModel({ code, format: "stl", params });
    if (stl.success && stl.outputBytes) {
      viewerServer.pushModel(stl.outputBytes, title ?? "Model");
      return viewerServer.url ?? undefined;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
  "cheatsheet",
  "openscad://cheatsheet",
  { description: "OpenSCAD language quick-reference" },
  async () => ({
    contents: [{ uri: "openscad://cheatsheet", text: OPENSCAD_CHEATSHEET, mimeType: "text/markdown" }],
  })
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

// 1. render
server.tool(
  "render",
  "Render OpenSCAD code to a preview image. Returns the image inline. Also updates the live 3D viewer if open.",
  {
    code: z.string().describe("OpenSCAD source code to render"),
    view: z.string().optional().describe("Camera position: 'translateX,translateY,translateZ,rotX,rotY,rotZ,distance'"),
    width: z.number().optional().default(1024).describe("Image width in pixels"),
    height: z.number().optional().default(768).describe("Image height in pixels"),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("OpenSCAD variable overrides"),
    colorscheme: z.string().optional().default("Tomorrow Night").describe("Color scheme name"),
  },
  async ({ code, view, width, height, params, colorscheme }) => {
    const result = await engine.renderPng({
      code, camera: view, imageSize: [width ?? 1024, height ?? 768], params, colorscheme,
    });

    if (!result.success || !result.outputBytes) {
      return {
        content: [{ type: "text", text: `Render failed.\n\n${result.errors.join("\n") || result.stderr}` }],
        isError: true,
      };
    }

    // Push to viewer
    const viewerUrl = await pushToViewer(code, params);

    const parts: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
      { type: "image" as const, data: Buffer.from(result.outputBytes).toString("base64"), mimeType: "image/png" },
    ];

    if (result.warnings.length > 0) {
      parts.push({ type: "text" as const, text: `Warnings:\n${result.warnings.join("\n")}` });
    }
    if (viewerUrl) {
      parts.push({ type: "text" as const, text: `Interactive viewer: ${viewerUrl}` });
    }

    return { content: parts };
  }
);

// 2. render_turntable
server.tool(
  "render_turntable",
  "Render a 360° turntable animation of the model. Returns an animated image (APNG) inline.",
  {
    code: z.string().describe("OpenSCAD source code"),
    frames: z.number().optional().default(24).describe("Number of frames (default 24)"),
    width: z.number().optional().default(512).describe("Image width"),
    height: z.number().optional().default(512).describe("Image height"),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  },
  async ({ code, frames, width, height, params }) => {
    const result = await renderTurntable(engine, {
      code, frames: frames ?? 24, size: [width ?? 512, height ?? 512], params,
    });

    if (!result.success || !result.outputBytes) {
      return {
        content: [{ type: "text", text: `Turntable render failed.\n\n${result.errors.join("\n")}` }],
        isError: true,
      };
    }

    await pushToViewer(code, params);

    return {
      content: [{
        type: "image" as const,
        data: Buffer.from(result.outputBytes).toString("base64"),
        mimeType: "image/apng",
      }],
    };
  }
);

// 3. render_multiview
server.tool(
  "render_multiview",
  "Render multiple views of the model in a single grid image (front, right, top, perspective).",
  {
    code: z.string().describe("OpenSCAD source code"),
    views: z.array(z.string()).optional().default(["front", "right", "top", "perspective"]).describe("View names"),
    width: z.number().optional().default(512).describe("Per-cell width"),
    height: z.number().optional().default(512).describe("Per-cell height"),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  },
  async ({ code, views, width, height, params }) => {
    const result = await renderMultiView(engine, {
      code, views: views ?? ["front", "right", "top", "perspective"],
      cellSize: [width ?? 512, height ?? 512], params,
    });

    if (!result.success || !result.outputBytes) {
      return {
        content: [{ type: "text", text: `Multi-view render failed.\n\n${result.errors.join("\n")}` }],
        isError: true,
      };
    }

    await pushToViewer(code, params);

    return {
      content: [{
        type: "image" as const,
        data: Buffer.from(result.outputBytes).toString("base64"),
        mimeType: "image/png",
      }],
    };
  }
);

// 4. export
server.tool(
  "export",
  "Export OpenSCAD code to a 3D file (STL, 3MF, AMF, etc.). Returns the file path.",
  {
    code: z.string().describe("OpenSCAD source code"),
    format: z.string().optional().default("stl").describe("Output format: stl, 3mf, amf, off, dxf, svg"),
    filename: z.string().optional().describe("Output filename"),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  },
  async ({ code, format, filename, params }) => {
    const result = await engine.exportModel({ code, format, filename, params });

    if (!result.success) {
      return {
        content: [{ type: "text", text: `Export failed.\n\n${result.errors.join("\n") || result.stderr}` }],
        isError: true,
      };
    }

    const size = result.outputBytes ? (result.outputBytes.length / 1024).toFixed(1) + " KB" : "unknown size";
    let msg = `Exported successfully → ${result.outputPath} (${size})`;
    if (result.warnings.length > 0) msg += `\n\nWarnings:\n${result.warnings.join("\n")}`;
    return { content: [{ type: "text", text: msg }] };
  }
);

// 5. validate
server.tool(
  "validate",
  "Check OpenSCAD code for syntax errors without full rendering. Fast.",
  { code: z.string().describe("OpenSCAD source code to validate") },
  async ({ code }) => {
    const result = await engine.validate(code);

    if (!result.valid) {
      return {
        content: [{ type: "text", text: `Validation found errors:\n${result.errors.join("\n")}` }],
        isError: true,
      };
    }

    let msg = "Code is valid — no syntax errors detected.";
    if (result.warnings.length > 0) msg += `\n\nWarnings:\n${result.warnings.join("\n")}`;
    return { content: [{ type: "text", text: msg }] };
  }
);

// 6. open_viewer
server.tool(
  "open_viewer",
  "Open the interactive 3D viewer in the browser. Shows the most recently rendered model with rotate/zoom/pan controls.",
  {},
  async () => {
    const url = await viewerServer.start();

    const os = platform();
    const openCmd = os === "darwin" ? `open "${url}"` : os === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(openCmd, (err) => {
      if (err) console.error("Could not open browser:", err.message);
    });

    return {
      content: [{
        type: "text",
        text: `Interactive 3D viewer opened.\n\n${url}\n\nControls: drag to rotate, scroll to zoom, right-drag to pan.\nThe viewer auto-updates on each render.`,
      }],
    };
  }
);

// 7. cheatsheet (tool version — some clients don't support resources)
server.tool(
  "cheatsheet",
  "Get an OpenSCAD language cheatsheet with primitives, transformations, and tips.",
  {},
  async () => ({ content: [{ type: "text", text: OPENSCAD_CHEATSHEET }] })
);

// 8. list_libraries
server.tool(
  "list_libraries",
  "List installed OpenSCAD libraries. Note: libraries only work with native OpenSCAD, not the bundled WASM engine.",
  {},
  async () => {
    if (engine.name !== "native") {
      return {
        content: [{
          type: "text",
          text: "Libraries are only available when native OpenSCAD is installed.\nThe WASM engine supports built-in primitives only.\n\nInstall OpenSCAD from https://openscad.org/downloads.html to use libraries like BOSL2 and MCAD.",
        }],
      };
    }

    const libs = (engine as NativeEngine).listLibraries();
    const entries = Object.entries(libs);
    if (entries.length === 0) {
      return {
        content: [{
          type: "text",
          text: "No OpenSCAD libraries found.\n\nLibrary paths:\n" + (engine as NativeEngine).libraryPaths().join("\n") +
            "\n\nPopular libraries:\n- BOSL2: https://github.com/BelfrySCAD/BOSL2\n- MCAD: https://github.com/openscad/MCAD",
        }],
      };
    }

    let text = `Found ${entries.length} libraries:\n\n`;
    for (const [name, files] of entries) {
      text += `## ${name}\n` + files.map((f) => `  - ${f}`).join("\n") + "\n\n";
    }
    return { content: [{ type: "text", text }] };
  }
);

// 9. get_version
server.tool(
  "get_version",
  "Check the OpenSCAD engine info (WASM or native).",
  {},
  async () => {
    const ver = await engine.version();
    return {
      content: [{
        type: "text",
        text: `Engine: ${engine.name}\nVersion: ${ver}\nWork directory: ${engine.workDir}`,
      }],
    };
  }
);

// 10. read_scad_file
server.tool(
  "read_scad_file",
  "Read an OpenSCAD (.scad) file from disk.",
  { path: z.string().describe("Absolute path to the .scad file") },
  async ({ path }) => {
    try {
      const content = readFileSync(path, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Failed to read file: ${e.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  engine = await createEngine({
    executablePath: process.env.OPENSCAD_PATH || undefined,
    workDir: process.env.OPENSCAD_WORK_DIR || undefined,
  });
  viewerServer = new ViewerServer();

  // Clean up viewer server on exit
  process.on("beforeExit", async () => {
    if (viewerServer.isRunning) await viewerServer.stop();
  });
  process.on("SIGINT", async () => {
    if (viewerServer.isRunning) await viewerServer.stop();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    if (viewerServer.isRunning) await viewerServer.stop();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
