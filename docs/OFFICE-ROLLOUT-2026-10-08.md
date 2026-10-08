# Office rollout — 8 October 2026

## Scope and decisions

Implementation is on `codex/office-rollout`, in the attached managed worktree. Production rollout completed on 8 October 2026 after an encrypted D1 backup and paired Worker/Vercel deployment. SSO is deliberately deferred at the user's request. Production already contains a Resend API-key secret, but its sender identity is unverified; this rollout sent no invitations, alerts, or messages to coworkers. External operational alerts remain unconfigured.

This is not a claim of “zero bugs” or of completing every P0–P2 item. Automated evidence below is a release gate, not a substitute for real-device and team acceptance testing.

## Coverage

| Priority | Implemented | Still required before declaring full completion |
| --- | --- | --- |
| P0 release safety | Frontend/API release identifiers, manifest/chunk recovery, schema readiness, explicit staging deployment, fresh-build QA CI, paired production rollout and public release/asset gate | Authenticated production smoke with an approved test account and protected release approval |
| P0 staging | Separate Worker, D1, attachments and private backup bucket; no production records copied | Restricted pilot account provisioning and office access policy |
| P0 backups | Encrypted scheduled D1 workflow; authenticated decrypt tool; real local export/import proof; cron copies attachments to a private bucket; cleanup preserves a backup before deletion | CI service token and encryption-key configuration; remote snapshot/restore exercise; attachment restore drill; agreed retention/storage budget |
| P0 account security | Registration always creates members; 12–128 character new passwords; other-session revocation; TOTP MFA with encrypted secrets, replay protection and one-use recovery codes; expiring single-use administrator reset links that cannot bypass MFA; production MFA encryption key configured locally | Copy the MFA key into the office password vault; email identity verification or SSO; operator review of historical seeded accounts and weak existing passwords |
| P0 operations | Rate-limit bindings; privacy-safe failure codes and release IDs; admin health/feedback view; R2 cleanup outbox and retries | Alert provider, delivery/escalation route, availability monitoring and alert rehearsal |
| P1 notifications | Preferences honored, membership-scoped mentions, once-per-due-date/type reminders and task links | Transactional email channel; office timezone preference (reminders currently use UTC days) |
| P1 work retrieval | Membership filtering in SQL, bounded server search, debounce/abort/fallback, adjustable page sizes in Reviews | Full server-side list/filter pagination and load test for larger workspaces; bootstrap still includes all authorized tasks for cross-project reports |
| P1 AI reliability | Provider timeout, malformed/bounded output validation, deduplication and stable creation IDs; transactional create/audit and concurrent retry recovery | Real provider timeout/retry/live quality evaluation with an authorized key and non-confidential input |
| P1 work lifecycle | Ownership-based project management, estimates including zero, atomic task change/audit/status history, no-op history suppression, concurrent-edit conflict response | Team agreement on workflow/status semantics and estimates versus actual time |
| P1 accessibility | Keyboard/focus/escape coverage, mobile layout checks, reduced-motion loader, three browser engines, nonce-safe dynamic dialog styles | Safari/iOS on real devices and assistive-technology review |
| P2 design system | Shared fields/buttons/cards for account/project/admin forms, consistent spacing, feature-owned settings CSS, cross-route responsive checks | Remaining legacy/compatibility CSS removal only after per-page approved visual baselines; this was not mass-deleted |
| P2 reporting | Scoped sprint matching, shared-assignee estimate allocation, filter-aware CSV and formula-injection protection | Product sign-off on definitions and reconciliation against representative office data |
| P2 adoption | Existing first-project/team onboarding, getting-started/keyboard help, feedback intake and seven-day activity metrics | 5–10-person pilot, feedback triage owner, measurable adoption target and pilot sign-off |

## Verification commands

### Recorded evidence

