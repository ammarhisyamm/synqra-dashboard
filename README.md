# Synqra Dashboard

Functional project-review dashboard modeled after the Synqra dashboard reference.

## Included

- Dashboard: attention queue, stage progress, activity, meetings, and project summary.
- All Reviews: search, area filters, stage changes, assignment display, and archiving.
- Meetings: note capture and client-side action-item suggestions.
- Kanban: move items between workflow stages and archive work.
- Archive: restore items.
- Cloudflare D1 persistence for reviews and meetings, browser fallback, JSON export, and demo-data reset.

## Local development

```bash
npm install
npm run dev
```

## Deploy to Cloudflare

```bash
npm run deploy
```

The deployment uses Cloudflare Workers Static Assets, a D1-backed `/api` layer, and SPA routing.
