import { lstat, realpath, symlink, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repositoryRoot, "apps/web");
const hostNodeModules = resolve(webRoot, "node_modules");
const remoteNodeModules = resolve(repositoryRoot, "plugins/time-tracking/frontend/node_modules");

await realpath(hostNodeModules).catch(() => {
  throw new Error("Web dependencies are missing. Run npm ci --prefix apps/web before building the Control Horario remote.");
});

let createdLink = false;
try {
  try {
    const remoteStat = await lstat(remoteNodeModules);
    if (remoteStat.isSymbolicLink()) {
      const [actual, expected] = await Promise.all([realpath(remoteNodeModules), realpath(hostNodeModules)]);
      if (actual !== expected) {
        throw new Error("Control Horario node_modules already points to a different dependency directory.");
      }
    } else if (!remoteStat.isDirectory()) {
      throw new Error("Control Horario node_modules exists but is neither a directory nor a symlink.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await symlink(hostNodeModules, remoteNodeModules, process.platform === "win32" ? "junction" : "dir");
    createdLink = true;
  }

  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = npmExecPath ? [npmExecPath, "run", "build:time-tracking-remote"] : ["run", "build:time-tracking-remote"];
  const result = spawnSync(command, args, { cwd: webRoot, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (createdLink) await unlink(remoteNodeModules).catch(() => {});
}
