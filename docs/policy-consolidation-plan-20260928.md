# FAMMS authoritative policy consolidation and release plan

Status: inventory verified on production; consolidation NOT applied; release blocked on identity/factory decisions and integration acceptance.

## Verified target and evidence

- Supabase `smthbomkbaywovzddnhj`, FAMMS, main production, a0811273738's Org.
- Source changes pushed as `7667f73` on `codex/shared-tablet-mobile-ux`; production `main` was not updated.
- Latest source checks: ESLint on changed report components, TypeScript, production build and diff whitespace check passed. `npm audit --json` on this lockfile reported 0 vulnerabilities. GitHub's push warning (66 default-branch alerts) is a separate signal, not dismissed as resolved by that result.
- Live read-only SQL Editor inventory captured all public policies, storage.objects policies, public table columns/RLS flags, security-definer helpers, public/auth.users triggers, core constraints, required columns and public view options/ACLs. No employee/work-order content was exported; a scoped roster lookup read names/IDs/factory bindings needed for this feature.

## Verified defects, not hypothetical risks

1. `profiles`, `incidents`, `pm_schedules`, incident children and audit tables retain overlapping permissive policy families. `profiles_read` and `pm_schedules_read` allow unrestricted SELECT; `incidents_insert` and `audit_logs_insert` have `WITH CHECK (true)`.
2. `audit_logs`, `incident_types`, `incident_updates`, `maintenance_logs` still have RLS disabled. Anon table grants were previously revoked, but authenticated clients are still unrestricted on these tables.
3. `app_role`, `app_factory`, `app_can_access`, incident/PM assignee helpers ignore `is_active`. Disabling an account does not stop an already-issued JWT.
4. Assignee exceptions permit unrestricted incident/child mutations unless field/identity guards constrain them. Technician assignment is intentionally allowed by the application: do not silently remove self-organizing assignment. Preserve that workflow with explicit scope and assignee validity checks.
5. Profile trigger protects role/active/factory/custom_role but not `is_shared_device`; a client could change the device classification unless guarded.
6. `audit_logs` client inserts accept actor, factory, old/new data and timestamps without authoritative mutation linkage. Move browser audit production to database mutation triggers; retain explicit trusted server logging. Remove redundant browser requests before revoking direct INSERT.
7. `incident_audit_trail` was a definer view over audit_logs with anon/authenticated SELECT, no security_invoker option. Anonymous view access bypassed the prior table containment. Separate minimal view containment was applied through SQL Editor on the verified production target: an actual anon-role negative SELECT test passed, anon SELECT is now false, authenticated SELECT is still true, and all authenticated/service_role privileges were asserted unchanged. Recorded in `20260928150359_production_audit_view_lockdown.sql`; not registered in CLI migration history. No business rows were read or changed by this test. Authenticated view/RLS hardening remains unfinished.
8. Storage has broad legacy authenticated write/delete policies. Incident-photo namespace policies must follow accessible incident IDs; KB and area namespaces use their own role gates. Attachments require an explicit consumer/ownership model. Existing public photo URLs remain public until a separate signed-URL migration is accepted.
9. Task identity/assignee trigger from phase 6 is absent in the inspected trigger inventory. Existing verification gate alone is insufficient.

## Identity prerequisite: requires owner decision

- Rudi, Suwardi and Wiwit each have one exact matching active technician profile; all three have `factory_id = NULL` and are not shared-device accounts.
- No exact full-name match for Pak Dasir. This does not establish that he has no account or authorize alias inference/new-account creation.
- Confirm whether these technicians are factory-bound or intentionally work across factories, the tablet factory, and Pak Dasir's existing account. Do not silently assign factories or turn NULL into blanket cross-factory access.
- Dedicated tablet identity/credentials must be provisioned separately; performer names never substitute for verified auth identities.

## Implementation order and acceptance

1. Resolve identity/factory decisions. Record policy inventory and prior definitions/ACLs as rollback evidence; do not grant anon access in rollback.
2. Generate one authoritative migration using `supabase migration new`. Require expected schema/table list and fail on unreviewed drift. Replace all duplicate policy families for affected tables, not just the newest names. Enable RLS and set least-needed table/column grants in the same transaction.
3. Harden active-profile helpers and old helper aliases; pin search_path and verify PUBLIC/anon EXECUTE denial. Retain null-factory supervisor cross-factory semantics and explicit active cross-factory assignee reads.
4. Add actor/ownership/immutable-scope guards for incident inserts, timeline writes, profile changes, tasks and PM records. Separate child INSERT/UPDATE/DELETE instead of generic FOR ALL. Preserve deliberate technician assignment UX with checked assignee identity and scope.
5. Replace browser audit inserts with authoritative mutation-linked records, then deny browser INSERT/UPDATE/DELETE. Make the audit view security_invoker and verify authenticated scope.
6. Consolidate Storage namespace policies with both USING and WITH CHECK. Do not introduce a catch-all authenticated fallback. Public bucket confidentiality is a distinct migration, not fixed merely by database RLS.
7. Replay the migration and tablet foundation against a schema-faithful isolated test database. If using production rollback fixtures, first inspect all relevant triggers for non-transactional external effects, use unique synthetic IDs, timeouts, and end the entire fixture/DDL transaction with ROLLBACK. Preserve raw results; no persistent test identities/business rows.
8. Bind the confirmed real profile IDs/factory; require admin-owned enabled tablet and active same-factory roster. Verify service-role-only RPC ACLs, no direct grants on tablet tables, idempotency and immutability.
9. Build a new candidate from the exact validated commit. Test browser → API → persisted data → UI across phone/tablet/desktop, including personal login/reporting. Only then merge/push main or promote the exact production-configured candidate and smoke-test custom domain.

## Required test matrix

| Identity / path | Must succeed | Must fail |
| --- | --- | --- |
| anon | intended public photo reads only | table/view/RPC reads and writes; inherited PUBLIC helper EXECUTE |
| inactive JWT | safe disabled-account UI | all operational CRUD, assignee exceptions, private storage and uploads |
| factory technician | own-scope report, allowed progress, PM, checked assignment | cross-factory enumeration, identity spoofing, scope move, due-date/close/reopen, forged audit, timeline edits/deletes |
| assigned cross-factory technician | assigned incident, required machine/children, allowed progress | unrelated target-factory rows, re-parenting, unauthorized scope/ownership changes |
| local supervisor | same-factory supervisor workflows | unassigned other-factory access |
| NULL-factory supervisor | intentional cross-factory supervisor workflows | true-admin account management |
| manager / director / admin | independently verify documented role-specific scope | manager/director gaining true-admin rights or broader master writes than intended |
| shared tablet | valid device/roster progress, same-payload retry | disabled/wrong device, wrong factory, non-roster/inactive performer, duplicate performer, mismatched retry payload, closed case, client direct writes |
| inventory assertions | intended policies exactly once per operation, correct RLS and ACLs | leftover broad families, definer-view bypass, public helper exposure, new unreviewed tables |

Expected-denial tests must assert SQLSTATE or affected-row count, not merely lack of UI controls. JWT-context database tests do not replace real browser/session/API tests. Build success is not release acceptance.

## References

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- PostgreSQL permissive/restrictive policy semantics: https://www.postgresql.org/docs/current/sql-createpolicy.html
- `docs/production-deployment-gate-20260928.md` records the previous production containment and outstanding acceptance work.
