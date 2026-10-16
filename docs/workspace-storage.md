# Workspace storage policy

GitHub contains core code, migrations, schemas, reusable definitions, packaged
skills and fictional examples. It does not contain user workspace data.

| Data | Authority |
| --- | --- |
| Artifact metadata, pointers, immutable revisions and relationships | PlanetScale PostgreSQL |
| Artifact text and media bytes | Private Cloudflare R2 |
| Published skill releases, adoption preferences and workflow sessions | PlanetScale PostgreSQL |
| OAuth grants and tokens | Cloudflare KV |
| Core implementation, reusable library source and infrastructure configuration | GitHub |

Saving and reading work requires no Git checkout. Stable pointers identify records
in a workspace, not repository paths. Revision history is maintained by the service.
`/bytes sync --latest` adopts cloud skill releases; `--git` only synchronizes code.

## Moving away from the old tracked snapshot

This branch removes `workspace/` from Git's current tree. The existing local copy is
left intact and ignored; existing D1 and R2 data is unchanged. A fresh checkout has
no workspace snapshot and needs none. The test suite uses synthetic temporary data.
No import, deployment or destructive storage migration is required for this change.
Older commits still contain the old snapshot. Removing that history requires a
separate coordinated history rewrite and does not erase other existing clones.

Production moved to PostgreSQL on 2026-10-12; the historical D1 migration discussion
above describes the earlier removal of workspace files from Git. See
[PostgreSQL cutover](postgres-cutover.md) for the current recovery procedure.

## Recovery

The normal save path is cloud-only. Explicit maintenance exports are private recovery
copies, stored outside all Git checkouts; they are never committed or pushed.
The export helper requires an explicit path and refuses Git checkout destinations,
including symlink aliases. Keep recovery copies access-controlled and encrypted
using the storage provider or operating system's facilities.

Artifact exports include revisions and blobs, but do not capture skill selections,
release state or OAuth grants. Full recovery needs authoritative D1 tables and R2
objects; rebuild the FTS search index separately. KV recovery is separate and may
instead require reauthorization. Automatic independent backups and scheduled restore
drills remain future work; cloud persistence is not a claim that those exist.

The signed-in web app supports resumable image, video, and ZIP uploads up to 10 GiB per
file. It stores bytes in private R2 and tenant-scoped upload receipts in PostgreSQL;
final media is saved into the normal artifact system. Direct `/v1/blobs` and MCP
inline content retain their smaller limits. See [media upload design](media-uploads.md).

## Source checks

Run `python3 scripts/check-source-boundary.py` before committing. CI runs the same
check. Ignore rules prevent routine staging; the check catches tracked private
paths and artifact/export structures even when someone uses force-add. Synthetic
fixtures should be generated in temporary directories, not copied from a workspace.
Historical immutable skill release packages remain unchanged. Updated source
instructions must be published under a new version after review; this branch does
not alter users' currently selected releases.
