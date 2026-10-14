# Microsoft SQL Server / Azure SQL provider selection

The application now accepts `DATABASE_PROVIDER=mongodb`, `sqlserver` or `azuresql`. Both SQL options share the same SQL model/query/transaction layer, schema, import/validation tools and Express routes; only the selected connection/authentication profile changes.

## Changed code

- `database/config.js`: independent `SQLSERVER_*` and `AZURE_SQL_*` profiles, Azure SQL login and Microsoft Entra default/service-principal authentication, mandatory Azure verified TLS, named SQL Server instance support, and explicit provider validation.
- `database/index.js`, `database/runtime.js`, `server.js`: both SQL providers use the same connection/model/startup path and validated-data readiness gate; production approval uses the selected profile's flag.
- `scripts/sqlserver-migrate.cjs`: target identity checks use the selected profile, preventing Azure import from accidentally using a separate SQL Server target declaration.
- `scripts/verify-provider-routes.cjs`: compares all three actual Express route registrations offline.
- `tests/sqlserver-azure.test.js`, updated parity/integration tests: provider selection, profile isolation, driver authentication mapping, TLS, named instances and target gates.
- Configuration templates: [SQL Server](../../database/sqlserver.env.example), [Azure SQL](../../database/azure-sql.env.example); instructions in [database/README.md](../../database/README.md).

## Validation

- Full suite: **207 tests; 206 passed, 0 failed, 1 skipped**. The real SQL integration test remains skipped without an explicitly configured isolated target.
- **195 identical method/path/router registrations** across MongoDB, SQL Server and Azure SQL, with zero database connections during inspection.
- Frontend checks passed; no frontend routes or fetch functions changed.
- New Azure configuration tests instantiate the installed driver's pool configuration without opening connections. They do not validate Azure tenant permissions, firewall/network access or live authentication.
- `.env`, existing database data and production traffic were not changed. No source backup, import, live SQL Server or Azure connection is claimed.

Select and configure one profile privately, migrate and validate the intended dataset on that target, run real staging read/write checks, then restart with that provider. Changing the provider does not synchronize independent databases. Recovery verification, real SQL/Azure feature parity and explicit cutover approval remain required.
