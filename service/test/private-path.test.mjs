import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privatePath, canonicalPath } from "../scripts/private-path.mjs";

test("private recovery paths reject checkouts, worktrees, symlinks and escaping children", async () => {
  const root = await mkdtemp(join(tmpdir(), "bytes-path-"));
  try {
    await assert.rejects(privatePath(undefined), /explicit/);
    await mkdir(join(root, "repo", ".git"), {recursive: true});
    await mkdir(join(root, "worktree"));
    await writeFile(join(root, "worktree", ".git"), "gitdir: elsewhere");
    await symlink(join(root, "repo"), join(root, "alias"));
    for (const folder of ["repo", "worktree", "alias"])
      await assert.rejects(privatePath(join(root, folder, "new", "export")), /outside Git/);
    const safe = join(root, "private");
    assert.equal(await privatePath(join(safe, "new")), await canonicalPath(join(safe, "new")));
    await mkdir(safe);
    await symlink(join(root, "repo"), join(safe, "records"));
    await assert.rejects(privatePath(join(safe, "records", "new.json"), safe), /escapes/);
    await assert.rejects(privatePath(join(safe, "..", "outside"), safe), /escapes/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
