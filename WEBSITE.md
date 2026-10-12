# Website deployments

The monorepo has two independent Cloudflare Workers:

| Source | Worker | Domain | Deployment trigger |
| --- | --- | --- | --- |
| website/ | bytesskills-website | bytesskills.com | Merge website changes into mvp |
| service/ | bytesskills-mvp | api.bytesskills.com | Publish a prepared core release |

Website changes do not bump release.json, build skill packages, publish a GitHub
release, or require /bytes sync. The website has its own package lock, tests,
configuration and GitHub Actions workflow. PRs only check; pushes to mvp deploy
after checks, using the existing production environment and CLOUDFLARE_API_TOKEN.
That token must be allowed to deploy the new Worker and configure its domain.

## First cutover

Merging this change triggers the Website workflow. It creates the waitlist table
if absent, deploys bytesskills-website, and moves the bytesskills.com custom domain
to it. Locked Wrangler runs noninteractively in Actions and transfers existing
custom-domain ownership. api.bytesskills.com remains on bytesskills-mvp.
The post-deploy check verifies the website commit header and API health.
A failed check means deployment needs inspection; it does not automatically roll back.

Do not publish the old v0.8.2 draft prepared before this split, or rerun an old
core deployment: its configuration still assigns bytesskills.com to the core.
Delete that stale draft in GitHub. Prepare the next core release from the merged
mvp source when a core release is needed. Its configuration owns only the API.
The website cutover itself needs no core release.

Existing signups remain in the website_waitlist table in the existing D1 database.
The website uses its own website_d1_migrations tracking table and an idempotent
CREATE TABLE migration; the historical core migration is retained.
Deployments are independent, but database access is not isolated: the website
currently binds the same D1 database. It has no OAuth, owner-key or R2 bindings.

## Local development and verification

```sh
cd website
npm ci
npm run check
npm test
npm run build
npx wrangler d1 migrations apply DB --local
npm run dev
```

To deploy manually from reviewed mvp source with Cloudflare credentials:

```sh
cd website
npm ci
npm run db:remote
npx wrangler deploy --var "WEBSITE_COMMIT:$(git rev-parse HEAD)"
WEBSITE_COMMIT="$(git rev-parse HEAD)" node scripts/smoke.mjs
```

For normal edits, change website/ and merge the PR into mvp. To roll back website
code, revert the website change in a new PR and merge it; additive database
migrations are not automatically reversed. Never roll back by republishing an old
core release.

The raw HTML page and form are served directly; no frontend framework, analytics,
cookies or JavaScript is needed. POST /waitlist stores normalized emails with
consent version and timestamp, deduplicates, limits request size, checks browser
origin, and includes a honeypot. Database errors show an honest retry message.
Other paths redirect to the API to preserve existing apex API links.
No public signup listing or email export is exposed. Production signup data must
stay outside Git.
