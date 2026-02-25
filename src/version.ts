import { readFileSync } from "node:fs";

let cachedVersion: string | null = null;

export function getPackageVersion(): string {
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  try {
    const packageJsonRaw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const packageJson = JSON.parse(packageJsonRaw) as { version?: string };
    cachedVersion = packageJson.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }

  return cachedVersion;
}
