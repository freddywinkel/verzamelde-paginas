import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildTarget = path.resolve(projectRoot, "dist");
if (buildTarget !== path.join(projectRoot, "dist") || !buildTarget.startsWith(`${projectRoot}${path.sep}`)) {
  throw new Error(`Refusing to clean unexpected path: ${buildTarget}`);
}
await rm(buildTarget, { recursive: true, force: true });
