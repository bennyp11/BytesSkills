# Pointer architecture: local first, storage-independent identity

The `mvp` branch adds a hosted implementation: see [cloud service](../service/README.md).
This document describes the original local backend; remote D1 records are authoritative
and local exports are read-only mirrors after cutover.

The local artifact runtime is implemented in the bytes skill's `scripts/artifacts.py`.
The assistant generates content; this helper saves, resolves, revisions and queries it.
No hosted model service or native slash-command parser is implied.

## Layers

```text
/bytes command → versioned operation contract → assistant workflow
                                                ↓
                                   shared artifact service
                                     ↙                  ↘
                          immutable records         content blobs
                                     ↘                  ↙
                                   rebuildable SQLite index
```

A pointer names an artifact, not a file location. The workspace UUID defines its
namespace. Artifacts receive UUIDs to avoid the distributed counter problem. A
human can paste an unambiguous eight-character prefix; persisted references contain
full UUIDs and exact revision numbers. No title or folder is part of identity.

## Explicitly local files (outside Git)

```text
workspace/
  workspace.json
  records/concept/<uuid>/v00000001.json
  records/concept/<uuid>/v00000002.json
  blobs/sha256/<two-character-prefix>/<sha256>
  .index/artifacts.sqlite     # ignored; derived and rebuildable
```

Records contain schema version, identity, revision, title, lifecycle status, tags,
resolved settings, relations, provenance and content keys. Content blobs are immutable
and deduplicate by checksum. Records checksum their own envelope and link the prior
revision checksum. This detects accidental corruption, not malicious rewriting of
all hashes. Git is not part of workspace revision history.

`parent` organizes concepts and stays an identity reference. `inputs`, `derived_from`,
`links` and `outputs` pin exact revisions. Every update requires expected_revision,
so an assistant cannot quietly overwrite newer work. Changing title, parent or status
also creates a revision. Archived records remain accessible. There is no delete API.

## Query layer

SQLite indexes current type, format, status, parent and tags; FTS5 indexes current
title and text. A separate edge table supports reverse references across revision
history. Queries return bounded pages, not the whole workspace. UUID keyset cursors
avoid offset scanning, though this version does not provide snapshot-consistent
pagination during concurrent writes. Binary media contents are not searchable text.

The index is local and intentionally absent from Git. Save updates it transactionally.
Reindex builds from authoritative records, verifies content and relations, and detects
cycles and broken revision chains. Run it after external local writes. The
runtime does not watch filesystem changes automatically. A stale cache can miss a
new externally-written revision until reindex; callers must enforce this after external changes.

## Structured skill growth

`contracts/operations.json` describes each operation's version, handler and persistence
mode. Add input/output types for creative operations. The assistant loads the relevant
handler; every handler calls the same save/resolve/query API. No skill invents its own
IDs, revision format or storage paths.

Add a skill/operation with: a contract, bounded intake, shared output envelope,
provenance requirements, help, and behavior tests for new storage invariants. Definition
versions (such as Troll 0.1.0), operation versions, plugin versions and artifact
revisions are separate. Add explicit migrations for future record schema changes.
The registry is declarative guidance, not a full creative-schema validation engine.

## Scope and limits

This is a working single-writer local foundation, not a distributed database. Saves
are individually atomic; multi-output runs can be partial. Local locks prevent two
writers in one checkout. Two computers can still create conflicting revisions of
one artifact; explicit conflict resolution and reindex are required. Do not auto-merge
revision files with “ours/theirs” or resolve conflict by last-modified timestamp.

Reads use an index plus authoritative content. Local content ingestion currently
loads each file into memory, appropriate for text and modest files; streaming and
multipart media upload are follow-up work. Existing clip batches remain readable and
are not silently migrated. No bucket, paid service or credentials are configured.

## Object-storage migration path

1. Copy records and blobs to object storage retaining identical storage keys and
   workspace ID; verify all checksums before cutover. Existing pointers do not change.
2. Replace local object reads/writes behind the storage boundary. Use conditional
   writes for immutable records and a coordinated latest-revision update.
3. Host a shared metadata/query service for discovery, filtering and reference
   resolution. A bucket alone does not supply fast relational or full-text queries.
4. Add distributed concurrency, authentication, idempotent runs and streaming media
   ingestion before allowing multiple remote writers.
5. Keep storage-specific URLs out of creative references. Resolve short-lived
   download URLs at access time rather than persisting them as artifact identities.

The initial code separates local object operations, but record enumeration and
SQLite coordination still need adaptation for remote use. Migration is a defined
path, not a claim that changing one config field enables R2 today.
