SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.AttendanceDeviceBinding',N'U') IS NULL BEGIN
CREATE TABLE [dbo].[AttendanceDeviceBinding] (
  [deviceHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AttendanceDeviceBinding] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceDeviceBinding_0_3d2050] ON [dbo].[AttendanceDeviceBinding] ([deviceHash] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceDeviceBinding_1_cd5875] ON [dbo].[AttendanceDeviceBinding] ([expiresAt] ASC);
END;
IF COL_LENGTH(N'dbo.AttendanceRecord',N'accountEventKey') IS NULL
  ALTER TABLE dbo.AttendanceRecord ADD accountEventKey NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL;
IF COL_LENGTH(N'dbo.AttendanceRecord',N'_has_accountEventKey') IS NULL
  ALTER TABLE dbo.AttendanceRecord ADD _has_accountEventKey BIT NOT NULL CONSTRAINT DF_AttendanceRecord_HasAccountEventKey DEFAULT 0;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AttendanceRecord') AND name=N'IX_AttendanceRecord_0_7309a9')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceRecord_0_7309a9] ON dbo.AttendanceRecord(accountEventKey) WHERE _has_accountEventKey=1');
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AttendanceDeviceBinding TO miu_runtime_v1;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EventRegistration') AND name=N'IX_EventRegistration_3_04b557')
  CREATE UNIQUE NONCLUSTERED INDEX [IX_EventRegistration_3_04b557] ON dbo.EventRegistration(clubId,eventRequestId,email) WHERE eventRequestId IS NOT NULL;
IF EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EventRegistration') AND name=N'IX_EventRegistration_2_539f72' AND is_unique=1)
  DROP INDEX [IX_EventRegistration_2_539f72] ON dbo.EventRegistration;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EventRegistration') AND name=N'IX_EventRegistration_2_539f72')
  CREATE NONCLUSTERED INDEX [IX_EventRegistration_2_539f72] ON dbo.EventRegistration(clubId,eventIndex,email);
COMMIT TRANSACTION;
