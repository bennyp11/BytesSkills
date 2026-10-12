# GitHub-driven releases

`mvp` contains the release source. Workspace data stays in Cloudflare. No release
artifact includes workspace exports, access keys, tokens or local CapCut projects.

## Setup status

The `production` environment has been created with a `v*` tag restriction. No
deployment credentials have been installed by this change. Automatic approval review
blocked transfer of the existing owner key because that specific credential transfer
was not explicitly authorized and its permissions exceed release publication. Configure
secrets through GitHub, or authorize the transfer separately. A narrower publisher
credential is preferable before expanding access to the repository.

## One-time setup

Create a GitHub environment named `production`. Restrict it to `v*` tags, and add
required reviewers if the repository's GitHub plan supports them. Protect `mvp`
and release tags from unreviewed writes. Publishing a stable release is the normal
production approval; an environment reviewer, if configured, adds a second gate.

Environment secrets:

- `CLOUDFLARE_API_TOKEN`: a dedicated token restricted to the existing Cloudflare
  account. Grant only the Worker deployment, D1 migration, existing KV/R2 binding
  access and zone/domain permissions required by this Wrangler configuration. Use
  Cloudflare's Workers deployment template as a starting point and limit resources.
  Do not copy a personal OAuth token or grant access to other accounts.
- `BYTES_OWNER_KEY`: the existing BytesSkills owner API key, entered via GitHub's
  encrypted secret UI. The current service has no separate release-only credential;
  this key has broader workspace permissions. Keep it environment-scoped, available
  only to the verification/publication steps, and never include it in release assets.
  A dedicated publisher credential is follow-up hardening, not already implemented.

Worker secrets remain in Cloudflare; deployments do not upload or rotate them.
The pipeline does not create/delete D1, R2, KV, DNS or domains. It reconciles the
existing Wrangler configuration and applies checked-in D1 migrations. No automatic
backup scheduler is supplied. Confirm recoverable D1/R2 backups before risky schema
changes; only additive, backward-compatible migrations belong in this pipeline.

## Prepare and publish

1. Change `release.json` to a new stable version and summary in a reviewed PR to
   `mvp`. The first candidate here is `0.8.0`.
2. The Prepare release workflow runs on that version-file change (and its own
   workflow-file changes), validates, builds the Worker once, tests it, and creates
   a draft GitHub release pinned to that commit. Further changes need a new version;
   a prepared tag/candidate is never silently retargeted or overwritten.
3. The draft includes `worker.js`, `plugin.zip`, per-skill JSON publication batches,
   config/lockfile snapshots and a manifest with artifact, migration and skill hashes.
   Packaged plugin manifests use the release version; original historical packages
   remain intact. The tagged source contains the exact migrations to apply.
4. Publish the stable draft through GitHub's UI with your human account. GitHub
   starts Deploy published release from the tagged commit. Do not publish the draft
   from another Actions job using GITHUB_TOKEN: GitHub suppresses recursive workflow
   triggers from that token. Prereleases do not deploy production.
5. The job verifies tag ancestry in `mvp`, manifest/file hashes, secrets, current
   service version and known skill conflicts before any cloud mutation. It applies
   reviewed migrations, deploys the prepared Worker with `--no-bundle`, checks the
   deployed commit/version and authenticated MCP discovery, then publishes each skill.
6. It verifies every published skill checksum and records the release/commit in the
   Actions summary. Wrangler's deployment step records the Worker version ID in its
   log. A GitHub release being published does not itself prove deployment succeeded.

The repository can keep `main` as its default branch: release events run against the
release tag, and preparation runs on pushes to `mvp`. These workflows intentionally
have no workflow_dispatch entry that would require installation on the default
branch. Retry using GitHub's Re-run failed jobs for the original workflow run.

## Adoption and connected clients

Publication never calls bytes_adopt or changes ask/stay/auto preferences. Existing
runs remain pinned. Users choosing Always latest can adopt newly published skills
on their next request; others use Update or `/bytes sync --latest` after the release
is verified. Local plugin installations use the attached package via their host's
supported update flow; the pipeline cannot replace files in other AI installations.

## Partial failure and retry

Deployment is serialized and an active job is never cancelled by another release.
There is no cross-service transaction: migrations, Worker deployment and individual
skill publications can succeed before a later step fails. The failure summary says
so. Some auto-adopting users may see already-published skill versions during a partial
publication. Publishing all nine skills atomically needs a future staged-catalog
activation feature; the current API limits release batches to 250 KB.

After deployment, verification polls health every five seconds for up to one minute
while an older Worker is still being served. Each request is limited to the remaining
time budget. Unexpected service health, a newer release, a conflicting commit, and
request errors still fail immediately. Skill publication starts only after the exact
release and commit match. A timeout reports the last observed identity.

Rerun the same release after fixing the cause. Unchanged version/checksum publication
is idempotent, assets are verified again, and D1 tracks applied migrations. Do not
edit a release asset to repair code: ship a new version. Preflight rejects older
Worker releases and conflicting/revoked same-version skills. The first deployment
from the known pre-automation 0.2.0 service cannot read a checksum catalog; it verifies
owner authentication and health, then enables that endpoint for later releases.

Rollback is deliberate: inspect migration compatibility before restoring a prior
Worker version with Cloudflare's supported rollback procedure. Revoke faulty skill
versions separately using the existing owner API, preserve history and choose a
compatible version for affected workspaces. Do not replay an old release as a rollback
or automatically reverse database migrations. Automatic adoption recovery is not
implemented by these workflows.

## Sources

- [GitHub release events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)
- [GITHUB_TOKEN event restrictions](https://docs.github.com/en/actions/concepts/security/github_token)
- [Cloudflare GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Deploying prebuilt Workers](https://developers.cloudflare.com/workers/wrangler/bundling/)
