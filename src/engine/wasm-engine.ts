import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOpenSCAD } from "openscad-wasm";
import type {
  Engine,
  RenderPngOptions,
  RenderResult,
  ExportOptions,
  ValidateResult,
} from "./types.js";

/**
 * Creates a fresh OpenSCAD WASM instance with output capture.
 *
 * Emscripten's callMain() can only be invoked once per instance — a second
 * call will crash. Therefore we spin up a new instance for every operation.
 * The WASM binary is cached internally by the JS engine / V8, so subsequent
 * instantiations are fast (~50-100 ms).
 */
async function createInstance(stdoutLines: string[], stderrLines: string[]) {
  const wrapper = await createOpenSCAD({
    noInitialRun: true,
    print: (text: string) => stdoutLines.push(text),
    printErr: (text: string) => stderrLines.push(text),
  });
  return wrapper.getInstance();
}

function parseOutput(lines: string[]): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/warning/i.test(trimmed)) {
      warnings.push(trimmed);
    } else if (/error/i.test(trimmed)) {
      errors.push(trimmed);
    }
  }
  return { warnings, errors };
}

function buildParamArgs(
  params: Record<string, string | number | boolean> | undefined,
): string[] {
  if (!params) return [];
  const args: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      args.push("-D", `${key}="${value}"`);
    } else {
      args.push("-D", `${key}=${value}`);
    }
  }
  return args;
}

export class WasmEngine implements Engine {
  readonly name = "wasm";
  readonly workDir: string;

  constructor(workDir?: string) {
    this.workDir = workDir ?? join(tmpdir(), "simple-3d-modeling-mcp-wasm");
  }

  async renderPng(opts: RenderPngOptions): Promise<RenderResult> {
    const id = randomUUID();
    const inputPath = `/${id}.scad`;
    const outputPath = `/${id}.png`;

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    try {
      const instance = await createInstance(stdoutLines, stderrLines);

      instance.FS.writeFile(inputPath, opts.code);

      const args = [inputPath, "-o", outputPath];

      if (opts.imageSize) {
        args.push(`--imgsize=${opts.imageSize[0]},${opts.imageSize[1]}`);
      }
      if (opts.camera) {
        args.push(`--camera=${opts.camera}`);
      }
      if (opts.colorscheme) {
        args.push(`--colorscheme=${opts.colorscheme}`);
      }
      args.push(...buildParamArgs(opts.params));

      const exitCode = instance.callMain(args);

      const stderr = stderrLines.join("\n");
      const stdout = stdoutLines.join("\n");
      const { warnings, errors } = parseOutput(stderrLines);

      let outputBytes: Uint8Array | undefined;
      let diskPath: string | undefined;

      try {
        const bytes = instance.FS.readFile(outputPath, {
          encoding: "binary",
        });
        outputBytes = bytes;
        await mkdir(this.workDir, { recursive: true });
        diskPath = join(this.workDir, `${id}.png`);
        await writeFile(diskPath, bytes);
      } catch {
        // Output file may not exist if render failed
      }

      return {
        success: exitCode === 0 && errors.length === 0,
        outputPath: diskPath,
        outputBytes,
        stdout,
        stderr,
        warnings,
        errors,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        stdout: stdoutLines.join("\n"),
        stderr: stderrLines.join("\n"),
        warnings: [],
        errors: [message],
      };
    }
  }

  async exportModel(opts: ExportOptions): Promise<RenderResult> {
    const id = randomUUID();
    const format = opts.format ?? "stl";
    const inputPath = `/${id}.scad`;
    const outputPath = `/${id}.${format}`;

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    try {
      const instance = await createInstance(stdoutLines, stderrLines);

      instance.FS.writeFile(inputPath, opts.code);

      const args = [inputPath, "-o", outputPath];
      args.push(...buildParamArgs(opts.params));

      const exitCode = instance.callMain(args);

      const stderr = stderrLines.join("\n");
      const stdout = stdoutLines.join("\n");
      const { warnings, errors } = parseOutput(stderrLines);

      let outputBytes: Uint8Array | undefined;
      let diskPath: string | undefined;

      try {
        const bytes = instance.FS.readFile(outputPath, {
          encoding: "binary",
        });
        outputBytes = bytes;
        await mkdir(this.workDir, { recursive: true });
        const filename = opts.filename ?? `${id}.${format}`;
        diskPath = join(this.workDir, filename);
        await writeFile(diskPath, bytes);
      } catch {
        // Output may not exist on failure
      }

      return {
        success: exitCode === 0 && errors.length === 0,
        outputPath: diskPath,
        outputBytes,
        stdout,
        stderr,
        warnings,
        errors,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        stdout: stdoutLines.join("\n"),
        stderr: stderrLines.join("\n"),
        warnings: [],
        errors: [message],
      };
    }
  }

  async validate(code: string): Promise<ValidateResult> {
    const id = randomUUID();
    const inputPath = `/${id}.scad`;
    const outputPath = `/${id}.csg`;

    const stderrLines: string[] = [];

    try {
      const instance = await createInstance([], stderrLines);

      instance.FS.writeFile(inputPath, code);

      const exitCode = instance.callMain([inputPath, "-o", outputPath]);

      const { warnings, errors } = parseOutput(stderrLines);

      return {
        valid: exitCode === 0 && errors.length === 0,
        warnings,
        errors,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        warnings: [],
        errors: [message],
      };
    }
  }

  async version(): Promise<string> {
    const stderrLines: string[] = [];
    const stdoutLines: string[] = [];

    try {
      const instance = await createInstance(stdoutLines, stderrLines);

      instance.callMain(["--version"]);

      const allOutput = [...stdoutLines, ...stderrLines].join("\n");
      const match =
        allOutput.match(/OpenSCAD\s+version\s+[\d.]+/i) ??
        allOutput.match(/[\d]+\.[\d]+\.[\d]+/);
      return match ? match[0] : allOutput.trim() || "unknown";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `error: ${message}`;
    }
  }
}
