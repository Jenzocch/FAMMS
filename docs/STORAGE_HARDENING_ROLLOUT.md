# Storage hardening rollout

## Do not run the current public/private switch yet

`incident-photos` is currently a shared catch-all bucket, not an
incident-only bucket. Existing paths include:

- `<incident-id>/<file>` and `<incident-id>/updates/<file>` — incident evidence
- `knowledge-base/<file>` — knowledge-base images
- `areas/<file>` — area photos
- Telegram webhook uploads into incident paths

Changing the bucket to private, or applying a policy that assumes the first
path segment is an incident UUID, will break the knowledge-base and area-photo
flows. It must therefore be a staged migration, not a policy-only patch.

## Target layout

| Asset | Bucket | Object path | Access model |
| --- | --- | --- | --- |
| Incident evidence | `incident-photos` (private) | `<incident-id>/<uuid>.<ext>` | Current user may access the incident through RLS; server returns short signed URLs. |
| Knowledge-base media | `knowledge-media` (private) | `<knowledge-base-id>/<uuid>.<ext>` | Active user with read access to the KB entry; server returns short signed URLs. |
| Area media | `area-media` (private) | `<area-id>/<uuid>.<ext>` | Active factory user may read; manager+ may write. |

## Deployment order

1. Deploy server endpoints that issue short-lived signed URLs only after an
   RLS-authorized row lookup. They must reject arbitrary bucket/path input.
2. Replace every browser `getPublicUrl` / `/object/public/` consumer with the
   new signed-URL response, including detail, edit, print, knowledge-base, and
   area-management screens.
3. Move non-incident objects from `incident-photos` to their dedicated bucket
   and update database paths transactionally. Keep a reversible mapping until
   read verification passes.
4. In staging, create active, inactive, same-factory, cross-factory-assignee,
   and manager users. Verify read/upload/delete allow and deny cases for all
   three asset classes.
5. Only then make `incident-photos` private and apply per-operation Storage
   policies. Upsert needs INSERT + SELECT + UPDATE; do not grant a blanket
   `authenticated` object policy.
6. Audit and remove legacy public URLs after a bounded overlap period.

## Blocking evidence

The current repo has no Supabase project configuration or local database test
environment, so this rollout cannot safely be applied or RLS-tested here.
Use `migration_security_phase4_active_account_gate.sql` first, then run this
storage migration in staging with `supabase test db` / SQL allow-deny checks.