- Fresh production build: 105 UI checks passed across Chromium, Firefox and WebKit; 27 backend/unit cases and one real local Worker/D1/R2 browser flow passed.
- Four additional release-gate cases passed: lazy JS/CSS coverage, missing lazy module, HTML masquerading as CSS, and frontend/API version mismatch.
- Real local D1 export → authenticated encryption/decryption → import into a second isolated database passed. Evidence directory: `/tmp/synqra-qa-office-NDSW8f`.
- Dependency audit: zero known vulnerabilities reported; Worker dry-run passed.
- Staging is deployed at `https://synqra-staging.ammarhisyam151.workers.dev`, Worker version `3cf62668-461a-448d-8eb9-ad3793955e74`, release `uncommitted-workspace-1438b65c8344a580`. Frontend/API match; all 28 manifest JavaScript/CSS assets returned the expected non-empty content type.
- Real staging browser flow passed: first-project/team onboarding, task assignment, estimate/status persistence, subtask/comment/upload, Kanban drag/reload and viewer invitation with editing disabled.
- The generated staging QA project was removed after verification. Its attachment was preserved in the private backup catalog; pending cleanup and recorded maintenance errors were both zero at the check. Disposable QA accounts remain in staging only.
- Login for the historical `user-erlangga` seed in this **new staging database only** was disabled. Existing production accounts were not changed.
- Production migration `0016` applied; Worker version `3368dca8-17bf-4306-8cb7-19389d945975` and Vercel deployment `dpl_5R5m1L1qsp22DebnAe2E4kLjFr2x` are live at `https://synqra-eight.vercel.app`. Both report release `664f4299d69f-workspace-1438b65c8344a580`; the public release gate checked all 28 manifest JS/CSS assets, and private bootstrap returned 401. The authenticated production workflow still needs an approved test account.
- A pre-deploy encrypted D1 snapshot passed authentication/content checks. The snapshot and 32-byte backup/MFA keys are under `/Users/mac/Library/Application Support/Synqra/production-secrets/`; files are mode 0600 and the directory is private. Copy both keys into the office password vault before this machine is replaced or cleaned.
- Daily encrypted D1 backup workflow credentials remain unconfigured. Production already has a Resend API-key secret, but its sender is unverified; no invitation email was sent. External alerts remain unconfigured. Production accounts were not edited.

`npm run verify:local` creates its own `/tmp/synqra-qa-office-*` database and local buckets. Node integration writers are serialized because Wrangler's local SQLite runtime cannot safely accept simultaneous independent CLI writers. Browser use cases still run in parallel and concurrent HTTP creation is explicitly tested.

The built UI matrix covers desktop/tablet/mobile navigation, centered create dialogs, assignee/status/priority controls, estimates, history, Kanban dragging, metadata, meetings/AI drafts, partial creation retry, expired sessions, denied storage, read-only roles, bulk selection and failure recovery. New cases cover preferences, feedback retry, password recovery and CSP violations. A separate real-backend browser case persists a task, estimate, comment, subtask, attachment and drag, then accepts a viewer invitation and verifies editing is disabled.

Unit/integration cases also cover project isolation, cross-origin rejection, malformed dates/ranges/relationships, MFA encryption and replay, recovery-code reuse, old-session revocation, expired/reused password links, MFA-preserving password reset, idempotent/concurrent task and meeting creation, scheduled reminder deduplication, cleanup failures, scoped search and encrypted backup tampering.

Staging smoke is explicitly gated to `https://synqra-staging.ammarhisyam151.workers.dev`; integration tests cannot target production. Staging QA creates only disposable `@example.test` accounts and removes its generated project on success. Those test accounts remain in staging; no production accounts are deleted.

## Configuration checklist — do not paste secrets into chat or Git

