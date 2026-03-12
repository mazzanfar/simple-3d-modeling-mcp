export interface RenderResult {
  success: boolean;
  outputPath?: string;
  outputBytes?: Uint8Array;
  stdout: string;
  stderr: string;
  warnings: string[];
  errors: string[];
}

export interface RenderPngOptions {
  code: string;
  camera?: string;
  imageSize?: [number, number];
  params?: Record<string, string | number | boolean>;
  colorscheme?: string;
}

export interface ExportOptions {
  code: string;
  format?: string;
  params?: Record<string, string | number | boolean>;
  filename?: string;
}

export interface ValidateResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface Engine {
  readonly name: string;
  readonly workDir: string;
  renderPng(opts: RenderPngOptions): Promise<RenderResult>;
  exportModel(opts: ExportOptions): Promise<RenderResult>;
  validate(code: string): Promise<ValidateResult>;
  version(): Promise<string>;
}
