# Synqra Dashboard

Functional project-review dashboard modeled after the Synqra dashboard reference.

## Included

- Dashboard: attention queue, stage progress, activity, meetings, and project summary.
- All Reviews: search, area filters, stage changes, assignment display, and archiving.
- Meetings: note capture, validated AI drafts and editable action items.
- Meeting notetaker: self-hosted Vexa adapter for Zoom/Meet, private recordings, saved transcripts/summaries and expiring share snapshots. See [free self-hosting and activation](docs/MEETING-NOTETAKER.md); a Docker engine is required before live capture works.
- Kanban: move items between workflow stages and archive work.
- Archive: restore items.
- Private, project-scoped Cloudflare D1 persistence and R2 attachments. No shared browser fallback or demo-data reset.
- My Work, estimates, audit history, scoped search, notification preferences and reminders.
- Account password changes, session revocation, optional TOTP MFA and administrator-assisted recovery.
- Isolated staging, release verification, encrypted D1 export/restore and private attachment backup.

## Local development

```bash
npm install
npm run dev
```

## Deploy to Cloudflare

```bash
npm run deploy
```

Production frontend runs on Vercel and proxies `/api` to the Worker. Staging serves the same frontend and API together from its own Worker, database and buckets.

## Verify before rollout

```bash
npm ci
npx playwright install chromium firefox webkit
npm run verify:local
npm audit --audit-level=high
npx wrangler deploy --dry-run
```

`verify:local` builds fresh assets, migrates a temporary local database, exercises the real Worker/D1/R2, checks built UI in three engines, then exports, encrypts, decrypts and restores into a second temporary database. It never uses production data. Its evidence directory is printed on success.

```bash
npm run deploy:staging
npm run verify:release -- https://synqra-staging.ammarhisyam151.workers.dev
```

See [Office rollout and operating runbook](docs/OFFICE-ROLLOUT-2026-10-08.md) for coverage, required configuration, recovery and known remaining work. Do not promote staging merely because a build passes.
