# Changelog

All notable changes to FAMMS are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.0] — 2026-07-08

First tagged snapshot. FAMMS has been under active development across several
sessions without version tags; this entry summarizes the system as of this
tag rather than a single release's diff.

### Core
- Multi-tenant factory/area/machine master data (SJA, DIN, Olentia), machine QR codes
- Standardized fault tree (100+ failure codes, zh/en/id) for repeat-failure detection without false positives
- Incident management: multi-action repair workflow, assignment (incl. vendor roster), progress timeline, audit trail, repeat-failure and RCA triggers
- Preventive maintenance: recurring schedules, full calendar view, due-list, checklist tick-off on completion, ad-hoc maintenance logging
- Equipment health scoring (0–100, failure/downtime/repeat/PM-overdue weighted)
- Knowledge base captured at incident close, searchable
- Monthly report (print + Excel export), close-time labor/parts cost capture
- QR-code scan-to-report flow
- SLA auto-escalation (daily cron) + Telegram notifications (incident alerts, reminders, daily summary)
- Gudang One warehouse integration: parts requests pushed on send, local read-only status tracking, write-back endpoint for status updates
- External read-only `machine-status` endpoint for QC/FQMS integration
- Full zh/en/id UI localization with locale-aware dates

### Security
- Staged Row-Level-Security migrations, assignee-access policy, phase 1/2 hardening (anon revoke, privilege-escalation guard)
- Auth checks on notification endpoints, Telegram webhook origin verification, HTML-escaped Telegram alert content

### Known gaps
- No KPI chart library wired into the dashboard yet (data is present; visualization is tabular/summary only)
- Some large components (`PMFullCalendar.tsx`, `IncidentForm.tsx`) are due for a split — tracked separately, not a functional gap
