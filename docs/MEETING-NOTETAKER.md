# Synqra meeting notetaker — free self-hosted edition

## Delivery status and cost boundary

Implemented in Synqra's existing **Meetings** page: save an online meeting, explicitly authorize a visible bot, read its state/transcript, stop and sync, play project-private recordings, edit notes/summary, and create/revoke expiring read-only share links. Summary suggestions do not create tasks automatically.

The adapter uses [Vexa](https://github.com/Vexa-ai/vexa/tree/v0.12.27), Apache-2.0, reviewed at commit `f64a7653acdd845224f6d7de16b58c081ff7234c`. No upstream application code is copied into Synqra and no hosted/paid bot account is enabled. The reviewed release supports Google Meet and Zoom web-client bots, not the native Zoom SDK.

Software can run without subscription or paid AI APIs on an existing office computer. Electricity, hardware, internet and storage are not literally free. Do not promise an always-on free cloud server. Vercel serves the frontend; the existing Cloudflare Worker serves Synqra APIs; neither runs the long-lived bot browser.

**Live activation is not done.** Docker is unavailable on this development Mac; no engine endpoint/key has been configured. No real Zoom/Meet call has been joined or recorded. The Docker configuration is a deployment candidate, not a runtime-verified installation. Verify it on the target host before enabling capture in production.

## Local engine setup

Use a Linux Docker host or Docker-capable office machine that remains on during calls. Lite shares a display/audio stack; Synqra enforces **one active bot across the installation** with an atomic database index, including unconfirmed requests. This prevents concurrent calls mixing audio. As an initial sizing estimate, allow 8 GB RAM and free recording disk space; benchmark the actual machine. Multiple concurrent bots require a separately isolated engine architecture and a reviewed capacity migration, not removing this guard casually. A slow CPU can lag behind live speech. Never use a real customer call as the first test.

From the repository root:

```bash
node scripts/setup-notetaker.mjs
docker compose -f infra/notetaker/compose.yaml config --quiet
docker compose -f infra/notetaker/compose.yaml up -d
docker compose -f infra/notetaker/compose.yaml ps
```

The generator refuses overwrites. `infra/notetaker/private/` is gitignored (directory 0700, secret files 0600). Keep those secrets with encrypted backups of the named volumes. All images are digest-pinned to registry manifests verified during implementation. Do not blindly change tags to `latest`.

Components:

- Vexa Lite v0.12.27: bot/session engine, no Docker socket mount and no host Claude/Anthropic credentials.
- PostgreSQL 17: provider metadata, private Docker network and persistent volume. Synqra's project data remains in D1; the provider database schema is owned by Vexa.
- SeaweedFS 4.48: local S3-compatible recording storage, private bucket and random credentials. This replaces the archived MinIO community distribution in the upstream quickstart. S3 compatibility **must be tested with a real recording**; registry availability alone does not prove playback compatibility.
- Pinned `fedirz/faster-whisper-server` CPU image from Vexa's reviewed Lite recipe: multilingual `Systran/faster-whisper-tiny`, not `.en`. This legacy server's upstream moved to Speaches; upgrade only after testing the model/endpoint contract.
- Narrow Nginx gateway: only bot/transcript/recording endpoints, no admin API or debug/agent UI. Host ports 8056/8057 bind **127.0.0.1**, not all interfaces.

Model/image downloads need internet on first start and may consume several GB. No external inference API is configured. Docker image suppliers and model repositories receive those downloads, but meeting audio is sent only to your configured engine/STT service.

Vexa provisions its own scoped API key in `/run/vexa/key.env`. Use a dedicated provider identity for Synqra; do not mix other applications into the same account. Transfer the key privately to the Worker secret store (not a frontend `VITE_*` variable or a chat message). Upstream Lite can mint a new key on restart, so operators must verify key validity/revocation and synchronize it with the Worker after restarts. A persistent volume is not a key-rotation policy.

## Connect to Synqra securely

The remote Worker cannot reach a laptop's `localhost`. Use an existing TLS reverse proxy or a stable, authenticated tunnel on a hostname controlled by your office. Only route it to the narrow gateway's localhost ports. Do not publish the database, S3 store, Whisper endpoint, Vexa terminal, agent API, or debug browser. Do not use an unauthenticated Ollama endpoint or a rotating quick-tunnel URL for production.

Configure backend-only values:

| Worker value | Purpose |
| --- | --- |
| `NOTETAKER_API_URL` | HTTPS base URL of the bot gateway (port 8056 behind TLS); no query/auth credentials in URL |
| `NOTETAKER_API_KEY` (secret) | Vexa scoped bot/transcript API key |
| `NOTETAKER_SUMMARY_URL` (optional) | HTTPS base URL of the summary gateway (port 8057 behind TLS) |
| `NOTETAKER_SUMMARY_KEY` (secret, optional) | Generated bearer secret in `private/summary.env` |
| `NOTETAKER_SUMMARY_MODEL` (optional) | Local Ollama model; defaults to `qwen2.5:3b` |

The bot API URL/key are required together. URLs must be HTTPS; HTTP loopback is accepted **only** in disposable `APP_ENV=test` tests. Do not deploy `APP_ENV=test`. Add URLs to Worker configuration; use `wrangler secret put NOTETAKER_API_KEY` and `wrangler secret put NOTETAKER_SUMMARY_KEY` interactively. Never paste secrets into command arguments, logs or source. Frontend calls remain same-origin `/api`, via Vercel's existing proxy.

Apply migration `0017_meeting_notetaker.sql` to a backed-up staging database before deploying the matching Worker/frontend. API health requires schema version 17. Keep release IDs aligned; never publish an old `dist`. Promotion requires the acceptance checks below.

### Optional free local AI summaries

```bash
docker compose -f infra/notetaker/compose.yaml --profile local-ai up -d
docker compose -f infra/notetaker/compose.yaml exec ollama ollama pull qwen2.5:3b
```

Only after the private summary gateway and model respond, configure the optional Worker summary values. Local inference gets up to 25 seconds; for long notes the model sees the first 60,000 characters. Slow/unavailable/invalid model responses fall back to an explicitly labeled **extractive draft**, not a fabricated AI result. Without Ollama the application still saves notes, manually edited summaries, shares, and deterministic extractive summaries. This feature never calls the existing paid AI-draft provider.

## Runtime behavior and privacy

- Bot starts only after participant-notification/recording-permission confirmation; the bot name includes `(recording)`. The host still needs to admit it. Restricted calls, CAPTCHA, Zoom browser-join policies, and host removal can prevent capture. Do not bypass these controls.
- Atomic claims prevent double-click/retry sends and duplicate active URLs. An accepted request with an unreadable/timeout response becomes **unconfirmed** and cannot auto-retry. Admins inspect Vexa, verify exact session ID/start time, then reconnect it. This is preferable to accidentally recording twice. If the provider proves no bot exists, recovery requires an operator to mark that capture failed after verification; there is no unsafe “force retry” UI.
- Transcript/recording sync uses exact numeric provider meeting ID. Pair-addressed stop first checks that exact bot is running. Wrong-session records are not imported. Data is bounded: response 1 MB, 2,500 segments, transcript 180 KB, metadata 360 KB, 20 recording records. Oversized meetings need operator export from Vexa; they are not silently truncated and labeled complete.
- Browser refresh reads state every 30 seconds while active. Durable reconciliation uses the existing 10-minute cron; **Sync now** refreshes immediately. Do not market this as real-time streaming. Sync failures preserve saved notes/transcripts. Long-running captures need routine operator monitoring; an unknown request intentionally blocks deletion until reconciled.
- Notes/transcripts/summaries are stored in project-scoped D1. Recordings stay on the provider's persistent storage; Synqra streams authenticated media rather than exposing presigned provider URLs. A provider outage affects playback, not previously saved notes.
- Manual summaries are never overwritten by background sync. Explicit regenerate asks for confirmation. Unsaved edits must be saved first. Suggested follow-ups remain suggestions.
- Share tokens are random 256-bit values stored only as hashes. Links use URL fragments; the reader exchanges the token in a POST, not a query string. Snapshots expire in 1/7/30 days, max 5 active links per meeting, and can be revoked. Existing snapshots do not change when notes are edited.
- Public snapshot includes saved title/date/notes/summary, plus transcript **only when opted in**. It excludes join URLs/passwords, recordings, participant lists, provider IDs and project tasks. Anyone possessing the token can read the included text; the user is warned explicitly. Do not put confidential content into a public snapshot.
- Live captures block meeting/project deletion, including a database race guard. After completion, deleting Synqra data cascades its local captures/summaries/shares. **It does not delete the remote Vexa/S3 recording.** Operators must implement and verify provider retention/deletion before confidential production rollout. Do not delete a volume to remove one meeting.
- Share expiry does not physically purge its snapshot row yet. Expired links are denied; local snapshots are removed when their meeting/project is deleted. Include them in the office retention policy.

## Verification and activation gate

`npm run verify:local` uses disposable D1/R2 and an HTTP fixture based on the Vexa contract. It tests project/viewer isolation, consent/URL rejection, concurrent start, live deletion guards, stop/sync, saved manual changes, hash-only tokens, expiry/revocation, private ranged media, capacity and ambiguous-start recovery. The built frontend is checked at 1440/768/375 px in Chromium/Firefox/WebKit, plus a real Worker browser flow with the **provider fixture**. These prove Synqra integration behavior, **not** the real bot's ability to join a platform.

On the actual Docker host, before enabling production:

1. Compose validates and services start; secrets are private, external admin/debug/S3/Whisper ports are inaccessible, TLS gateway works with the dedicated key.
2. Host an authorized Google Meet test: send exactly one visible bot, admit it, speak Indonesian/English, verify transcript/speaker/times, stop it, sync terminal state and play recorded audio after restarting the stack.
3. Repeat in Zoom with a valid passcode and browser joining allowed; reject/missing admission and removed-bot cases show accurate states, never fake success.
4. Inspect recording bytes on the S3-compatible store; exercise Range seeking and provider restart. Confirm local storage compatibility, disk limits, backup/restore and retention/deletion.
5. Pull the optional model, test a factual summary and timeout fallback; validate that it does not invent owners/deadlines. Review manually before sharing.
6. Verify member/viewer/outsider access, public transcript opt-in, link expiry/revoke, manual edits surviving sync, duplicate-start prevention, and an interrupted request's operator recovery.
7. Stage migration/release, test stale-client recovery, and deploy matching fresh frontend/API only after the above passes. There is no honest “0 bugs guaranteed” claim; keep the bot disabled if any gate fails.

## Third-party references

- [Vexa v0.12.27 source and license](https://github.com/Vexa-ai/vexa/tree/v0.12.27), [Lite deployment contract](https://github.com/Vexa-ai/vexa/blob/v0.12.27/deploy/lite/README.md) — Apache-2.0.
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs/tree/4.48), [mini command](https://github.com/seaweedfs/seaweedfs/blob/4.48/weed/command/mini.go) — Apache-2.0.
- [Speaches (formerly faster-whisper-server)](https://github.com/speaches-ai/speaches) and [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — preserve upstream licenses/notices when redistributing images/models.
- [Ollama](https://github.com/ollama/ollama) — engine and individual model licenses must both be retained; no code is vendored here.

The stack is separate from Synqra's frontend bundle. Retain all licenses/notices included in upstream images when redistributing; pin and re-review upgrades.
