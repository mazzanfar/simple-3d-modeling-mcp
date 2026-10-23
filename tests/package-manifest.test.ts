import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const npm11 = ["--yes", "npm@11.21.1"];

interface PackResult {
  filename: string;
  files: Array<{ path: string }>;
}

function npmJson(args: string[]): unknown {
  return JSON.parse(execFileSync("npx", [...npm11, ...args, "--json"], {
    encoding: "utf8",
  }));
}

describe("npm package manifest", () => {
  it("keeps the CLI bin in npm 11 pack and publish dry runs", () => {
    execFileSync("npx", [...npm11, "run", "build"]);

    const publish = spawnSync(
      "npx",
      [...npm11, "publish", "--dry-run", "--ignore-scripts", "--loglevel=warn"],
      { encoding: "utf8" },
    );
    const packManifest = npmJson(["pack", "--dry-run", "--ignore-scripts"]) as PackResult[];
    const publishManifest = npmJson([
      "publish",
      "--dry-run",
      "--ignore-scripts",
    ]) as Record<string, PackResult>;
    const packDir = mkdtempSync(join(tmpdir(), "simple-3d-modeling-pack-"));

    try {
      const packed = npmJson([
        "pack",
        "--ignore-scripts",
        "--pack-destination",
        packDir,
      ]) as PackResult[];
      const packageManifest = JSON.parse(execFileSync(
        "tar",
        ["-xOf", join(packDir, packed[0].filename), "package/package.json"],
        { encoding: "utf8" },
      ));

      expect(publish.status, publish.stderr).toBe(0);
      expect(publish.stderr).not.toContain("bin[simple-3d-modeling-mcp]");
      expect(packageManifest.bin).toEqual({
        "simple-3d-modeling-mcp": "dist/index.js",
      });
      expect(packManifest[0].files).toContainEqual(
        expect.objectContaining({ path: "dist/index.js" }),
      );
      expect(publishManifest["simple-3d-modeling-mcp"].files).toContainEqual(
        expect.objectContaining({ path: "dist/index.js" }),
      );
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  });
});
