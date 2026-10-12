# BytesSkills.com waitlist

The apex website is handled by `service/src/website.ts`, independently of the API/OAuth page styles. It uses native HTML forms and no browser JavaScript, third-party fonts, analytics, or build dependencies.

## Routes and persistence

Only the existing `bytesskills.com` hostname dispatches `/`, `/waitlist`, `/thanks`, and `/privacy` to this handler. All other existing apex redirects and api.bytesskills.com behavior remain unchanged.

Apply `service/migrations/0003_website_waitlist.sql` before deploying. It adds `website_waitlist` to the existing D1 database, with a case-insensitive unique email, creation time, and consent-notice version. No new database binding or DNS change is required. Workspace queries/exports do not read this table.

POST `/waitlist` validates email, bounds actual input to 4 KiB, rejects cross-origin browser submissions, and uses a honeypot. It returns a 303 on successful storage (including a duplicate address), 400 on invalid email and 503 on storage failure. No email addresses are logged. There is no public list/export endpoint. Owners can use the D1 console to retrieve signups.

## Deploy

Use the existing reviewed release procedure for `mvp` (`.github/workflows/prepare-release.yml` and `publish-release.yml`), including the additive migration. A PR merge alone does not deploy production. Do not overwrite the MCP service with the standalone preview package.

Before opening substantial public traffic, add a Cloudflare rate-limit rule for POST /waitlist; the honeypot is only basic bot mitigation. No mail is sent by signup. Configure unsubscribe handling and reply support in the chosen email provider before sending early-access updates. Review the privacy notice when adding providers.

## Validation

From `service`, `node --test test/website.test.mjs` exercises the handler with a D1 interface test double. Eight tests passed on Node 24.19.0. The schema was also checked with SQLite for case-insensitive duplicate handling. Full service typecheck/build/Miniflare regression checks and live signup verification remain release gates; they were not run in the connector-only repository session.
