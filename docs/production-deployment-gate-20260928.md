# FAMMS production deployment gate — 2026-09-28

## Target and release state

- Supabase: `smthbomkbaywovzddnhj`, FAMMS, `main` production, a0811273738's Org. Verified through the connected owner browser.
- Vercel: `wnsb-system/famms`, project `prj_hkKgArUwMT9BbUi92RYsdloKltAN`.
- Candidate: `dpl_Gz9mfMu4YqCkLvnBCKhA8rt99ip8`, https://famms-2vtp0rrzz-wnsb-system.vercel.app. Cloud build and unauthenticated login rendering passed. Candidate is a dirty-worktree upload based on `be95098`, not a new Git commit.
- Custom production domain was verified on the previous deployment during staging; no promotion was performed in this audit.
- At the initial audit snapshot, no commit/push, tablet migration, tablet account provisioning, or roster activation had been performed. Subsequent source push and containment status are recorded below.

## Verified live metadata

Read-only SQL was executed in the FAMMS SQL Editor. The query uses catalog metadata, not employee or work-order contents.

- `profiles.is_shared_device`: boolean, NOT NULL, default false, already present.
- `incident_updates.id`, `incident_id`, `updated_by_id`: UUID. `shared_device_id` and `request_id` absent.
- `shared_devices`, `shared_device_roster`, `incident_update_performers`, and `create_shared_tablet_update(uuid,uuid,uuid,uuid,text,uuid[])`: absent.
- RLS disabled on `audit_logs`, `incident_types`, `incident_updates`, `maintenance_logs`.
- Before containment, each of these four tables gave both `anon` and `authenticated` effective SELECT, INSERT and UPDATE privileges.
- `app_can_access`, `app_factory`, and `app_can_access_incident` are SECURITY DEFINER helpers that do not check `profiles.is_active`. The inspected helper EXECUTE grants deny anon and permit authenticated.
- Duplicate permissive policy families are deployed. Changing one family is not sufficient because permissive policies combine with OR.
- `profiles_read` allows authenticated SELECT with `USING (true)`.
- `incidents_insert` allows authenticated INSERT with `WITH CHECK (true)` alongside the factory-scoped `incidents_ins` policy.
- `incident_updates_rw` checks whether its parent incident is visible, alongside `incident_updates_sel/wr`.

## Applied emergency containment

`supabase/migrations/20260928142222_production_anon_table_lockdown.sql` was executed through the SQL Editor on the verified production target. This is a recorded SQL change; it was NOT registered in Supabase CLI migration history.

The transaction revokes all table privileges from `anon` on exactly the four RLS-disabled tables. It asserts no inherited or column-level anon privileges remain, and compares all authenticated/service_role table privileges before and after. Any failed assertion aborts the transaction.

Post-commit catalog results for all four tables:

| Table | anon SELECT/INSERT/UPDATE/DELETE | authenticated SELECT/INSERT/UPDATE | service_role SELECT | RLS |
|---|---|---|---|---|
| audit_logs | false/false/false/false | true/true/true | true | false |
| incident_types | false/false/false/false | true/true/true | true | false |
| incident_updates | false/false/false/false | true/true/true | true | false |
| maintenance_logs | false/false/false/false | true/true/true | true | false |

No business rows, authenticated privileges, policies, or RLS flags were changed. This closes the demonstrated signed-out access path on these four tables; it does NOT fix authenticated cross-factory access, disabled-account access, RPC/view bypasses, or all project security warnings. Do not roll back by granting anonymous access again.

An actual `SET LOCAL ROLE anon` negative SELECT test was also executed: dynamic `SELECT 1 FROM public.<table> LIMIT 0` on each table raised `insufficient_privilege`, as expected. The transaction was rolled back; the SQL Editor returned `PASS: actual anon SELECT denied on all four tables; no business rows read or changed`. Write denial was verified through effective table and column privilege assertions, not by issuing real production INSERT/UPDATE/DELETE requests. No actual-user reporting smoke test was completed: the browser tab acquisition timed out. Unchanged grants are not an end-to-end functional acceptance result.

## Required before tablet promotion

1. Capture all relevant policy families, helper definitions, profile/incident field-guard triggers and grants; retain intentional cross-factory assignee visibility.
2. Consolidate every permissive policy family rather than applying the existing active-account migration blindly. In particular, remove or constrain `profiles_read` and `incidents_insert` and review authenticated writes to the four currently RLS-disabled tables.
3. Test active personal technician, supervisor and admin allow-paths; disabled accounts, cross-factory access, spoofed actor, and anonymous access deny-paths. Use an isolated staging database or a transaction-rollback fixture harness with no persistent business writes.
4. Validate the tablet foundation migration on the verified schema; apply only once, atomically; verify table RLS/grants, RPC grants, device/factory/roster validation and idempotency.
5. Revised 2026-09-29: use independent, stable performer roster IDs for the four names; no personal account is required. Configure explicit device factory allowlists for cross-factory work. Preserve the verified device actor separately from declared performers. See the name-roster revision plan.
6. Verify personal reporting and shared tablet progress end-to-end on phone/tablet/desktop, then promote the exact validated Vercel artifact and smoke-test the custom domain.

Release acceptance is blocked by missing security integration tests and tablet schema/RPC acceptance, not by browser connectivity. Do not treat the cloud build, a Healthy database, or existing SQL files as production acceptance.

## Follow-up: source push, view containment and identity decision

- Source commit `7667f73` was pushed to `codex/shared-tablet-mobile-ux`; main remains `be95098`. This was not a production promotion.
- `npm audit --json` on this checkout's lockfile reported 0 vulnerabilities. GitHub's push warning still reported 66 default-branch alerts; that signal requires separate triage and is not presented as resolved by npm audit.
- Full read-only catalog inspection identified `incident_audit_trail` as a definer view over `audit_logs`, with anon SELECT despite the earlier base-table revoke.
- Equivalent SQL recorded in `supabase/migrations/20260928150359_production_audit_view_lockdown.sql` was executed and committed in the verified production SQL Editor. The same transaction asserted authenticated/service_role privileges unchanged, then ran an actual anon-role `SELECT ... LIMIT 0` negative test. Result: `PASS: actual anon SELECT denied; authenticated/service_role privileges unchanged`, anon SELECT false, authenticated SELECT true. No business rows were read/changed. CLI migration history was not updated.
- This is minimal anonymous containment only. Authenticated view access, duplicate policy consolidation, RLS activation, browser audit integrity, Storage, field/actor guards and full acceptance remain unfinished.
- Scoped exact-name roster lookup found active technician profiles Rudi, Suwardi and Wiwit, all with NULL factory_id; Pak Dasir had no exact full-name match. Owner must confirm intended factory/cross-factory scope and Pak Dasir's actual account before activation. Do not guess identity or broaden NULL-factory technician access.
- See `docs/policy-consolidation-plan-20260928.md` for the verified policy findings, business-rule dependencies and explicit allow/deny test matrix reviewed independently by Terra.

## 2026-09-29 clarified roster requirement

Owner confirmed cross-factory work and no individual technician accounts. The prior Pak Dasir account/factory clarification is no longer a blocker and must not trigger account creation or personal profile changes. Local implementation is being revised to independent roster identities and explicit device factory allowlists. Security policy consolidation, actual database allow/deny tests and authenticated responsive UI acceptance still block production promotion; this clarification does not resolve those gates.