- `MFA_ENCRYPTION_KEY`: base64-encoded random 32-byte key, different for staging and production. Production Worker is configured. Store the key in an office password vault and keep the same key when restoring encrypted MFA records. Rotating it without re-enrollment locks out authenticators.
- GitHub environment `production-backup`: `CLOUDFLARE_BACKUP_TOKEN` (only required D1 export access) and `BACKUP_ENCRYPTION_KEY` (base64 random 32-byte key). Do not reuse a personal OAuth token: it expires and is not a durable service credential.
- The public repository must receive only encrypted `.sqlaes` backup artifacts. The workflow retains them for 30 days. Never upload a plaintext D1 export or local test database.
- Email: production currently has a `RESEND_API_KEY` secret, while `EMAIL_FROM` is unset and the code falls back to Resend's onboarding sender. Verify the provider/key and configure an approved office sender before relying on invite delivery. Existing manual invitation links still work. A matching account email alone is not proof of email ownership; use a supervised invitation process until verified email or SSO is connected.
- AI: configure a real `ORVIX_API_KEY` and approved `AI_MODEL`, then evaluate with synthetic notes before enabling confidential office input.
- Alerts: choose a destination and responder. The current operations view records errors but does not send external alerts.
- Review migration `0010_usernames.sql`: it historically seeds an account/password hash. Do not trust seeded/shared passwords for office launch. Provision verified administrators through operator access, disable unused seed accounts, and require stronger account-specific passwords. New public registration never grants admin privileges.

## Release procedure

1. Run local QA, dependency audit and Wrangler dry-run. Preserve evidence and inspect mobile/desktop screenshots.
2. Deploy staging with `npm run deploy:staging`. The script checks D1/R2 separation, builds fresh assets, applies staging migrations and verifies the same content-stamped release on frontend and API.
3. Run the real staging browser smoke. Resolve all failures; passing mock tests alone is insufficient.
4. For this release, took and authenticated the encrypted production D1 backup, then applied migration `0016` once through Wrangler migration tracking. Never rerun historical password-seeding migrations manually.
5. Deployed the Worker and Vercel frontend with matching release ID `664f4299d69f-workspace-1438b65c8344a580`; `npm run verify:release -- https://synqra-eight.vercel.app` passed with 28 JS/CSS assets and the unauthenticated API check.
6. An authenticated production smoke remains to be run with an approved test account: login, own assignment, task update/drag, meeting create, invite/viewer, export and account settings. Avoid creating test records in real office projects.

Uncommitted staging builds are labeled with a source-content checksum, not falsely labeled as HEAD. Vercel committed releases use `VERCEL_GIT_COMMIT_SHA`; deploy the Worker with the same `RELEASE_SHA`. Asset manifests and HTML are not cached; hashed assets remain immutable. Explicit chunk retry resolves a fresh route URL from the current build manifest, including Safari's rejected-module-cache case.

## Backup and recovery

After service credentials are configured, the D1 workflow exports and encrypts daily at 19:00 UTC (02:00 Jakarta). Cloudflare native recovery remains an additional option, not a replacement for an independently tested export.

```sh
# Supply the key securely via your environment/vault, not a CLI argument.
npm run backup -- staging
node scripts/decrypt-backup.mjs snapshot.sqlaes NEW-local-restore.sql
```

Decrypt refuses to overwrite an existing output and never imports into a remote database. A wrong key or modified ciphertext fails authentication before writing SQL. Restore into a new isolated D1 database first. Reconcile critical row counts, project permissions, relationships and attachments, then perform the browser smoke against that restored environment.

Attachments are streamed to a separate private backup bucket in batches of 20 per ten-minute cron. Failed preservation keeps source files and cleanup jobs intact. Backups are not exposed through the application's attachment-download API and are not automatically purged yet; define a retention policy and storage budget before office rollout.

For an approved real restore, stop writes, record the current deployment/D1 recovery point, validate decrypted SQL offline, and restore the selected database deliberately. Keep MFA's original encryption key. Revoke **all sessions** and **old MFA recovery codes** after restoring because a snapshot may resurrect previously consumed credentials. Reconcile/copy only missing authorized attachment keys from the private backup bucket, then validate permissions and downloads. Never reset MFA wholesale to work around a missing key. Roll forward to the matching application/schema release, reopen writes and record the recovery evidence/RTO/RPO.

## Pilot acceptance

Use 5–10 verified coworkers across owner/editor/viewer roles for one working week. Cover meeting → reviewed draft → assigned task → drag/update → done/archive/restore, invitation/access revocation and offline/error retry. Appoint one feedback owner and a backup operator. Acceptance: no unresolved P0/P1 issues, no cross-project access, no silent save failures or duplicate retry creation, successful restore drill, representative mobile/device sign-off, and a recorded adoption/feedback review. Zero observed failures is not a guarantee of zero bugs.
