# Local creative workspace

This directory is intentionally tracked and backed up to the private GitHub repo.
It currently contains no generated creative artifacts. Illustrative examples live
under `examples/` and cannot resolve as live pointers.

## Proposed record layout

```text
workspace/
├── workspace.json
├── artifacts/
│   └── concept/
│       └── 002/
│           ├── current.json
│           └── revisions/
│               ├── v1/record.json
│               ├── v1/content.md
│               └── v2/...
└── runs/
    └── 012/record.json
```

The same layout supports hooks, scripts, plans and media. Revision directories hold
metadata and the actual content files. `current.json` names the latest completed
revision. A rebuildable index may be added later; records remain authoritative.
Records include type, ID, revision, timestamps, parent, links, exact source pointers,
status, format/treatment versions, resolved settings, originating run and file paths.
Paths must remain within the workspace and must not overwrite other revisions.

## Backup contract

After a complete local operation or coherent batch:

1. Verify all output files and record links exist.
2. Inspect changes for unintended files or secrets.
3. Commit definitions, workspace artifacts and run records relevant to the change.
4. Push to the configured private repository.
5. Report local-save and remote-backup status separately if push fails.

Never rewrite Git history to hide ordinary creative revisions. Git complements the
artifact revision model; it does not replace stable pointers. Check concurrent edits
before committing. Credentials, caches and transient files remain excluded.

Track text, metadata and suitable small assets directly. If a generated binary needs
Git LFS, configure and verify actual LFS upload before calling it backed up. Do not
silently exclude large media, replace it with an expiring URL, or treat an LFS pointer
alone as proof of remote storage. No LFS policy is configured yet because the workspace
is empty. Archived content remains tracked. Permanent removal requires a separate
explicit action and does not erase older Git commits.

## Clipping batches before the artifact runtime

The clip workflow may save actual files under `clipping/<batch-uuid>/`, with run
metadata and separate `60s/`, `30s/`, and `10-15s/` variant directories. These are
real saved batches, not allocated `@video` pointers. Their paths and run metadata
permit later migration without overwriting source files or earlier cuts. The same
GitHub backup policy applies, including explicit handling of large media.
