/**
 * Native OpenSCAD CLI engine — implements the Engine interface by wrapping
 * the locally-installed OpenSCAD binary.
 */

import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type {
  Engine,
  RenderPngOptions,
  RenderResult,
  ExportOptions,
  ValidateResult,
} from "./types.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export interface NativeEngineOptions {
  /** Explicit path to the openscad binary */
  executable?: string;
  /** Directory for temp files (auto-created) */
  workDir?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function which(name: string): string | null {
  try {
    const cmd = platform() === "win32" ? `where ${name}` : `which ${name}`;
    const result = execFileSync(
      platform() === "win32" ? "cmd" : "/bin/sh",
      platform() === "win32" ? ["/c", cmd] : ["-c", cmd],
      { encoding: "utf-8", timeout: 5000 }
    );
    return result.trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

function findOpenSCAD(): string {
  // Try PATH first
  for (const name of ["openscad", "openscad-nightly"]) {
    const found = which(name);
    if (found) return found;
  }

  // Platform-specific well-known locations
  const os = platform();
  const candidates: string[] = [];

  if (os === "darwin") {
    candidates.push("/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD");
  } else if (os === "win32") {
    candidates.push(
      "C:\\Program Files\\OpenSCAD\\openscad.exe",
      "C:\\Program Files (x86)\\OpenSCAD\\openscad.exe"
    );
  } else {
    candidates.push(
      "/usr/bin/openscad",
      "/usr/local/bin/openscad",
      "/snap/bin/openscad"
    );
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  throw new Error(
    "OpenSCAD not found. Install it from https://openscad.org/downloads.html " +
    "and make sure it is on your PATH."
  );
}

function parseStderr(stderr: string): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const line of stderr.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (lower.includes("warning")) warnings.push(t);
    else if (lower.includes("error") || lower.includes("parse error")) errors.push(t);
  }
  return { warnings, errors };
}

// ---------------------------------------------------------------------------
// NativeEngine class
// ---------------------------------------------------------------------------

export class NativeEngine implements Engine {
  readonly name = "native";
  readonly workDir: string;

  private _executable: string | undefined;
  private readonly _requestedExecutable: string | undefined;

  constructor(opts: NativeEngineOptions = {}) {
    this._requestedExecutable = opts.executable;
    this.workDir = opts.workDir ?? join(tmpdir(), `simple-3d-modeling-mcp-native-${process.pid}`);
    mkdirSync(this.workDir, { recursive: true });
  }

  /** Lazily resolves the OpenSCAD binary so the server can start even if it's not yet installed. */
  get executable(): string {
    if (!this._executable) {
      this._executable = this._requestedExecutable ?? findOpenSCAD();
    }
    return this._executable;
  }

  // -- Info ----------------------------------------------------------------

  async version(): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(this.executable, ["--version"], { timeout: 10_000 });
      return (stdout + stderr).trim();
    } catch (e: any) {
      return `Unknown (${e.message ?? e})`;
    }
  }

  // -- Internal helpers ---------------------------------------------------

  private writeScad(code: string): string {
    const id = randomUUID();
    const p = join(this.workDir, `${id}.scad`);
    writeFileSync(p, code, "utf-8");
    return p;
  }

  private async run(args: {
    scadPath: string;
    outputPath: string;
    params?: Record<string, string | number | boolean>;
    camera?: string;
    imageSize?: [number, number];
    renderFull?: boolean;
    colorscheme?: string;
    timeout?: number;
  }): Promise<RenderResult> {
    const cmd: string[] = [];

    if (args.renderFull !== false) cmd.push("--render");
    if (args.camera) cmd.push("--camera", args.camera);
    if (args.imageSize) cmd.push("--imgsize", `${args.imageSize[0]},${args.imageSize[1]}`);
    if (args.colorscheme) cmd.push("--colorscheme", args.colorscheme);

    if (args.params) {
      for (const [k, v] of Object.entries(args.params)) {
        if (typeof v === "boolean") cmd.push("-D", `${k}=${v ? "true" : "false"}`);
        else if (typeof v === "string") cmd.push("-D", `${k}="${v}"`);
        else cmd.push("-D", `${k}=${v}`);
      }
    }

    cmd.push("-o", args.outputPath, args.scadPath);

    try {
      const { stdout, stderr } = await execFileAsync(
        this.executable,
        cmd,
        { timeout: (args.timeout ?? 120) * 1000 }
      );

      const { warnings, errors } = parseStderr(stderr);
      const success = existsSync(args.outputPath);

      return {
        success,
        outputPath: success ? args.outputPath : undefined,
        outputBytes: success ? readFileSync(args.outputPath) : undefined,
        stdout,
        stderr,
        warnings,
        errors,
      };
    } catch (e: any) {
      const stderr: string = e.stderr ?? String(e);
      const { warnings, errors } = parseStderr(stderr);
      if (e.killed) {
        errors.push(`Timeout after ${args.timeout ?? 120}s – model may be too complex.`);
      }
      return { success: false, stdout: e.stdout ?? "", stderr, warnings, errors };
    }
  }

  // -- Engine interface implementation ------------------------------------

  async renderPng(opts: RenderPngOptions): Promise<RenderResult> {
    const id = randomUUID();
    const scadPath = this.writeScad(opts.code);
    const outputPath = join(this.workDir, `${id}.png`);
    return this.run({
      scadPath,
      outputPath,
      params: opts.params,
      camera: opts.camera,
      imageSize: opts.imageSize ?? [1024, 768],
      colorscheme: opts.colorscheme ?? "Tomorrow Night",
    });
  }

  async exportModel(opts: ExportOptions): Promise<RenderResult> {
    const id = randomUUID();
    const fmt = (opts.format ?? "stl").toLowerCase().replace(/^\./, "");
    const scadPath = this.writeScad(opts.code);
    const outputPath = join(this.workDir, opts.filename ?? `${id}.${fmt}`);
    return this.run({ scadPath, outputPath, params: opts.params });
  }

  async validate(code: string): Promise<ValidateResult> {
    const id = randomUUID();
    const scadPath = this.writeScad(code);
    const outputPath = join(this.workDir, `${id}.csg`);
    const result = await this.run({ scadPath, outputPath, renderFull: false, timeout: 30 });
    return {
      valid: result.success,
      warnings: result.warnings,
      errors: result.errors,
    };
  }

  // -- Native-only extras -------------------------------------------------

  libraryPaths(): string[] {
    const home = homedir();
    const os = platform();
    const candidates: string[] = [];

    if (os === "darwin") {
      candidates.push(join(home, "Documents", "OpenSCAD", "libraries"));
      candidates.push(join(home, "Library", "Application Support", "OpenSCAD", "libraries"));
    } else if (os === "win32") {
      candidates.push(join(home, "Documents", "OpenSCAD", "libraries"));
    } else {
      candidates.push(join(home, ".local", "share", "OpenSCAD", "libraries"));
      candidates.push("/usr/share/openscad/libraries");
      candidates.push("/usr/local/share/openscad/libraries");
    }

    return candidates.filter((p) => existsSync(p));
  }

  listLibraries(): Record<string, string[]> {
    const libs: Record<string, string[]> = {};
    for (const libDir of this.libraryPaths()) {
      try {
        for (const entry of readdirSync(libDir)) {
          const full = join(libDir, entry);
          const stat = statSync(full);
          if (stat.isDirectory()) {
            const files = readdirSync(full)
              .filter((f) => f.endsWith(".scad"))
              .slice(0, 20);
            libs[entry] = files;
          } else if (entry.endsWith(".scad")) {
            libs[entry.replace(".scad", "")] = [entry];
          }
        }
      } catch {
        // skip unreadable directories
      }
    }
    return libs;
  }
}
