import { NativeEngine } from "./native-engine.js";
import { WasmEngine } from "./wasm-engine.js";
import type { Engine } from "./types.js";

export interface CreateEngineOptions {
  executablePath?: string;
  workDir?: string;
  forceWasm?: boolean;
}

export async function createEngine(opts: CreateEngineOptions = {}): Promise<Engine> {
  // Use native only when explicitly requested via executablePath or OPENSCAD_PATH.
  // Default to WASM for zero-setup experience.
  if (opts.forceWasm || !opts.executablePath) {
    return new WasmEngine(opts.workDir);
  }

  try {
    const native = new NativeEngine({
      executable: opts.executablePath,
      workDir: opts.workDir,
    });
    await native.version(); // verify it works
    return native;
  } catch {
    return new WasmEngine(opts.workDir);
  }
}
