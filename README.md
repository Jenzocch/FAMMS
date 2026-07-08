# FAMMS — Factory Asset & Maintenance Management System

Equipment maintenance management for multi-factory operations (SJA, DIN, Olentia): incident/工單 tracking with a multi-action repair workflow, preventive maintenance scheduling, equipment health scoring, a standardized fault tree for repeat-failure detection, a knowledge base, and Telegram notifications. UI is in Bahasa Indonesia + English technical terms; the app itself is fully localized in Chinese, English, and Indonesian.

## Tech stack

Next.js 16 (App Router) + TypeScript · Tailwind CSS v4 + shadcn/ui (`@base-ui/react`) · Supabase (Postgres + Auth + Storage) · Telegram Bot API · Recharts-free custom KPI views.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in the values, see below
npm run dev                  # http://localhost:3000
npx tsc --noEmit             # type check, should exit 0
```

## Database setup (Supabase)

Run these in the Supabase SQL editor, in order:

1. `supabase/schema.sql` — base tables, 3 factories, level-1 failure categories
2. `supabase/SYNC_SCHEMA_LATEST.sql` — **idempotent, run after every `git pull`**. Adds every column/table a newer feature expects; skipping it makes features silently fail to save or show.
3. `supabase/seed_fault_tree.sql` — subcategories + 100+ failure codes (zh/en/id)
4. (optional) `supabase/seed_demo.sql` — demo areas/machines for local testing

Then create two Supabase Storage buckets: `incident-photos` (public) and `attachments` (private).

## Environment variables

See `.env.example` for the full list with descriptions. At minimum you need Supabase URL + anon key + service role key to run the app; Telegram, OpenAI, and the external-integration secrets are optional depending on which features you use.

## Project docs

- `CLAUDE.md` — full architecture, data model, incident workflow, and file map (the canonical reference for AI assistants and contributors)
- `FAMMS_FAULT_TREE.md` — complete failure-code taxonomy
- `docs/` — feature-specific setup notes (Gudang One integration, E2E checklist)
- `CHANGELOG.md` — release history

## Deployment

Deploys to Vercel from `main`. Set the environment variables from `.env.example` in the Vercel project settings, then run the Supabase setup steps above against your production project before the first deploy.
