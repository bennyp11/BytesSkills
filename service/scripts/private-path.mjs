import { realpath, lstat } from "node:fs/promises";
import { resolve, dirname, basename, relative, isAbsolute } from "node:path";

// Resolve existing ancestors too, so a symlink cannot disguise a Git checkout.
export async function canonicalPath(path) {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (dirname(absolute) === absolute) throw error;
    return resolve(await canonicalPath(dirname(absolute)), basename(absolute));
  }
}
export async function privatePath(path, root) {
  if (!path) throw Error("Provide an explicit private workspace path outside Git checkouts");
  const target = await canonicalPath(path);
  if (root) {
    const rel = relative(await canonicalPath(root), target);
    if (rel === ".." || rel.startsWith("../") || isAbsolute(rel))
      throw Error("Workspace path escapes its private root");
  }
  let current = target;
  while (true) {
    let git;
    try { git = await lstat(resolve(current, ".git")); }
    catch (error) { if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error; }
    if (git) throw Error("Workspace data must stay outside Git checkouts");
    if (dirname(current) === current) break;
    current = dirname(current);
  }
  return target;
}
