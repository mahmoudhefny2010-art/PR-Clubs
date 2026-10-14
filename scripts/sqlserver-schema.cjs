const fs = require('node:fs');
const path = require('node:path');
const { catalog } = require('../database/catalog');
const { createTable, foreignKeys } = require('../database/schema');
function schemaSql() {
  const specs = catalog();
  return `-- University Clubs SQL Server schema v1. Generated from declared schemas.
-- Run only with the migration CLI against an isolated empty target database.
-- This script never creates a database, drops a table, or rewrites source data.
SET XACT_ABORT ON;
IF EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
  THROW 51000, 'Refusing schema creation in a non-empty database.', 1;
BEGIN TRANSACTION;
CREATE TABLE [dbo].[PlatformDatabaseState] (
  [id] INT NOT NULL PRIMARY KEY CHECK ([id] = 1),
  [version] INT NOT NULL,
  [validatedAt] DATETIME2(3) NULL,
  [sourceHash] CHAR(64) NULL,
  [validationReportHash] CHAR(64) NULL
);
INSERT INTO [dbo].[PlatformDatabaseState] ([id], [version]) VALUES (1, 1);
CREATE TABLE [dbo].[PlatformMigrationRun] (
  [runId] CHAR(64) NOT NULL PRIMARY KEY,
  [sourceHash] CHAR(64) NOT NULL,
  [status] NVARCHAR(32) NOT NULL,
  [startedAt] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [completedAt] DATETIME2(3) NULL
);
CREATE TABLE [dbo].[PlatformMigrationItem] (
  [runId] CHAR(64) NOT NULL REFERENCES [dbo].[PlatformMigrationRun] ([runId]),
  [model] NVARCHAR(64) NOT NULL,
  [documentId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [sourceHash] CHAR(64) NOT NULL,
  PRIMARY KEY ([runId], [model], [documentId])
);
${specs.map(createTable).join('\n\n')}
${foreignKeys(specs).join('\n')}
${require('../database/public-revisions').notificationSchemaSql()}
COMMIT TRANSACTION;
`;
}
if (require.main === module) {
  const out = path.resolve(__dirname, '../database/migrations/001-platform.sql');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, schemaSql());
  console.log('Generated database/migrations/001-platform.sql (offline; not applied).');
}
module.exports = { schemaSql };
