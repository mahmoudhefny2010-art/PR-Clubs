# Provider parity follow-up

The requested contract is one frontend and one set of Express routes, fetch calls, IDs, response formats and business rules, with the selected database supplying persistence. Selecting SQL Server does not copy the MongoDB dataset; use the explicit migration workflow to populate and verify it first.

## Changes

- Both provider startup paths now use `database/cache-snapshot.js`, preserving the same legacy club sort order, pinning, staff role and committee interpretation.
- ID-only projections now return only `_id`; this avoids exposing other account fields in SQL results where Mongo would return only an identifier.
- SQL filter values now use the same schema query casting/trim/lowercase behavior as MongoDB queries.
- SQL reports consume backpressured row streams instead of failing after 20,000 input records. Incremental grouping retains results and accumulator state, preserving the existing public media, membership, feedback and attendance report expressions.
- Large homogeneous membership lists use a JSON parameter and SQL `OPENJSON`, avoiding the query parameter limit for large attendance/account ID lists.
- `scripts/verify-provider-routes.cjs` compares actual Express registrations in both modes without connecting to either database; it verifies 195 identical method/path/router registrations.
- `scripts/verify-database-api-parity.cjs` compares expected statuses and JSON GET responses from two explicit staging applications; array order and saved record values remain significant. It rejects matching outages and login HTML. It never prints cookies or response values.
- Added parity regression tests for the above behavior, including more than 20,000 streamed records and 2,500-member ID filters.

## Evidence and limits

Actual route registration parity passed and is recorded in [provider-routes.json](provider-routes.json). Frontend checks passed and Git reports no changes under `frontend/` or `public/`. Offline parity tests use source fixtures, schema casting, mock SQL streams and mock HTTP responses; they do not prove that Microsoft SQL Server has executed the generated SQL or that production records have been copied.

Final full test suite: **200 total; 199 passed, 0 failed, 1 skipped**. The skipped test requires an explicitly configured isolated SQL Server instance. The 11 new parity tests passed, including complete totals beyond the former row cutoff and large ID-list compilation. `git diff --check` passed; the refreshed source inventory accounts for 239 source files and the same 30 models/539 schema paths.

No production database was modified, `.env` was not changed, and MongoDB remains selected. A real SQL Server staging connection, verified source backup/restore, actual import and full read/write feature verification remain necessary before declaring complete live parity. Operational commands and unresolved performance/data-shape issues are documented in [database/README.md](../../database/README.md).
